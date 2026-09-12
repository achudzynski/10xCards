# Testing Critical-Path Coverage for AI Card Generation

## Overview

This plan establishes contract + integration testing for AI card generation, defending against Risk #1 (off-topic/nonsensical cards missing 75% acceptance target) and Risk #2 (misconfigured provider). We use mocked provider responses to validate schema strictness and configuration, then integrate reference vectors + string similarity for semantic quality assurance. The hard CI/CD gate is schema + configuration; semantic checks are advisory for production monitoring.

## Current State Analysis

Code validates **structure only**: JSON schema strictness (OpenRouter `strict: true`), field presence, length bounds (1–100 chars). But **semantic validation is missing**—there is no check that generated cards are on-topic, grounded in source text, or factually correct. This gap directly threatens the 75% acceptance metric.

Prior incident: User Q2 notes a past deployment using the wrong model, and recent git history (2026-09-11 revert/fix/revert cycles) shows configuration volatility. No tests catch this at request time.

## Desired End State

- **Contract tests** verify that `/api/generate` correctly validates OpenRouter responses, handles misconfigurations, and fails gracefully on provider errors (502 + explicit error code, not silent 200 with bad cards)
- **Semantic tests** verify that generated cards are on-topic and grounded by comparing against known-good reference examples using string similarity
- **CI/CD gate**: Contract tests block merge; semantic checks log scores and inform monitoring (non-blocking)
- **Configuration risk is detecte**d: invalid model names and missing credentials correctly surface as 502 errors or explicit warnings, not silent failures

### Key Discoveries:

- **System prompt** (`src/lib/services/generation.ts:48–52`): "Do not invent facts not present in the text. If the text contains no learnable concepts, return an empty cards array." — This is the quality contract with OpenRouter.
- **No test framework exists**: `package.json` has no test script or test framework. Phase 1 must bootstrap the test infrastructure (select framework, add mocking setup).
- **Fallback behavior**: Missing `OPENROUTER_API_KEY` triggers hardcoded mock cards (`src/lib/services/generation.ts:54–59`). Tests must verify this path returns valid-schema cards, not that it's "wrong."
- **Response structure**: OpenRouter returns `{ choices: [{ message: { content: "{ cards: [...] }" } }] }`. The string content must be JSON-parsed again—this is a double-parsing risk.

## What We're NOT Doing

