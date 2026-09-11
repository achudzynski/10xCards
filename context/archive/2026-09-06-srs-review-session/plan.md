# SRS Review Session (S-03) Implementation Plan

## Overview

Implement the first spaced-repetition slice on top of the existing authenticated deck: a signed-in user starts a review session, receives only cards due for review, reveals and self-rates each card on the SM-2 0-5 scale, and each answer immediately persists the next schedule back to `public.cards`. Because the PRD requires durability across refresh/close, session progress must be server-backed rather than in-memory. The plan: extend `cards` with SRS fields, add a small `review_sessions` table for durable progress, expose JSON review endpoints under `/api/review/*`, keep SM-2 math in a pure service, and render the flow as a dedicated React island on a new protected `/review` page. This keeps scheduling logic off the client, reuses the project's established API/error/service patterns, and avoids conflicts with S-04 by leaving shared button defaults and dashboard polish largely untouched.

## Current State Analysis

### Existing schema and RLS baseline

- `supabase/migrations/20260815000000_create_cards.sql` creates `public.cards` with `id`, `user_id`, `front`, `back`, `is_ai_generated`, `created_at`, `updated_at`, RLS enabled, and four per-operation policies scoped to `auth.uid() = user_id`.
- `supabase/migrations/20260823000000_harden_cards_rls.sql` narrows all four policies to role `authenticated` and adds `cards_user_id_idx`.
- There are **no SRS columns yet** — S-03 must add `ease_factor`, `interval`, `repetitions`, and `due_date` itself.
- Repo rule: every new Supabase table must enable RLS with per-operation, per-role policies in the same migration — a durable session table must ship with its own policies.

### Existing API conventions

- Auth endpoints in `src/pages/api/auth/*.ts` are form-post redirect handlers — not the review pattern to follow.
- The real JSON API precedent is `src/pages/api/generate.ts`, `src/pages/api/cards.ts`, `src/pages/api/cards/[id].ts`:
  - `export const prerender = false;`
  - Check `context.locals.user` first; return 401 via `jsonError(...)`
  - Build Supabase via `createClient(context.request.headers, context.cookies)`, 500 if null
  - Parse JSON in `try/catch`, validate with `zod`
  - Success via `jsonOk(...)`; errors as `{ error: { code, message, context? } }` from `src/lib/api.ts`
- `src/pages/api/cards/[id].ts` shows the preferred dynamic-route style and 404 behavior (`not_found`) when a row is absent or not owned.

### Existing service-layer conventions

- `src/lib/services/cards.ts` is the repository pattern to extend: owns DB access, maps snake_case rows to camelCase domain types, filters by `user_id` explicitly even though RLS already protects data, returns sentinel values (`null`/`false`) for "not found" instead of leaking existence details.
- `src/lib/services/generation.ts` keeps external/business logic out of route files — S-03 should mirror that split with review-specific services.

### Existing page and React patterns

- `src/pages/deck.astro` server-loads data and hydrates a React island (`<DeckView client:load initialCards={cards} />`).
- `src/components/deck/DeckView.tsx` demonstrates local list state derived from SSR props and dialog orchestration.
- `src/components/deck/CardFormDialog.tsx` demonstrates the preferred async form pattern (local state, validation before fetch, disabled/loading states, inline `ApiError` rendering).
- `src/components/generate/GenerateWizard.tsx` is the closest UX precedent for a multi-step client flow (step/status state machine, fetch-based progression, success/error/empty states, progress indicator).
- shadcn primitives already present and to be reused: `button.tsx`, `card.tsx`, `dialog.tsx`, `alert-dialog.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx`.

### Existing types baseline

- `src/types.ts` currently exports `Card`, generation request/response DTOs, `CreateCardRequest`, `UpdateCardRequest`, `ApiError`. No review/SRS contracts exist yet.

### Routing and auth baseline

- `src/middleware.ts` guards `["/dashboard", "/generate", "/deck"]`. A new `/review` page must be added to `PROTECTED_ROUTES`.

