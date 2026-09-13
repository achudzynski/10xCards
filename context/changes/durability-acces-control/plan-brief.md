# Durability + Access Control Integration Tests — Plan Brief

> Full plan: `context/changes/durability-acces-control/plan.md`
> Research: `context/changes/durability-acces-control/research.md`

## What & Why

We're creating integration tests to protect three critical risks in deck management and review sessions: mutations corrupting card state, session progress being lost on browser refresh, and RLS policies failing to enforce user boundaries. The test infrastructure (Vitest for API logic, Playwright for browser persistence) doesn't exist yet; this phase builds it while also adding defensive error handling to mutation callbacks.

## Starting Point

The API layer correctly scopes mutations to user ownership via Supabase RLS (all queries use `.eq("user_id", userId)`). However, the client and test coverage have gaps:

- Five durability risks were discovered: concurrent edit races (no version field), callback exceptions causing state desynchronization, delete button only scoped to its dialog, no request cancellation on navigation, SRS field preservation not tested
- Client uses React component state only (no Context, no persistence); non-optimistic updates apply mutations only after server success
- Session state lives entirely in the database (`card_order` JSONB, SRS due_dates); no tests verify that this state survives browser refresh

## Desired End State

After Phase 2, deck mutations are durable and consistent — card edits and deletes execute safely and never corrupt state. Callback exceptions are caught and displayed; dialogs don't silently close. Review sessions survive browser refresh without losing progress or repeating cards. RLS boundaries are tested and verified to prevent IDOR. Test infrastructure (Vitest integration + Playwright session tests) is in place for Phase 3.

## Key Decisions Made

| Decision                 | Choice                                            | Why                                                                                                                                     | Source |
| ------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Testing framework        | Hybrid: Vitest + Playwright                       | Vitest is fast for API logic + mutations; Playwright tests full browser lifecycle (refresh recovery) — necessary for session durability | Plan   |
| Database testing         | Real Supabase (dev)                               | Catches RLS and schema bugs; mocking risks missing DB-layer failures. Multi-user RLS scenarios use mocked JWT tokens (cheap + fast)     | Plan   |
| Concurrent edits         | Test race behavior + document as known limitation | No version field exists; adding one is post-MVP. Testing race and documenting it de-risks the assumption without delaying Phase 2       | Plan   |
| Callback errors          | Add try-catch, then test                          | Prevents state desynchronization when callbacks fail. Low implementation cost; high impact on user experience                           | Plan   |
| Session persistence test | Playwright (full browser refresh)                 | Ensures real browser lifecycle is covered; API-only tests can't catch rendering or navigation issues                                    | Plan   |
| Test isolation           | Per-suite cleanup                                 | Balances speed (single cleanup hook) with safety (all data cleaned after suite)                                                         | Plan   |
| Phase 2 success bar      | Minimum viable (at least 1 test per risk)         | Proves protection without 100% edge case coverage; Phase 3 can expand coverage                                                          | Plan   |

## Scope

**In scope:**

- Defensive error handling (try-catch) in CardFormDialog and DeleteCardDialog
- Vitest integration tests for mutation durability (edits, deletes, concurrent scenarios)
- Vitest integration tests for RLS boundary enforcement (multi-user isolation)
- Playwright tests for session persistence across browser refresh
- Test infrastructure fixtures (db-setup, mock JWT creation, cleanup hooks)

**Out of scope:**

- Concurrent edit conflict prevention (last-write-wins is documented; version/ETag added post-MVP)
- SRS schedule preservation test (defer to Phase 3)
- Request cancellation on navigation (defer post-MVP)
- Multiple concurrent delete paths (defer)
- Visual regression testing, Astro rendering tests, Supabase SDK tests (per test-plan exclusions)

## Architecture / Approach

**Phase 1 (Defensive Error Handling):**

- Wrap `onSaved()` and `onDeleted()` callbacks in try-catch
- Display error to user; keep dialog open for retry

**Phase 2 (Vitest Integration Tests):**

- Real Supabase database for all tests
- Mocked JWT tokens for multi-user scenarios (cheap + fast)
- Test card edits, deletes, concurrent races, RLS boundaries
- Per-suite cleanup hook (all test data deleted after suite)

**Phase 3 (Playwright Session Tests):**

- Full browser lifecycle: start review → answer cards → refresh → verify resume
- Verify no progress loss, no repeated cards, correct next card

## Phases at a Glance

| Phase | Deliverable                                                  | Key Risk                                                           |
| ----- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| 1     | Defensive error handling (CardFormDialog + DeleteCardDialog) | Callback exceptions still possible; UI now handles them gracefully |
| 2     | Vitest integration tests (mutations + RLS)                   | Tests may be slow; multi-user scenarios need mocked JWT setup      |
| 3     | Playwright session persistence tests                         | Browser test flakes possible; headless mode must be verified       |

**Prerequisites:** Phase 1 tests (AI generation) must be passing. Vitest is configured. Supabase dev database is available.

**Estimated effort:** ~2–3 sessions across the three phases. Phase 1 is quick (component edits + tests). Phase 2 requires test fixture design and DB cleanup logic. Phase 3 requires Playwright config + browser test writing.

## Open Risks & Assumptions

- **Mocked JWT tokens work with Supabase RLS** — We assume that passing a mocked JWT to the Supabase client will correctly trigger RLS policies. If RLS requires real Supabase auth, we'll fall back to test accounts.
- **Per-suite cleanup is fast enough** — Deleting all test data once per suite should be <5s. If it's slower, we may need to split into smaller suites.
- **Playwright doesn't flake under CI conditions** — Browser tests can be flaky; we're assuming headless mode is stable. If flakes occur, we'll add retry logic or timeout increases.

## Success Criteria (Summary)

- All three phases pass automated verification (`npm run test` + `npx playwright test`)
- At least one test per risk (#3, #4, #6) demonstrates protection
- No regression in existing Phase 1 tests
- Database is clean after test runs complete
