# Testing Critical-Path Coverage for AI Card Generation — Plan Brief

> Full plan: `context/changes/testing-critical-path-coverage/plan.md`
> Research: `context/changes/testing-critical-path-coverage/research.md`

## What & Why

We're building contract + integration tests for AI card generation to defend against Risk #1 (off-topic/nonsensical cards missing the 75% acceptance target) and Risk #2 (misconfigured AI provider causing silent failures). The core gap: code validates JSON structure but not semantic quality (whether cards are on-topic and grounded in source). Tests use mocked provider responses to verify strict schema enforcement, configuration handling, and error paths; then integrate reference vectors + string similarity to assert semantic quality without ML overhead.

## Starting Point

Code validates structure only: OpenRouter `strict: true` enforces JSON shape and field presence; Zod enforces length bounds (1–100 chars). But semantic validation is missing—there's no check that generated cards are on-topic or factually grounded. Prior incident: a deployment used the wrong model; no tests caught it at request time. Result: 75% acceptance rate is at risk, and configuration errors slip through.

## Desired End State

- Contract tests verify that `/api/generate` correctly validates responses, handles misconfiguration (invalid model, missing credentials), and fails gracefully (502 errors, not silent 200s with bad cards)
- Semantic tests verify that generated cards are on-topic by comparing against curated reference examples using lightweight string similarity
- CI/CD gate: contract tests block merge; semantic checks log scores for production monitoring (non-blocking)
- Configuration risk is detected: invalid model names and missing credentials correctly surface as 502 or warnings, not silent failures

## Key Decisions Made

| Decision                       | Choice                                                                      | Why (1 sentence)                                                                     | Source        |
| ------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------- |
| Test layers                    | Contract (mocked provider) + Integration (reference vectors)                | Catches structure + semantic quality at cheapest cost; matches prior archive pattern | Research/Plan |
| Quality oracle for semantics   | String similarity (Levenshtein/TF-IDF) + reference vectors (~5-10 examples) | Lightweight, no ML dependency, verifiable; scales later if needed                    | Plan          |
| Configuration validation scope | Test valid model, invalid model, missing credentials                        | Catches the prior incident (wrong model deployed); ensures runtime detection         | Plan          |
| CI/CD gating strategy          | Contract tests block merge; semantic checks are advisory (log-only)         | Prevents shipped bugs; keeps CI fast; production monitoring catches drift            | Plan          |
| Input edge case testing        | Omit (Zod already validates; no signal for risks #1/#2)                     | Cost × signal: edge cases don't test the actual risks                                | User feedback |
| Test phasing                   | Phase 1: Contract only; Phase 2: Semantic validation                        | Delivers value incrementally; Phase 1 catches configuration bugs immediately         | Plan          |

## Scope

**In scope:**

- Mocked OpenRouter responses (valid, invalid model, missing credentials, timeouts, provider 500s, malformed JSON)
- Schema strictness validation (field presence, length bounds, card count capping)
- Configuration validation (model name correctness, credential handling)
- Semantic quality checks with reference vectors (string similarity, scoring, advisory logging)
- Test framework setup (Vitest + MSW or equivalent)

**Out of scope:**

- E2E browser testing (deferred to Phase 4)
- ML embeddings for semantic checking (keeping it lightweight)
- Production canary or shadow-mode metrics (operational monitoring, not test code)
- Zod boundary testing (empty text, max text—Zod already enforces)
- Persistence layer (Phase 2 durability tests cover DB)

## Architecture / Approach

```
User calls /api/generate → API validates request → calls generateCards(source_text)
    ↓
generateCards calls OpenRouter with system prompt + source
    [Contract tests mock OpenRouter at HTTP level]
    ↓
Response is parsed, validated against Zod schema, capped to 10 cards
    [Contract tests verify schema strictness, error handling]
    ↓
Semantic similarity computed against reference vectors (Phase 2)
    [Integration tests verify on-topic quality]
    ↓
Result returned to client; semantic score logged (advisory, non-blocking)
```

**Configuration risk detection:**

- Valid model + valid key → 200 + cards (happy path)
- Invalid model name → 502 error (provider rejects)
- Missing credentials → 200 + mock cards (fallback with warning log)
- Each case is explicitly tested so prior incident cannot repeat

## Phases at a Glance

| Phase | What it delivers                                               | Key risk                                                                     |
| ----- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1     | Contract tests with mocked provider; configuration validation  | Misunderstanding mock setup could hide real API failures; CI false positives |
| 2     | Semantic validation with reference vectors + string similarity | Reference vectors may be too limited or unrepresentative of real usage       |

**Prerequisites:**

- Vitest and MSW (or equivalent) added to `package.json`
- Reference source texts curated (drawn from PRD examples or real user input)

**Estimated effort:**

- Phase 1: ~1–2 sessions (test setup + contract tests)
- Phase 2: ~1 session (reference vectors + similarity helper + integration)
- Total: ~2–3 sessions across both phases

## Open Risks & Assumptions

- **Reference vectors representative**: If curated examples don't cover real-world input variety, semantic scores may not correlate with acceptance rate. Mitigation: expand vectors as production data arrives.
- **String similarity threshold (0.75)**: Tuned conservatively; may need adjustment after Phase 2 runs. Mitigation: log all scores; monitor in production.
- **Mock provider setup stability**: MSW or custom mocks may break if OpenRouter API changes. Mitigation: periodic re-validation against live provider (not in automated tests, but manual smoke test).

## Success Criteria (Summary)

- ✅ All contract tests pass: `/api/generate` validates schema, handles misconfiguration, fails gracefully
- ✅ Semantic scores logged for all reference vectors: integration tests show >0.75 similarity (advisory)
- ✅ CI/CD gate functional: contract test failures block merge; semantic warnings appear in logs only
- ✅ Configuration risk is detecta ble: invalid model name → 502, not 200 with bad cards