## Desired End State

A signed-in user visits `/review`, starts a review session, and sees a due-card queue only for cards whose `due_date <= now()`. The UI shows one card at a time, lets the user reveal the answer, choose a self-rating from 0 to 5, and then advances to the next due card. After each answer: the card's SM-2 fields (`ease_factor`, `interval`, `repetitions`, `due_date`) are recalculated server-side; session progress is persisted server-side so refresh/close resumes cleanly; completed cards are not repeated incorrectly within the same session; the final state shows completion when no pending cards remain. If there are no due cards, the user gets an explicit empty state instead of a broken session shell.

### Key Discoveries:

- Roadmap OQ-3 is already resolved to **SM-2** and explicitly names the four required columns (`ease_factor`, `interval`, `repetitions`, `due_date`) — these are the native SM-2 state variables, so the algorithm belongs in a pure in-repo function, not an external library.
- The NFR (progress must survive refresh/close) rules out client-only/`localStorage` state — it must be server-backed via a durable `review_sessions` table so `/api/review/current` can resume an existing active session deterministically.
- S-04 (ui-improvements, parallel slice) may touch `dashboard.astro`, `src/components/ui/*` button sizing, and possibly `Layout.astro` — S-03 must avoid modifying shared control defaults and keep the review UI isolated under `src/components/review/*` and `src/pages/review.astro` to minimize merge conflicts.

## What We're NOT Doing

- FR-014 ("show next scheduled review date per card") — out of scope; no deck-level schedule display in this slice.
- No refactor of existing generation or deck management components.
- No bulk review mode or table/list review UI — one card at a time only.
- No advanced scheduling analytics, lapse history, streaks, or per-answer audit log.
- No anonymous or guest review flow.
- No cross-device conflict resolution beyond "one active session per user" — MVP needs only deterministic behavior.
- No global resizing of `Button` variants or dashboard layout restructuring (S-04 owns that).
- No new automated test framework — repo has no unit/integration test suite; validation relies on lint, build, migration sanity, and manual scenarios.

## Implementation Approach

Build bottom-up in five phases mirroring the project's proven slice pattern (migration -> service -> API -> React island -> protected page): data layer, review services, review API, review UI, then verification/polish.

## Critical Implementation Details

**Atomicity of answer submission**: `POST /api/review/answer` must update both the card's SRS columns and the session's progress pointer in response to one user action. Supabase JS against plain tables does not give a multi-statement transaction by default. Start with both updates issued sequentially inside one route/service call (card update first, then session update) and treat a failure after the card update as a recoverable inconsistency the next `/api/review/current` call can reconcile (session pointer lags but card state is authoritative); only escalate to a Postgres RPC/transaction if manual QA surfaces real inconsistency.

**Ordering semantics**: the due-card queue must be snapshotted into `review_sessions.card_order` at session start and never re-queried/re-sorted mid-session, otherwise refresh could reorder or duplicate cards mid-review.

**One active session per user**: enforced via a partial unique index (`WHERE status = 'active'`) rather than application-level locking, so concurrent session-start requests can't race into two active sessions.

## Phase 1: Schema and shared contracts

### Overview

Add the SRS columns to `cards`, introduce the durable `review_sessions` table with RLS, and extend `src/types.ts` with the shared review/SRS contracts every later phase depends on.

### Changes Required:

#### 1. Cards migration: add SRS columns

**File**: `supabase/migrations/<timestamp>_add_srs_fields_and_review_sessions.sql` (new)

**Intent**: add the minimal persisted state SM-2 requires on each card, defaulting existing cards to immediately due.

**Contract**:
- Add to `public.cards`: `ease_factor numeric(4,2) not null default 2.50`, `interval integer not null default 0`, `repetitions integer not null default 0`, `due_date timestamptz not null default now()`.
- Add index `cards_user_due_date_idx` on `(user_id, due_date)`.
- No new RLS policies needed on `cards` — existing per-operation policies already cover `UPDATE` on owned rows.

