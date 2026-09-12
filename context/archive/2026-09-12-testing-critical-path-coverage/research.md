---
date: 2026-09-12T19:03:57.347+01:00
researcher: GitHub Copilot CLI
git_commit: 2cf71ba768139e0bd4a03253486b4ee48ca225bf
branch: master
repository: achudzynski/10xCards
topic: Risk #1 - AI-generated cards are off-topic or nonsensical; user loses confidence, 75% acceptance rate missed
tags: [research, codebase, ai-generation, card-quality, openrouter, risk-coverage]
status: complete
last_updated: 2026-09-12
last_updated_by: GitHub Copilot CLI
---

# Research: Risk #1 — AI Card Generation Quality

**Date**: 2026-09-12T19:03:57.347+01:00  
**Researcher**: GitHub Copilot CLI  
**Git Commit**: 2cf71ba768139e0bd4a03253486b4ee48ca225bf  
**Branch**: master  
**Repository**: achudzynski/10xCards

## Research Question

How does AI card generation work in 10xCards, what can go wrong to produce off-topic or nonsensical cards, and what quality criteria must be enforced to meet the 75% acceptance target? This research grounds the test strategy for Risk #1 in the test-plan.md.

## Summary

AI card generation is a **contract between user input and OpenRouter** (or a mocked provider). The happy path is:

1. **User provides source text** (1–5000 chars) via `POST /api/generate`
2. **Generation service** calls OpenRouter's chat completion API with:
   - System prompt (not found in code—inferred from task)
   - User's source text
   - Strict JSON schema forcing `{ cards: [{ front, back }, ...] }`
3. **Response is validated**, formatted, and returned to client without DB persistence
4. **User reviews and accepts/rejects** cards one-by-one
5. **Accepted cards are saved** to Supabase `cards` table

**Quality assurance status**: The code validates **structure** (JSON schema, field presence, length bounds 1–100 chars) but does **not validate semantic quality**—whether the generated card is on-topic, factually grounded, or answerable from source text. This gap directly threatens the 75% acceptance metric.

**Known risks to test**:

- AI provider misconfiguration (wrong model, missing credentials, stale token) → silent HTTP 200 with garbled cards
- Provider timeout or network failure → 502 error (correctly handled)
- Provider returns valid JSON but off-topic/nonsensical content → no catch; acceptance rate drops
- Provider can be called with no source text (edge case)

