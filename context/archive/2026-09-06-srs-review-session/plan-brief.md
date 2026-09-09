# SRS Review Session (S-03) — Plan Brief

> Full plan: `context/changes/srs-review-session/plan.md`

## What & Why

Add a spaced-repetition review flow: a signed-in user starts a review session, sees only cards due for review, self-rates each one (0-5, SM-2 scale), and has the card's schedule updated immediately. This is roadmap slice S-03 — the review loop that turns the existing deck into an actual study tool, per PRD US-02/FR-012/FR-013.

## Starting Point

`public.cards` exists with RLS but no SRS columns. The API layer has an established JSON envelope pattern (`src/pages/api/cards.ts`, `generate.ts`) and a service-layer convention (`src/lib/services/cards.ts`). No review/SRS types, endpoints, or UI exist yet. `src/middleware.ts` protects `/dashboard`, `/generate`, `/deck` but not any review route.

## Desired End State

User visits `/review`, works through one due card at a time (reveal answer, pick a 0-5 rating), and the app tracks progress durably — refreshing mid-session resumes exactly where they left off. When no cards are due, they see a clear empty state; when the queue is exhausted, a completion state.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| SRS algorithm | Pure in-repo SM-2 function (`sm2.ts`) | Roadmap already resolved OQ-3 to SM-2 and named the exact columns needed — no external library required. |
| Progress durability | New `review_sessions` table, server-backed | NFR requires refresh/close survival; client-only state can't guarantee that. |
| Answer persistence | Card + session updated in one route/service call | Keeps the flow simple; escalate to a Postgres RPC only if manual QA finds real atomicity issues. |
| Concurrency control | One active session per user via partial unique index | Removes ambiguity from multi-tab usage without application-level locking. |
| UI placement | New isolated `/review` page + `src/components/review/*` | Avoids merge conflicts with the parallel S-04 (ui-improvements) slice touching dashboard/shared buttons. |

## Scope

**In scope:** SRS columns on `cards`, `review_sessions` table + RLS, SM-2 scheduling service, three review API endpoints, protected `/review` page and React island, optional dashboard CTA link.

**Out of scope:** FR-014 (next-review-date display), bulk/list review mode, scheduling analytics/streaks/audit log, anonymous review, cross-device conflict resolution beyond one-active-session, any new test framework, global button/dashboard restyling (owned by S-04).

## Architecture / Approach

Five-layer bottom-up build mirroring prior slices: migration (SRS columns + `review_sessions` + RLS) → pure SM-2 service + session orchestration service → three `/api/review/*` JSON endpoints → `/review.astro` + `ReviewSessionView` React island (reveal → rate → advance) → verification/polish pass with manual QA and an S-04 merge-conflict sanity check.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema and shared contracts | SRS columns, `review_sessions` table + RLS, shared types | RLS/migration correctness — data-leak risk if wrong from the start |
| 2. Review services | Pure SM-2 function, session orchestration service | Getting the SM-2 formula and ordering semantics right |
| 3. Review API | `/api/review/session`, `/current`, `/answer` | Answer-submission atomicity (card + session pointer) |
| 4. Review UI | `/review` page, `ReviewSessionView` + child components | Refresh-resume correctness; avoiding S-04 shared-component overlap |
| 5. Verification and polish | Full lint/build pass, manual QA scenarios, S-04 conflict check | Multi-tab / stale-submission edge cases |

**Prerequisites:** S-01 (first-gated-generation) and F-01 (card-schema) are done; SM-2 chosen for OQ-3.
**Estimated effort:** ~5 phases, roughly 1 implementation session per phase.

## Open Risks & Assumptions

- Supabase JS gives no built-in multi-statement transaction — the plan accepts sequential card-then-session updates for MVP and only escalates to an RPC if QA surfaces real inconsistency.
- All pre-existing cards become immediately due after migration (`due_date = now()`) — expected, not a bug, but should be called out during QA.
- No automated test suite exists in the repo; verification relies on lint, build, and manual scenario testing.

## Success Criteria (Summary)

- User can complete a full review session end-to-end, with each answer correctly rescheduling the card via SM-2.
- Refreshing mid-session resumes at the exact same card and progress count.
- Another user can never read or affect someone else's session or card schedule.