#### 2. Durable review session table

**File**: same migration as above

**Intent**: persist active session state (queue snapshot + progress pointer) independently of client memory, so refresh/close never loses place.

**Contract**:
- `public.review_sessions`: `id uuid primary key default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `status text not null check (status in ('active','completed'))`, `card_order jsonb not null` (ordered array of card UUIDs captured at session start), `current_index integer not null default 0`, `answered_count integer not null default 0`, `total_count integer not null`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `completed_at timestamptz null`.
- Partial unique index enforcing one active session per user: `create unique index review_sessions_one_active_per_user_idx on public.review_sessions(user_id) where status = 'active';`
- Standard lookup index on `(user_id, status)`.
- Reuse the existing `public.set_updated_at()` trigger for `updated_at`.

#### 3. Review session RLS

**File**: same migration as above

**Intent**: keep durable session state private per user, per the repo's RLS-in-same-migration rule.

**Contract**: policies scoped to `auth.uid() = user_id`, role `authenticated`: `select own`, `insert own` (`WITH CHECK`), `update own` (`USING` + `WITH CHECK`). Omit `delete` in MVP unless implementation needs explicit cleanup.

#### 4. Shared type contracts

**File**: `src/types.ts`

**Intent**: give route handlers, services, and React components one contract surface for SRS/review data.

**Contract**: add `CardWithSRS extends Card` (`easeFactor`, `interval`, `repetitions`, `dueDate`); `ReviewCard` (`id`, `front`, `back`, `dueDate`); `ReviewSession` (`id`, `status: "active" | "completed"`, `currentIndex`, `answeredCount`, `totalCount`, `cardOrder: string[]`, `createdAt`, `updatedAt`, `completedAt: string | null`); `CardAnswer` (`sessionId`, `cardId`, `rating: 0|1|2|3|4|5`); `ReviewResult` (answered-card outcome payload carrying previous/next SRS fields).

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly against local Supabase (`supabase db reset` / `supabase migration up`)
- Type checking passes: `npm run build` (Astro type-checks via `astro check` as part of build)
- Linting passes: `npm run lint`

#### Manual Verification:

- Inspecting the migrated `cards` table shows all existing rows with initialized SRS defaults (`due_date` = now-ish, `ease_factor` = 2.50)
- Attempting to insert a second `active` row into `review_sessions` for the same user fails on the partial unique index

---

## Phase 2: Review services

### Overview

Implement the SM-2 scheduling algorithm as a pure function and the DB-backed review-session orchestration service that phases 3-4 will call.

### Changes Required:

#### 1. Pure SM-2 scheduler

**File**: `src/lib/services/review/sm2.ts` (new)

**Intent**: deterministic scheduling logic with no Supabase dependency, so the algorithm is isolated from persistence and the client/server never diverge on scheduling math.

**Contract**: function taking current `{ easeFactor, interval, repetitions }`, a rating `0-5`, and a review timestamp, returning `{ nextEaseFactor, nextInterval, nextRepetitions, nextDueDate }`.
- Rating `< 3` (failed recall): `repetitions = 0`, `interval = 1`, `due_date = now + 1 day`.
- Rating `>= 3` (success): `repetitions === 0` -> `interval = 1`; `repetitions === 1` -> `interval = 6`; else `interval = round(previousInterval * easeFactor)`; `repetitions += 1`.
- Ease factor update: `ef' = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))`, floored at `1.3`.

#### 2. Review session service

**File**: `src/lib/services/review/session.ts` (new)

**Intent**: own review-session persistence and orchestration so route handlers stay thin, following the `cards.ts` mapping conventions (snake_case rows hidden behind mappers, explicit `user_id` filtering).