- E2E browser testing of the UI wizard (deferred to Phase 4 quality gates)
- Full semantic coverage with ML embeddings (keeping it lightweight with string similarity)
- Production canary or shadow-mode metrics collection (deferred to operational monitoring)
- Testing Zod schema boundaries (empty text, max text—Zod already enforces these; testing them doesn't prove Risk #1 or #2)
- Mocking or testing the Supabase `cards` table insert (Phase 2 durability tests cover persistence)

## Implementation Approach

**Layered testing strategy**:

1. **Contract layer** (Phase 1): Mock OpenRouter responses; assert correct schema validation, configuration handling, error codes
2. **Semantic layer** (Phase 2): Integration with known-good reference examples; string similarity scoring; advisory logging

**Configuration validation strategy**:

- Valid setup: `OPENROUTER_MODEL=openai/gpt-4o-mini`, `OPENROUTER_API_KEY=valid-key` → 200 + valid cards
- Invalid model: `OPENROUTER_MODEL=invalid/model` → 502 error (provider rejects)
- Missing key: No `OPENROUTER_API_KEY` → 200 + mock cards (with log warning)
- Each case must be **explicitly tested and verified** so the prior incident (wrong model deployed) cannot repeat

**Semantic quality strategy**:

- Reference vectors: ~5–10 curated (source text, expected flashcards) examples stored in `context/changes/testing-critical-path-coverage/reference-vectors.json`
- Similarity function: String similarity (Levenshtein distance or TF-IDF) comparing generated card text to reference cards
- Threshold: >0.75 similarity score (tunable; start conservative)
- CI behavior: Log score but don't block; production monitoring watches the logs

## Phase 1: Contract Testing (Mocked Provider)

### Overview

Establish a test harness for `/api/generate` using a mocked OpenRouter provider. Verify request validation, response schema strictness, configuration handling, and error paths. This is the hard gate: all contract tests must pass before merge.

### Changes Required:

#### 1. Set up test framework and mocking infrastructure

**File**: `package.json`, `vitest.config.ts` (new), `src/__tests__/setup.ts` (new)

**Intent**: Bootstrap a lightweight, Astro-compatible test framework with HTTP mocking support. Vitest is fast and works well with Astro; MSW (Mock Service Worker) or Node mocking provides deterministic provider responses.

**Contract**:

- Add `vitest`, `@vitest/ui` (optional, for debugging) as devDependencies
- Add `msw` (Mock Service Worker) for HTTP mocking, or implement a simpler Node `fetch` mock wrapper
- `vitest.config.ts` configures Vitest to work with Astro's TypeScript paths and `.astro` file support
- `src/__tests__/setup.ts` initializes the test environment (mocks, fixtures, helpers)
- `package.json` adds a `test` script: `vitest run` (CI) and `vitest` (watch mode for dev)

#### 2. Implement contract tests for `/api/generate`

**File**: `src/pages/api/__tests__/generate.test.ts` (new)

**Intent**: Test the API route directly, mocking OpenRouter responses. Verify request validation, response schema, error handling, and configuration behavior.

**Contract**:
Test cases organized by risk:

- **Valid response** (Risk #1 foundation): Mock provider returns valid JSON `{ cards: [{ front: "Q", back: "A" }, ...] }`. Assert HTTP 200, response matches schema, up to 10 cards capped correctly.
- **Invalid model name** (Risk #2): `OPENROUTER_MODEL=invalid/xyz`, valid key. Assert HTTP 502, error code `generation_failed`, logs indicate provider rejection.
- **Missing credentials** (Risk #2): `OPENROUTER_API_KEY` unset. Assert HTTP 200, response contains mock cards (fallback behavior), cards pass schema.
- **Provider timeout** (error path): Mock provider delays >30s. Assert HTTP 502, error code `generation_failed`, timeout caught by AbortController.
- **Provider returns non-2xx** (error path): Mock provider returns 500. Assert HTTP 502, error code `generation_failed`.
- **Malformed JSON response** (error path): Mock provider returns `{ invalid json`. Assert HTTP 502, error code `generation_failed`.
- **Missing `cards` key** (error path): Mock provider returns `{ results: [...] }` (wrong field). Assert HTTP 502, error code `generation_failed`.

#### 3. Implement contract tests for `generateCards()` service

**File**: `src/lib/services/__tests__/generation.test.ts` (new)

**Intent**: Test the generation service in isolation (unit + integration with mocked provider). Verify request construction, response parsing, Zod validation, and schema enforcement.

**Contract**:

- **Happy path**: Call `generateCards("sample text")` with mocked provider returning valid cards. Assert result is `{ cards: [{ front, back }, ...] }`, fields are trimmed, count ≤ 10.
- **Response parsing**: Verify that the double-parse (JSON string inside JSON) is handled correctly. Mock a response where `choices[0].message.content` is a stringified JSON object; assert it parses correctly.
- **Field trimming**: Mock provider returns cards with leading/trailing whitespace. Assert Zod validation trims and validates bounds (1–100 chars).
- **Card count cap**: Mock provider returns 15 cards. Assert result caps to 10.
- **Card drop on schema fail**: Mock provider returns [valid card, invalid card (front=200 chars), valid card]. Assert only valid cards pass; result length is 2, not 3.
- **Empty cards array**: Mock provider returns `{ cards: [] }`. Assert result is empty array (not error).
- **System prompt verification**: Inspect request to mock provider; assert system message contains "Do not invent facts" and "return an empty cards array" fragments from the prompt.

### Success Criteria:

#### Automated Verification:

- Vitest runs without errors: `npm run test`
- All contract tests pass (valid response, invalid model, missing credentials, timeouts, malformed JSON, schema validation)
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`
- API route and service layer have ≥80% line coverage (both happy path and error cases)

#### Manual Verification:

- Spot-check mock provider setup: inspect generated test output to confirm MSW/mock is actually intercepting calls (not hitting real OpenRouter)
- Verify error messages are user-friendly (no stack traces in HTTP response)
- Confirm that configuration validation doesn't accidentally accept invalid models (assert 502, not 200)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the mock provider setup is working correctly and no real API calls are leaking through.

---

## Phase 2: Semantic Validation (Reference Vectors + Integration)

### Overview

Introduce reference test vectors (curated source + expected cards) and a string similarity checker to verify that generated cards are on-topic and grounded in source text. Integrate tests run against known-good examples; semantic scores are logged but non-blocking (advisory for production monitoring).

### Changes Required:

#### 1. Create reference test vectors

**File**: `context/changes/testing-critical-path-coverage/reference-vectors.json` (new)

**Intent**: Store 5–10 curated (source text, expected flashcards) pairs as ground truth for semantic quality checks.

**Contract**: JSON array of objects:

```json
[
  {
    "source_text": "Photosynthesis is the process by which plants convert light energy into chemical energy...",
    "expected_cards": [
      { "front": "What is photosynthesis?", "back": "Process by which plants convert light to chemical energy" },
      { "front": "How do plants store energy from sunlight?", "back": "Through chemical energy via photosynthesis" }
    ],
    "domain": "biology",
    "difficulty": "beginner"
  },
  ...
]
```

Examples should cover:

- Diverse domains (biology, history, programming, general knowledge)
- Beginner and intermediate difficulty
- Edge cases: very short source text, dense technical source, ambiguous phrasing

#### 2. Implement string similarity helper

**File**: `src/lib/services/similarity.ts` (new)

**Intent**: Provide a lightweight semantic check comparing generated cards to reference examples using string similarity (no ML dependencies).

**Contract**: Export function `calculateSimilarity(generatedCard: Card, referenceCards: Card[]): number` which:

- Takes a generated `{ front, back }` and a list of reference cards
- Returns a similarity score (0–1) representing how close the generated card is to the best-matching reference card
- Use Levenshtein distance or TF-IDF similarity; keep it simple and fast
- Handle edge cases: empty strings, very short strings

#### 3. Implement integration tests with reference vectors

**File**: `src/lib/services/__tests__/generation.integration.test.ts` (new)

**Intent**: Test `/api/generate` end-to-end using reference vectors as ground truth. Call the real service (mocked provider) with reference source text and verify that generated cards score above the similarity threshold.

**Contract**:

- For each reference vector:
  - Call `generateCards(source_text)` with mocked provider returning valid cards (or call real provider with sampled sources, if budget allows)
  - For each generated card, compute similarity score against reference cards
  - Assert average score ≥ 0.75 (tunable; start conservative)
  - Log score for each reference vector (advisory)
- If any reference vector scores below 0.75, test logs a warning but doesn't fail (advisory mode)
- If provider returns empty cards array for a source that should yield cards, log a warning (not a failure)

#### 4. Add semantic logging to `/api/generate`

**File**: `src/pages/api/generate.ts`

**Intent**: Log semantic quality scores alongside successful responses, enabling production monitoring without blocking.

**Contract**:

- After generating cards, compute similarity score against reference vectors
- Log: `{ event: 'cards_generated', card_count: N, avg_similarity_score: X.XX, source_length: L }`
- Score is informational; does not affect HTTP response or error handling
- No blocking: low scores do not cause 502 errors

### Success Criteria:

#### Automated Verification:

- Reference vectors load and validate: `npm run test`
- String similarity helper has unit tests (edge cases: empty, single char, identical strings)
- Integration tests pass (average similarity ≥ 0.75 for all reference vectors)
- Semantic logging is present in API response (inspect logs for `avg_similarity_score` field)
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Review a sample of reference vectors to confirm they are realistic and well-balanced
- Inspect log output for a few test runs to confirm similarity scores are reasonable (not always 1.0, not always 0)
- Verify that low-similarity warnings don't cause confusion (users understand they are informational)

**Implementation Note**: After completing this phase, pause for manual confirmation that semantic logging is working and scores are being captured correctly in monitoring systems (or logs if no monitoring yet).

---

## Testing Strategy

### Unit Tests (Phase 1, 2):

- String similarity helper: edge cases (empty, single char, identical, completely different)
- Zod schema validation: field trimming, length bounds, card count capping
- System prompt presence and correctness

### Integration Tests (Phase 1, 2):

- API route with mocked provider: all paths (valid, invalid model, missing credentials, errors)
- End-to-end with reference vectors: known-good sources yield on-topic cards
- Semantic logging: scores are recorded and formatted correctly

### What NOT to test:

- Astro SSR rendering (framework trust)
- OpenRouter API itself (upstream trust)
- Zod schema boundaries (input validation) — already enforced at runtime
- UI wizard interactions (deferred to Phase 4 e2e tests)

## Performance Considerations

- **Test runtime**: Contract tests should run in <1s (mocking avoids provider latency). Integration tests with reference vectors should run in <5s (string similarity is O(n²) but with small vectors).
- **Provider mocking overhead**: MSW or a simple Node mock adds negligible overhead compared to network latency.
- **Caching**: Reference vectors are loaded once; string similarity scores are computed on-demand (not cached).
- **CI/CD impact**: Expect ~10s for full test suite (setup + contract + integration). No performance cliff as tests scale.

## Migration Notes

N/A (no data model changes; tests are new code only).

## References

- **Research**: `context/changes/testing-critical-path-coverage/research.md`
- **Test-plan Risk Response Guidance**: `context/foundation/test-plan.md§2` (rows #1, #2)
- **Similar implementation**: `context/archive/2026-08-23-first-gated-generation/plan.md` (prior generation backend; influenced error handling strategy)
- **System prompt**: `src/lib/services/generation.ts:48–52`
- **API endpoint**: `src/pages/api/generate.ts:14–45`
- **Generation service**: `src/lib/services/generation.ts:62–134`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Contract Testing (Mocked Provider)

#### Automated

- [x] 1.1 Set up Vitest + MSW (or Node mock) + initial test config — b3c98a0
- [x] 1.2 Implement `/api/generate` contract tests (valid response, invalid model, missing credentials) — b3c98a0
- [x] 1.3 Implement error path tests (timeout, provider 500, malformed JSON, missing `cards` key) — b3c98a0
- [x] 1.4 Implement `generateCards()` service tests (happy path, parsing, trimming, capping, schema validation) — b3c98a0
- [x] 1.5 Verify type checking and linting pass — b3c98a0

#### Manual

- [x] 1.6 Spot-check mock provider setup (confirm no real API calls leak through) — b3c98a0
- [x] 1.7 Verify error messages are user-friendly — b3c98a0

### Phase 2: Semantic Validation (Reference Vectors + Integration)

#### Automated

- [ ] 2.1 Create reference test vectors JSON file (~5-10 curated examples)
- [ ] 2.2 Implement string similarity helper (`src/lib/services/similarity.ts`)
- [ ] 2.3 Implement string similarity unit tests (edge cases)
- [ ] 2.4 Implement integration tests with reference vectors
- [ ] 2.5 Add semantic logging to `/api/generate`
- [ ] 2.6 Verify type checking and linting pass

#### Manual

- [ ] 2.7 Review reference vectors for realism and balance
- [ ] 2.8 Spot-check semantic logs for reasonable scores