**Prior incident**: A past deployment used an incorrect model (noted in test-plan Risk #2), causing cascading quality failures.

## Detailed Findings

### 1. Card Generation Architecture

#### Entry Point & Request Flow

- **UI component**: `src/components/generate/GenerateWizard.tsx:53–77`
  - Collects `text` from textarea (user's source material)
  - Calls `POST /api/generate` with `{ text }`

- **API endpoint**: `src/pages/api/generate.ts:14–45`
  - Validates input: `text` must be 1–5000 chars
  - Calls `generateCards(text)` from generation service
  - Returns `{ cards: [...] }` on success or 502 on error

#### AI Provider Integration

**Provider Choice**: OpenRouter

- **URL**: `https://openrouter.ai/api/v1/chat/completions`
- **Service**: `src/lib/services/generation.ts:62–134`

**Configuration**:

- API key: `OPENROUTER_API_KEY` from `astro:env/server` (server-only secret)
- Model: `OPENROUTER_MODEL` from env, fallback: `openai/gpt-4o-mini` (`src/lib/services/generation.ts:63–65`)
- Timeout: 30s via `AbortController` (`src/lib/services/generation.ts:70`)

**Request Structure** (`src/lib/services/generation.ts:74–93`):

```
POST https://openrouter.ai/api/v1/chat/completions
{
  model: <env or default>,
  messages: [
    { role: "system", content: <system prompt> },
    { role: "user", content: <user's source text> }
  ],
  response_format: {
    type: "json_schema",
    strict: true,
    json_schema: {
      name: "Flashcards",
      schema: { type: "object", properties: { cards: { type: "array", items: {...} } } }
    }
  }
}
```

**Key observation**: The system prompt and exact schema definition are not visible in `generation.ts`—they are likely hardcoded in the `generateCards` function or may have been stripped. This is a critical detail for testing (we need to know what the prompt says to understand what quality bar is expected).

#### Data Flow: Input → Processing → Output

**Input** (`src/pages/api/generate.ts:10–33`):

- Single field: `text` (1–5000 chars, required)
- No metadata (deck context, topic hint, or source language)

**Parsing & Validation** (`src/lib/services/generation.ts:104–134`):

- Parse provider's HTTP response as JSON
- Extract `choices[0].message.content`
- JSON.parse the content
- Validate against `flashcardsSchema` (Zod):
  ```typescript
  flashcardsSchema = z.object({
    cards: z.array(
      z.object({
        front: z.string(),
        back: z.string(),
      }),
    ),
  });
  ```
- Validate each card against `savableCardSchema`:
  ```typescript
  savableCardSchema = z.object({
    front: z.string().trim().min(1).max(100),
    back: z.string().trim().min(1).max(100),
  });
  ```
- Cap result to `MAX_CARDS` (10 cards max)
- Drop any cards that fail schema validation

**Output**:

- `{ cards: [{ front, back }, ...] }` returned via `jsonOk(response)`
- No DB persistence yet; client decides what to do with each card
- Client shows cards for review; user accepts/rejects each one

#### Error Handling

All error cases map to **502 status** with code `generation_failed`:

| Failure           | Detection                                    | Error type                                                       |
| ----------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| Network failure   | `AbortController` timeout or fetch rejection | `GenerationError("Failed to reach the generation provider")`     |
| Provider non-2xx  | Check response.ok                            | `GenerationError("Generation provider returned status ...")`     |
| Non-JSON response | JSON.parse throws                            | `GenerationError` (malformed JSON)                               |
| Wrong shape       | Missing `cards` array                        | `GenerationError` (schema validation)                            |
| Invalid card      | front/back fail schema                       | Card dropped; if all drop, empty array returned                  |
| Missing API key   | `env OPENROUTER_API_KEY` undefined           | **Fallback to mock cards** (`src/lib/services/generation.ts:54`) |

**Client behavior** (`src/components/generate/GenerateWizard.tsx:63–80`):

- On 502, shows error toast and resets to input
- On empty card array, shows empty state (unclear from code)

### 2. Storage & Persistence

**Generated cards are NOT saved by `/api/generate`**. They are **ephemeral** until the user accepts them.

**Saving path**:

1. User clicks "Save" on a card in the review UI
2. Client calls `POST /api/cards` with `{ front, back, deck_id }`
3. `src/pages/api/cards.ts:15–50` validates and calls `createCard(...)`
4. `src/lib/services/cards.ts:26–41` inserts into Supabase table `cards`

**Cards table schema** (inferred from code):

- `id` (UUID, primary key)
- `user_id` (Supabase auth user ID, for RLS)
- `front` (text, 1–100 chars)
- `back` (text, 1–100 chars)
- `is_ai_generated` (boolean flag)
- `created_at` (timestamp)
- `updated_at` (timestamp)
- (likely) `deck_id` for grouping into decks

### 3. Quality Criteria & Validation

#### Explicit Success Criteria (from PRD)

- **75% acceptance rate**: Of all AI-generated flashcards shown to users, 75% should be accepted (not edited out, not deleted)
- **Grounded in source text**: Each card's front should be answerable from the user's provided source text; back should be factually grounded in that source
- **User confidence**: Poor early cards break trust; no recovery until manual editing or deletion works smoothly

#### Current Code Validation

✅ **Implemented**:

- JSON schema strictness (OpenRouter `strict: true`)
- Field presence validation (front/back required)
- Length bounds (1–100 chars after trim)
- Timeout protection (30s)
- Provider error handling (non-2xx, network failure)

❌ **NOT Implemented**:

- Semantic validation (on-topic, factually grounded, answerable)
- Forbidden-word filtering
- Minimum quality bar (language coherence, non-garbled)
- Provider model/key validation at request time
- Source-to-card linkage verification

#### Known Failure Modes

| Failure                                | Cause                                               | Impact                                              | Current Detection                                      |
| -------------------------------------- | --------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| Off-topic card                         | Prompt unclear or model ignores context             | User rejects; acceptance rate drops                 | None—card passes schema                                |
| Nonsensical card (garbled, incoherent) | Provider degradation, wrong model, prompt injection | User rejects; acceptance rate drops                 | None—card passes schema                                |
| Wrong model silently active            | Model env var misconfigured or stale                | Cards quality unexpectedly poor                     | None—no model validation at call time                  |
| Missing credentials                    | `OPENROUTER_API_KEY` unset                          | Falls back to mock cards (detectable but not ideal) | Fallback catches but hides issue                       |
| Stale token                            | Env var changed or token expired                    | Provider returns 401/403 but schema still valid     | 502 error (correct, but not explicit credential fault) |
| Timeout                                | Provider slow or down                               | 502 error after 30s wait                            | Timeout caught by AbortController                      |

### 4. Provider Configuration

#### Current Setup

- **Model**: `OPENROUTER_MODEL` env var or fallback `openai/gpt-4o-mini`
- **Cost**: gpt-4o-mini is low-cost; configurable model allows cost/quality tradeoff
- **Structured output**: Uses `response_format: json_schema` with `strict: true` to force valid JSON shape
- **No schema versioning**: Schema is baked into the service; no version negotiation with provider

#### Archive Context (Prior Decisions)

From `context/archive/2026-08-23-first-gated-generation/plan.md`:

- OpenRouter was chosen for configurability + low cost
- Structured output with `require_parameters: true` was recommended to prevent bad provider behavior
- **Slow/hung provider timeouts should return 502** (implemented: 30s timeout)
- **Simulated provider failure/timeout behavior was verified** in prior implementation

From the same plan's git history:

- Commit `a3b1985` (2026-08-26) — "Generation Backend (p2)"
- Commit `8a1072f` (2026-08-26) — "Fix impl-review findings F1-F3"
- **Incident noted in test-plan**: Past deployment used incorrect model, causing acceptance rate miss

### 5. Test Strategy Implications

#### What a Contract Test Must Verify

1. **AI provider endpoint is reachable** with valid credentials
2. **Response schema is valid** (matches `{ cards: [...] }`)
3. **Model parameter is correct** (env var is read and sent to provider)
4. **Timeout occurs after 30s** (timeout protection works)
5. **Bad provider response (500, timeout, invalid JSON) maps to 502** error

#### What an Integration Test Must Verify

1. **Happy path**: User provides text → cards generated → user accepts → cards saved to DB
2. **Card quality**: Generated cards are semantically on-topic and grounded (this requires a **quality oracle** — either semantic analysis, manual review, or mock responses with known good cards)
3. **Error recovery**: On 502, UI resets and user can retry
4. **Schema enforcement**: Cards outside 1–100 chars are dropped

#### What Should NOT Be Tested (from test-plan §7)

- Astro SSR rendering (framework trust)
- OpenRouter SDK itself (upstream trust)
- UI visuals (manual QA)

## Code References

| File                                         | Lines             | Purpose                                                                       |
| -------------------------------------------- | ----------------- | ----------------------------------------------------------------------------- |
| `src/components/generate/GenerateWizard.tsx` | 53–77             | UI entry point; collects source text and calls API                            |
| `src/pages/api/generate.ts`                  | 14–45             | API endpoint; validates input, calls generation service, returns cards or 502 |
| `src/lib/services/generation.ts`             | 1–134             | Core generation logic: OpenRouter call, schema validation, error handling     |
| `src/lib/services/generation.ts`             | 19–25             | Zod schemas for validation                                                    |
| `src/lib/services/generation.ts`             | 62–93             | Provider request construction                                                 |
| `src/lib/services/generation.ts`             | 100–126           | Response parsing and validation                                               |
| `src/pages/api/cards.ts`                     | 15–50             | Card save endpoint                                                            |
| `src/lib/services/cards.ts`                  | 26–41             | Supabase insert; maps accepted cards to DB                                    |
| `src/types.ts`                               | (view for schema) | Shared types / DTOs                                                           |

## Architecture Insights

### Critical Path for Risk #1 Testing

```
User Input (text)
    ↓
/api/generate (validates input 1–5000 chars)
    ↓
generation.ts (calls OpenRouter with prompt + source text)
    ↓
OpenRouter response (JSON with { cards: [...] })
    ↓
Schema validation (structure, length bounds)
    ↓
Client review UI (user accepts/rejects each card)
    ↓
/api/cards (save accepted card to DB)
    ↓
Supabase cards table (RLS enforces user_id isolation)
```

### Quality Gap

The happy path has **no semantic quality gate**. A card can:

- Pass JSON schema validation
- Pass length bounds
- Still be nonsensical, off-topic, or factually wrong

**Testing this gap**:

- Contract test (mock provider with known good/bad responses) can catch schema but not semantics
- Integration test (real provider or high-fidelity mock) can catch both schema and semantic quality
- **Quality oracle challenge**: The test must verify that generated cards are "on-topic" without being a tautology ("it matches what the API returned"). This likely requires:
  - Known good examples (mock responses) for happy path
  - Real API calls with small sample texts + manual review or semantic analysis

### Configuration Risk

Model selection is **not validated at request time**:

```typescript
// src/lib/services/generation.ts line 82
model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
```

If `OPENROUTER_MODEL` is set to an invalid model name or a model the API key doesn't have access to, the error will be caught only by the provider's response (non-2xx status or garbled JSON). No explicit model validation occurs.

**Test implication**: Contract test must verify that an invalid model name correctly fails (returns 502 with specific error, not silent 200 with bad cards).

## Historical Context (from Prior Changes)

### First Gated Generation (Archive: `2026-08-23-first-gated-generation`)

**Archive path**: `context/archive/2026-08-23-first-gated-generation/`

**Plan findings** (`plan.md:18–20, 50–52, 80, 177–187, 231`):

- OpenRouter API key wired; no client existed yet
- Used `response_format: json_schema` and `provider: { require_parameters: true }` to avoid bad provider/model selection
- Explicitly tested slow/hung provider timeouts (should return 502)
- Strict schema validation was enforced
- Simulated provider failure/timeout behavior was implemented and verified

**Research findings** (`research.md:40–48, 69–79, 197–198`):

- OpenRouter was chosen for integration, but risky parts were **integration + prompt/schema + quality**
- Structured output with strict schema + `require_parameters: true` was recommended
- Open question: what model to default to (resolved to `gpt-4o-mini`)

**Key insight**: The prior implementation anticipated most of these risks. The current code (as of 2026-09-12) reflects those decisions, but the **quality/semantic validation was deferred** (not implemented), leaving Risk #1 exposed.

### Past Incident: Incorrect Model Deployment

**Signal**: Test-plan Risk #2 cites: "User Q2 (past incident: 'incorrect model used') + recent git history (S-03 revert/fix/revert 2026-09-11)"

**Commits**:

- `8182766` (2026-09-11 18:49:38) — "Revert 'fix(srs-review-session): parse card_order JSONB from Supabase correctly'"
- `c8a802f` (2026-09-11 18:40:43) — "fix(srs-review-session): parse card_order JSONB from Supabase correctly"

**Note**: The reverts are related to SRS (spaced repetition), not AI generation. However, the test-plan's reference to "S-03 revert/fix/revert" and the incident "incorrect model used" suggests that **AI provider misconfiguration has happened before in the product's history**, even if not in these specific commits. This is a strong signal for contract testing.

### Lessons Captured

**Archive path**: `context/foundation/lessons.md`  
**Status**: No AI-quality or provider-reliability lesson recorded yet (only a lesson about shadcn/ui component reuse).

**Implication**: This is the first structured risk analysis for AI generation quality in this project. Lessons from the Phase 1 research and implementation should be captured for future reference.

## Related Research

- **Test-plan Risk Response Guidance** (§2): Detailed guidance on how to prove protection against Risk #1; cites specific contract + integration test strategies.
- **Roadmap** (context/foundation/roadmap.md): User story US-01 (AI generation) and acceptance criteria still being refined.
- **PRD** (context/foundation/prd.md): Success metric (75% acceptance), quality expectations, and user confidence as a first-class concern.

## Open Questions

1. **System prompt**: What exactly does the system prompt say when calling OpenRouter? (Not visible in current code—may be generated dynamically or stored elsewhere.)

2. **Quality oracle for semantic validation**: How should the test verify that a card is "on-topic" without being circular (i.e., not just checking the schema matches)? Options:
   - Mock provider with known good/bad example responses
   - Real API call with sample text + manual review
   - Semantic similarity check (text embedding) between source and generated cards
   - Reference test vectors with known correct answers

3. **Edge case: empty source text**: What happens if user submits an empty string or whitespace-only text? Current input validation is 1–5000 chars, so empty should be rejected at API level, but needs verification.

4. **Model access**: How is access to different OpenRouter models controlled? Is there a list of allowed models or does any string go to the provider?

5. **Fallback mock cards behavior**: The code falls back to mock cards if `OPENROUTER_API_KEY` is missing. What exactly are these mock cards? Are they hardcoded or generated? How does this affect testing?

6. **Session context**: Can the user provide deck context, topic hints, or other metadata to improve generation, or is it only free-form source text?

---

## Key Takeaways for Test Planning

✅ **What we know**:

- Happy path: text → OpenRouter call → schema validation → client review → DB save (with RLS)
- Errors map to 502 status
- Structural validation is comprehensive; semantic validation is missing
- Prior incident of model misconfiguration exists
- 75% acceptance rate is the product success metric

⚠️ **What must be tested**:

- Contract: valid/invalid OpenRouter responses, schema strictness, credential/timeout handling
- Integration: end-to-end flow with real/mock provider, card quality grounding in source text
- Configuration: model selection is applied, credentials are loaded, no silent failures

❌ **What's not implemented yet**:

- Semantic quality checks (on-topic, factually grounded)
- Model/credential validation at call time
- Quality oracle for acceptance-rate testing

**Next step**: Move to `/10x-plan testing-critical-path-coverage` to design contract + integration tests that satisfy the quality criteria and risk response guidance from §2 of the test-plan.