**Contract**: exported functions `getActiveReviewSession(supabase, userId)`, `startOrResumeReviewSession(supabase, userId)`, `getCurrentReviewSnapshot(supabase, userId)`, `submitReviewAnswer(supabase, userId, input: CardAnswer)`. `startOrResumeReviewSession` returns the existing active session if one exists; otherwise queries due cards (`due_date <= now()`) for the user, and either returns `{ session: null, currentCard: null, summary: { totalDue: 0 } }` or creates a new session with a snapshotted `card_order`. `submitReviewAnswer` validates the submitted `cardId` matches the session's current expected card (see Critical Implementation Details for ordering/concurrency rules) before computing the next SM-2 state and persisting both the card and session updates.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build/type-check passes: `npm run build`

#### Manual Verification:

- Manually exercising `submitReviewAnswer` (e.g. via a temporary script or the Phase 3 API once available) with rating `1` resets `repetitions` to 0 and sets `due_date` to +1 day
- Same exercise with rating `5` on a card with `repetitions >= 2` grows `interval` by `previousInterval * easeFactor`

---

## Phase 3: Review API

### Overview

Expose the review service through three JSON endpoints under `/api/review/*`, following the existing envelope, auth, and validation conventions.

### Changes Required:

#### 1. Start/resume session

**File**: `src/pages/api/review/session.ts` (new)

**Intent**: create a new active review session from currently due cards, or resume the user's existing active session.

**Contract**: `export const prerender = false`; `POST`; 401 if unauthenticated; no request body required. Calls `startOrResumeReviewSession`. Response: `{ session: ReviewSession | null, currentCard: ReviewCard | null, summary: { totalDue: number } }`.

#### 2. Current session snapshot

**File**: `src/pages/api/review/current.ts` (new)

**Intent**: return the current active session snapshot after refresh/hydration without re-running session-creation logic on every component mount.

**Contract**: `POST`; 401 if unauthenticated; calls `getCurrentReviewSnapshot`; returns `{ session: null, currentCard: null }` when no active session exists.

#### 3. Submit answer

**File**: `src/pages/api/review/answer.ts` (new)

**Intent**: accept one self-rating, update the card's schedule via SM-2, advance/complete the session, and return the next card.

**Contract**: body validated with `z.object({ sessionId: z.uuid(), cardId: z.uuid(), rating: z.number().int().min(0).max(5) })`. Server flow: load active session for `user_id` and validate `sessionId`; verify `cardId` matches the session's current expected card; load the owned card row; compute next SM-2 state; persist card update; advance `current_index`/`answered_count`, marking the session `completed` (`completed_at` set) when finished. Response: `{ session: ReviewSession, result: ReviewResult, nextCard: ReviewCard | null }`. Error codes: `unauthorized` (401), `invalid_input` (400), `not_found` (404, session/card missing or not owned), `session_state_invalid` (409, submitted card is not the current queued card), `save_failed` (500).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build/type-check passes: `npm run build`

#### Manual Verification:

- `curl`/REST client round-trip: start a session, confirm `/api/review/current` returns the same session, submit an answer via `/api/review/answer` and confirm the card and session advance
- Submitting a `cardId` that isn't the session's current card returns `session_state_invalid` (409)
- Unauthenticated requests to all three endpoints return 401

---

## Phase 4: Review UI

### Overview

Build the review experience as a dedicated protected page and React island, reusing existing shadcn primitives and the `GenerateWizard`-style step flow.

### Changes Required:

#### 1. Protected review page

**File**: `src/pages/review.astro` (new)

**Intent**: SSR shell mirroring `generate.astro`/`deck.astro`, mounting the review island.

**Contract**: renders page chrome and `<ReviewSessionView client:load />`. MVP does not require SSR-preloading session state — the island fetches its own state after mount.

#### 2. Top-level review state machine

**File**: `src/components/review/ReviewSessionView.tsx` (new)

**Intent**: own the `loading | idle | empty | reviewing | submitting | completed | error` state machine, call the three review endpoints, and render the appropriate child view.

**Contract**: calls `/api/review/current` on mount; calls `/api/review/session` on explicit start or resume; tracks `answeredCount`/`totalCount` for the progress display; submits ratings via `/api/review/answer`; re-hydrates cleanly from server state on refresh (no locally-owned queue).

#### 3. Single-card reveal/rate flow

**File**: `src/components/review/ReviewCard.tsx` (new)

**Intent**: present front/back and reveal flow for one review item — step 1 shows front + "Show answer", step 2 reveals back + rating buttons 0-5 (matches flashcard review UX better than showing the answer immediately).

**Contract**: props `card: ReviewCard`, `onReveal()`, `revealed: boolean`, `onRate(rating: 0|1|2|3|4|5)`, `disabled?: boolean`.

#### 4. Rating control

**File**: `src/components/review/ReviewRatingScale.tsx` (new)

**Intent**: reusable 0-5 rating control, kept separate so future label/tooltip adjustments and any S-04 button-sizing overlap stay isolated to one file.

**Contract**: numeric buttons 0-5; MVP labels: 0-2 = forgot/difficult, 3-5 = recalled/easier.

#### 5. Progress header (optional)

**File**: `src/components/review/ReviewProgress.tsx` (new, only if `ReviewSessionView` becomes crowded)

**Intent**: encapsulate the progress header and completion summary.

#### 6. Route protection

**File**: `src/middleware.ts`

**Intent**: guard the new page like the other authenticated routes.

**Contract**: add `/review` to `PROTECTED_ROUTES`.

#### 7. Optional dashboard entry point

**File**: `src/pages/dashboard.astro`

**Intent**: give users a discoverable way into the review flow without touching shared layout structure (S-04 overlap risk).

**Contract**: add one isolated link/CTA to `/review`; do not restructure the dashboard layout or touch `src/components/ui/button.tsx` defaults.

### UI behavior requirements

- Current card order must be stable for the entire session.
- User cannot submit twice while a request is in flight.
- Refresh after any point in the session resumes at the correct card.
- Empty state must clearly distinguish "no due cards" from a generic load failure.
- Completion state offers a clear next action (back to dashboard or deck).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- End-to-end: sign in, visit `/review`, complete a full session card-by-card, see the completion state
- Refresh mid-session resumes at the same card with correct progress count
- Visiting `/review` unauthenticated redirects to signin
- No-due-cards state renders distinctly from an error state
- Rating buttons are disabled while a submission is in flight (no double-submit)

---

## Phase 5: Verification and polish

### Overview

Run the full verification suite, execute the manual QA scenarios end-to-end, and sanity-check for merge conflicts against the parallel S-04 slice.

### Changes Required:

#### 1. Final lint/build pass

**Intent**: confirm the whole slice is clean together, not just per-phase.

**Contract**: `npm run lint` and `npm run build` both pass with zero errors across all new/changed files.

#### 2. Merge-conflict sanity against S-04

**Intent**: confirm S-03 did not touch shared control defaults or dashboard layout structure beyond the one isolated CTA.

**Contract**: diff review confirms only an isolated addition in `dashboard.astro` (if used) and no edits to `src/components/ui/button.tsx` or `src/layouts/Layout.astro`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with zero errors
- `npm run build` passes with zero errors

#### Manual Verification:

1. Start with due cards and complete a session
2. Refresh mid-session and resume correctly
3. Submit each rating 0-5 at least once across test cards
4. No-due-cards state
5. Second tab / stale submit conflict returns `session_state_invalid`
6. Unauthorized access to `/review` redirects to signin
7. Another user cannot read or manipulate someone else's active session or card schedule (cross-account RLS check)

---

## Testing Strategy

### Automated checks available in repo:

- `npm run lint`
- `npm run build`

### Manual Testing Steps:

1. **First session on migrated deck** — existing cards appear due; session starts successfully.
2. **Mid-session refresh** — answer some cards, refresh browser, confirm current card/progress resumes correctly.
3. **SM-2 schedule persistence** — submit a low rating (0/1/2) and confirm repetitions reset / near-term due date; submit a high rating (4/5) and confirm interval grows.
4. **No due cards** — make all cards not due; session start returns empty state.
5. **Stale submission** — answer in one tab, submit an old (already-advanced) card in another tab, confirm a conflict/state error.
6. **Ownership** — confirm another user cannot load or answer your session/card.

## Performance Considerations

No specific performance budget beyond existing app conventions; due-card lookups are indexed on `(user_id, due_date)` to keep session-start queries fast at MVP scale.

## Migration Notes

All pre-existing cards default to `due_date = now()` on migration, so the first review session after rollout may include the user's entire deck — acceptable for MVP but worth calling out during QA so it isn't mistaken for a bug.

## References

- `supabase/migrations/20260815000000_create_cards.sql`
- `supabase/migrations/20260823000000_harden_cards_rls.sql`
- `src/pages/api/cards.ts`
- `src/pages/api/cards/[id].ts`
- `src/pages/api/generate.ts`
- `src/lib/api.ts`
- `src/lib/services/cards.ts`
- `src/components/generate/GenerateWizard.tsx`
- `src/components/deck/DeckView.tsx`
- `src/pages/deck.astro`
- `src/pages/dashboard.astro`
- `src/middleware.ts`
- `context/foundation/prd.md` (FR-012, FR-013, NFR)
- `context/foundation/roadmap.md` (S-03, S-04 overlap notes)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema and shared contracts

#### Automated

- [x] 1.1 Migration applies cleanly against local Supabase — d274b34
- [x] 1.2 Type checking passes (npm run build) — d274b34
- [x] 1.3 Linting passes (npm run lint) — d274b34

#### Manual

- [x] 1.4 Existing rows show initialized SRS defaults after migration — d274b34
- [x] 1.5 Second active review_sessions row per user fails on unique index — d274b34

### Phase 2: Review services

#### Automated

- [x] 2.1 Linting passes (npm run lint) — e674928
- [x] 2.2 Build/type-check passes (npm run build) — e674928

#### Manual

- [x] 2.3 Low rating (1) resets repetitions and sets due_date +1 day — e674928
- [x] 2.4 High rating (5) with repetitions >= 2 grows interval via ease factor — e674928

### Phase 3: Review API

#### Automated

- [x] 3.1 Linting passes (npm run lint) — f667c64
- [x] 3.2 Build/type-check passes (npm run build) — f667c64

#### Manual

- [x] 3.3 REST round-trip: start session, current, answer all work end-to-end — f667c64
- [x] 3.4 Submitting non-current cardId returns session_state_invalid (409) — f667c64
- [x] 3.5 Unauthenticated requests to all three endpoints return 401 — f667c64

### Phase 4: Review UI

#### Automated

- [x] 4.1 Linting passes (npm run lint)
- [x] 4.2 Build passes (npm run build)

#### Manual

- [x] 4.3 End-to-end: complete a full review session from /review through completion state
- [x] 4.4 Refresh mid-session resumes at the same card with correct progress
- [x] 4.5 Unauthenticated visit to /review redirects to signin
- [x] 4.6 No-due-cards state renders distinctly from error state
- [x] 4.7 Rating buttons disabled during in-flight submission (no double-submit)

### Phase 5: Verification and polish

#### Automated

- [x] 5.1 npm run lint passes with zero errors — 097d865
- [x] 5.2 npm run build passes with zero errors — 097d865

#### Manual

- [x] 5.3 Start with due cards and complete a session — 1eea94c
- [x] 5.4 Refresh mid-session and resume correctly — 1eea94c
- [x] 5.5 Submit each rating 0-5 at least once across test cards — 1eea94c
- [x] 5.6 No-due-cards state — 1eea94c
- [x] 5.7 Second tab / stale submit conflict returns session_state_invalid — 1eea94c
- [x] 5.8 Unauthorized access to /review redirects to signin — 1eea94c
- [x] 5.9 Cross-account RLS check: another user cannot read/manipulate your session or card schedule — 1eea94c
