# SRS Review Session (S-03) Implementation Plan

## Executive Summary

Implement the first spaced-repetition slice on top of the existing authenticated deck: a signed-in user starts a review session, receives only cards due for review, reveals and self-rates each card on the SM-2 0–5 scale, and each answer immediately persists the next schedule back to `public.cards`. Because the PRD requires durability across refresh/close, session progress must be server-backed rather than in-memory. The lowest-risk fit for the current stack is: extend `cards` with SRS fields, add a small `review_sessions` table for durable progress, expose JSON review endpoints under `/api/review/*`, keep SM-2 math in a pure service, and render the flow as a dedicated React island on a new protected `/review` page. This keeps scheduling logic off the client, reuses the project’s established API/error/service patterns, and avoids conflicts with S-04 by leaving shared button defaults and dashboard polish largely untouched.

## Current State Analysis

### Existing schema and RLS baseline

- `supabase/migrations/20260815000000_create_cards.sql` creates `public.cards` with:
  - `id uuid primary key default gen_random_uuid()`
  - `user_id uuid not null references auth.users(id) on delete cascade`
  - `front text not null`
  - `back text not null`
  - `is_ai_generated boolean not null default false`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- The same migration enables RLS and defines four per-operation policies scoped to `auth.uid() = user_id`.
- `supabase/migrations/20260823000000_harden_cards_rls.sql` narrows all four policies to role `authenticated` and adds `cards_user_id_idx`.
- There are **no SRS columns yet**, so S-03 must add `ease_factor`, `interval`, `repetitions`, and `due_date` itself.
- The repo rule “every new Supabase table must enable RLS with per-operation, per-role policies in the same migration” means any durable session table introduced for refresh survival must ship with its own policies in the migration.

### Existing API conventions

- Auth endpoints in `src/pages/api/auth/*.ts` are form-post redirect handlers and are **not** the best review pattern.
- The real JSON API precedent is:
  - `src/pages/api/generate.ts`
  - `src/pages/api/cards.ts`
  - `src/pages/api/cards/[id].ts`
- Established route conventions:
  - `export const prerender = false;`
  - Check `context.locals.user` first; return 401 via `jsonError(...)`
  - Build Supabase via `createClient(context.request.headers, context.cookies)` and 500 if null
  - Parse JSON in a `try/catch`
  - Validate with `zod`
  - Return success via `jsonOk(...)`
  - Return errors in envelope `{ error: { code, message, context? } }` from `src/lib/api.ts`
- `src/pages/api/cards/[id].ts` shows the preferred dynamic route style and the project’s 404 behavior (`not_found`) when a row is absent or not owned.

### Existing service-layer conventions

- `src/lib/services/cards.ts` is the main repository pattern to extend:
  - owns DB access
  - maps snake_case rows to camelCase domain types
  - filters by `user_id` explicitly even though RLS already protects data
  - returns sentinel values (`null` / `false`) for “not found” instead of leaking existence details
- `src/lib/services/generation.ts` keeps external/business logic out of route files; S-03 should mirror that split with review-specific services.

### Existing page and React patterns

- `src/pages/deck.astro` server-loads data and hydrates a React island (`<DeckView client:load initialCards={cards} />`).
- `src/components/deck/DeckView.tsx` demonstrates local list state derived from SSR props and dialog orchestration.
- `src/components/deck/CardFormDialog.tsx` demonstrates the preferred async form pattern:
  - local reducer/state
  - field validation before fetch
  - disabled/loading states
  - inline error rendering from `ApiError`
- `src/components/generate/GenerateWizard.tsx` is the closest UX precedent for a multi-step client flow:
  - step/status state machine
  - fetch-based progression
  - success/error/empty states
  - progress indicator (`index + 1 / total`)
- `src/components/ui/button.tsx`, `card.tsx`, `dialog.tsx`, `alert-dialog.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx` are already present and should be reused rather than introducing new UI primitives.

### Existing types baseline

- `src/types.ts` currently exports:
  - `Card`
  - generation request/response DTOs
  - `CreateCardRequest`
  - `UpdateCardRequest`
  - `ApiError`
- No review/SRS contracts exist yet, so S-03 must define shared domain and API DTOs there.

### Routing and auth baseline

- `src/middleware.ts` guards `["/dashboard", "/generate", "/deck"]`.
- A new review page must be added to `PROTECTED_ROUTES`, otherwise users could deep-link to the page unauthenticated even if API calls are blocked.

## Desired End State

A signed-in user visits `/review`, starts a review session, and sees a due-card queue only for cards whose `due_date <= now()`. The UI shows one card at a time, lets the user reveal the answer, choose a self-rating from 0 to 5, and then advances to the next due card. After each answer:

- the card’s SM-2 fields (`ease_factor`, `interval`, `repetitions`, `due_date`) are recalculated server-side,
- the session progress is persisted server-side so refresh/close resumes cleanly,
- completed cards are not repeated incorrectly within the same session,
- the final state shows completion when no pending cards remain.

If there are no due cards, the user gets an explicit empty state instead of a broken session shell.

## Key Planning Decisions

### 1. Use SM-2 as a local pure service, not an external runtime dependency

Roadmap OQ-3 is already resolved to **SM-2**. The roadmap text explicitly names the four required columns (`ease_factor`, `interval`, `repetitions`, `due_date`), which are the native SM-2 state variables. The simplest implementation is a pure TypeScript function in `src/lib/services/review/sm2.ts` (or similar), not a library integration, because:

- the chosen algorithm is fixed and small,
- the project currently has no SRS dependency,
- the roadmap already defines the exact persisted state shape,
- keeping the logic in-repo avoids current-version/library-selection uncertainty during implementation.

### 2. Make progress durability server-backed with a `review_sessions` table

The NFR says refresh/accidental close must preserve progress and card order. Storing only client state in React or `localStorage` is insufficient because:

- it can drift from the authoritative schedule updates,
- it is device/browser-local,
- refresh after partial answer submission can produce ambiguous state,
- ordering must remain stable across reloads.

Therefore S-03 should introduce a durable table, e.g. `public.review_sessions`, storing:

- session owner (`user_id`)
- status (`active` / `completed` / maybe `abandoned`)
- ordered card queue snapshot
- current position / answered count
- timestamps

This lets `/api/review/session` resume an existing active session instead of starting a second one.

### 3. Persist schedule updates immediately on answer submission

For correctness and durability, `POST /api/review/answer` should update both:

- the card’s SRS columns, and
- the active session’s progress metadata

in one server operation. This ensures:

- refresh after a successful answer cannot lose that answer,
- the next due date is always durable immediately,
- no “finish session to save” step is required.

### 4. Use a dedicated `/review` page instead of overloading `/dashboard` or `/deck`

S-04 will likely touch `dashboard` and shared control sizing. To minimize merge conflicts, S-03 should put the main review experience on a separate page and add only a small link entry point from dashboard if needed.

## What We’re NOT Doing

- FR-014 (“show next scheduled review date per card”) remains out of scope; no deck-level schedule display is required in this slice.
- No refactor of existing generation or deck management components.
- No bulk review mode or table/list review UI; one card at a time only.
- No advanced scheduling analytics, lapse history, streaks, or per-answer audit log unless later slices require them.
- No anonymous or guest review flow.
- No cross-device conflict resolution beyond “one active session per user”; S-03 only needs deterministic MVP behavior.

## Technical Approach

Implement bottom-up in five layers:

1. **Data layer** — migrate `cards` with SM-2 fields; add `review_sessions` for durable progress and RLS.
2. **Type layer** — add SRS/review domain and API DTOs in `src/types.ts`.
3. **Service layer** — add pure SM-2 calculation utilities plus DB-backed review session services.
4. **API layer** — add review endpoints under `src/pages/api/review/`.
5. **UI layer** — add `/review` SSR page plus a dedicated React island to drive the session.

This mirrors the project’s proven slice pattern from S-01 and S-02: migration → service → API → React island → protected page.

---

## Section 1: Data Layer

### Overview

Extend `public.cards` with the four roadmap-mandated SRS columns and add a durable `public.review_sessions` table to preserve queue/progress across refreshes.

### Changes Required

#### 1. Cards migration: add SRS columns

**File**: `supabase/migrations/<timestamp>_add_srs_fields.sql` (new)

**Intent**: add the minimal persisted state SM-2 requires on each card.

**Columns to add**

- `ease_factor numeric(4,2) not null default 2.50`
- `interval integer not null default 0`
- `repetitions integer not null default 0`
- `due_date timestamptz not null default now()`

**Why these defaults**

- They make every existing card immediately eligible for review (`due_date = now()`), which is sensible for an MVP upgrade path.
- `interval = 0` and `repetitions = 0` clearly represent “never successfully reviewed.”
- `ease_factor = 2.50` is the standard SM-2 starting factor.

**Indexing**

- Add `cards_user_due_date_idx` on `(user_id, due_date)` because all “find due cards” queries will filter by owner and due date.

**RLS implications**

- Existing card policies already cover `UPDATE` on owned cards, so no new card policies are required.
- The route/service must keep filtering by both `id` and `user_id` to align with the existing pattern.

#### 2. Durable review session table

**File**: same migration as above

**Intent**: persist active session state independently of client memory.

**Recommended schema**

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `status text not null check (status in ('active','completed'))`
- `card_order jsonb not null` — ordered array of card UUIDs captured at session start
- `current_index integer not null default 0`
- `answered_count integer not null default 0`
- `total_count integer not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `completed_at timestamptz null`

**Rationale**

- `card_order` persists deterministic ordering without requiring a join table for MVP scale.
- `current_index` + `answered_count` are enough to resume progress.
- `status` allows enforcing at most one active session per user.

**Constraints / indexes**

- Partial unique index on active session:
  - `create unique index review_sessions_one_active_per_user_idx on public.review_sessions(user_id) where status = 'active';`
- Standard lookup index on `(user_id, status)`.
- Add `updated_at` trigger reuse via existing `public.set_updated_at()`.

#### 3. Review session RLS

**File**: same migration as above

**Intent**: keep durable session state private per user.

**Policies**

- `review_sessions: select own` → `USING (auth.uid() = user_id)` `TO authenticated`
- `review_sessions: insert own` → `WITH CHECK (auth.uid() = user_id)` `TO authenticated`
- `review_sessions: update own` → `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)` `TO authenticated`
- optional `delete own` only if implementation needs explicit cleanup; otherwise omit delete in MVP

### Success Criteria

- Supabase migration applies cleanly.
- Existing cards gain initialized SRS fields.
- Only one active review session can exist per user.
- A due-card lookup by `user_id + due_date` is indexed.

### Notes for Implementation

- Use `now()` / timestamptz consistently; do not store date-only values because review timing is easier to reason about and already matches existing schema style.
- Keep migration self-contained with RLS and indexes in the same file per repo rules.

---

## Section 2: API Layer

### Overview

Add JSON endpoints under `POST /api/review/*` for session start/resume, current-card retrieval, and answer submission, following the existing `jsonOk/jsonError` route style.

### Endpoint plan

#### 1. `POST /api/review/session`

**File**: `src/pages/api/review/session.ts` (new)

**Intent**: create a new active review session from currently due cards, or resume the user’s existing active session.

**Contract**

- `export const prerender = false`
- Requires auth; 401 if missing
- No request body required for MVP
- Behavior:
  1. check for existing active session for `user_id`
  2. if found, return that session plus current card snapshot
  3. otherwise query due cards where `due_date <= now()` for this user
  4. if zero due cards, return a success payload with `session: null`, `currentCard: null`, `summary: { totalDue: 0 }`
  5. if due cards exist, create active session with deterministic card order and return first card

**Response shape**

- `{ session: ReviewSession | null, currentCard: ReviewCard | null, summary: { totalDue: number } }`

**Why POST instead of GET**

- Starting may create server state.
- Resume/start is an action, not pure retrieval.

#### 2. `POST /api/review/current`

**File**: `src/pages/api/review/current.ts` (new)

**Intent**: return the current active session snapshot after refresh/hydration without re-running session creation logic on every component mount.

**Contract**

- 401 if unauthenticated
- Returns:
  - active session + current card if present
  - `{ session: null, currentCard: null }` if none active

**Why keep this separate**

- Makes client boot simpler after refresh.
- Lets the page ask “am I resuming?” without accidentally starting a new session if implementation later wants an explicit “Start review” CTA.

If implementation prefers fewer endpoints, this can collapse into `POST /api/review/session`, but keeping both yields a cleaner state model for the UI.

#### 3. `POST /api/review/answer`

**File**: `src/pages/api/review/answer.ts` (new)

**Intent**: accept one self-rating, update the card’s schedule via SM-2, advance/complete the session, and return the next card.

**Body schema**

```ts
z.object({
  sessionId: z.uuid(),
  cardId: z.uuid(),
  rating: z.number().int().min(0).max(5),
})
```

**Server flow**

1. Load the active session for `user_id` and validate `sessionId`.
2. Verify `cardId` matches the session’s current expected card.
3. Load the owned card row.
4. Calculate next SM-2 state server-side.
5. Persist the card update.
6. Advance `current_index` / `answered_count`; if finished, mark session `completed` and set `completed_at`.
7. Return:
   - updated session summary
   - `result` for the answered card
   - `nextCard` or `null` if complete

**Response shape**

- `{ session: ReviewSession, result: ReviewResult, nextCard: ReviewCard | null }`

**Error cases**

- `unauthorized` 401
- `invalid_input` 400 for malformed body
- `not_found` 404 if session/card missing or not owned
- `session_state_invalid` 409 if client submits a card that is not the current queued card
- `save_failed` 500 on unexpected persistence failure

### API implementation conventions to reuse

- Import `createClient` and `jsonError/jsonOk`
- Keep body parsing defensive (`try/catch`)
- Reuse zod exactly like cards/generate routes
- Keep business logic in services, not route files

---

## Section 3: State & Services

### Overview

Split S-03 into two service concerns:

1. pure SM-2 scheduling logic
2. DB-backed review session orchestration

### Service files

#### 1. `src/lib/services/review/sm2.ts` (new)

**Intent**: pure deterministic scheduling logic with no Supabase dependency.

**Inputs**

- current card SRS state: `easeFactor`, `interval`, `repetitions`
- answer rating `0..5`
- review timestamp (default now)

**Outputs**

- `nextEaseFactor`
- `nextInterval`
- `nextRepetitions`
- `nextDueDate`

**Planned algorithm contract**

- Ratings `< 3` count as failed recall:
  - `repetitions = 0`
  - `interval = 1`
  - `due_date = now + 1 day`
- Ratings `>= 3` count as success:
  - if repetitions was 0 → interval = 1
  - if repetitions was 1 → interval = 6
  - else interval = round(previousInterval * easeFactor)
  - repetitions increments by 1
- Ease factor update follows standard SM-2 formula:
  - `ef' = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))`
  - minimum ease factor floor `1.3`

**Why pure**

- easy to unit-test later if tests are added
- isolates algorithm changes from DB code
- prevents client/server divergence because API remains the single caller

#### 2. `src/lib/services/review/session.ts` (new)

**Intent**: own review-session persistence and orchestration.

**Responsibilities**

- find active session for a user
- list due cards
- create session snapshot
- resolve current card from session state
- validate answer order
- submit answer atomically from the application perspective

**Suggested exported functions**

- `getActiveReviewSession(supabase, userId): Promise<ReviewSession | null>`
- `startOrResumeReviewSession(supabase, userId): Promise<StartReviewSessionResult>`
- `getCurrentReviewSnapshot(supabase, userId): Promise<ReviewSnapshot | null>`
- `submitReviewAnswer(supabase, userId, input: CardAnswer): Promise<ReviewAnswerResponse>`

**Mapping conventions**

- Follow `cards.ts` row-mapping style.
- Keep `review_sessions` snake_case hidden behind mapper helpers.

#### 3. Reuse and extend card service cautiously

**File**: `src/lib/services/cards.ts`

Two safe options:

- keep review-specific card updates inside `review/session.ts`, or
- add a narrowly scoped helper such as `getDueCards(...)`

To avoid coupling deck CRUD with review scheduling too early, prefer keeping most review logic in the new review service namespace and only sharing generic row mapping if helpful.

### Durability model

The UI must not be the source of truth. Persistence strategy:

- server owns active queue order in `review_sessions.card_order`
- server owns current pointer in `current_index`
- each answer updates schedule + session before the API responds
- refresh uses `/api/review/current` to resume

This fully satisfies the NFR better than local-only state.

### Concurrency / edge-case rules

- Enforce one active session per user via DB unique partial index.
- If two tabs submit concurrently, only the first valid current-card submission should succeed; the second should receive `session_state_invalid` once the pointer has advanced.
- If a card is deleted outside the session mid-run, treat answer submission as `not_found` and decide whether to fail the session or skip the missing card. MVP recommendation: fail safely with explicit error, then let the user restart the session.

---

## Section 4: React Components

### Overview

Build the review experience as a dedicated React island on a new protected `/review` page, reusing existing shadcn primitives and the GenerateWizard-style step flow.

### Files to add / change

#### 1. `src/pages/review.astro` (new)

**Intent**: protected SSR shell for the review experience.

**Pattern**

- mirror `generate.astro` / `deck.astro`
- render page chrome and mount `<ReviewSessionView client:load />`

**Optional server preload**

- MVP can let the island fetch its own session state after mount.
- If desired later, the page can SSR-inject an initial snapshot, but that is not required for first implementation.

#### 2. `src/components/review/ReviewSessionView.tsx` (new)

**Intent**: top-level state machine for the review flow.

**States**

- `loading`
- `idle` (no active session yet; show Start button)
- `empty` (no due cards)
- `reviewing`
- `submitting`
- `completed`
- `error`

**Responsibilities**

- call `/api/review/current` on mount
- call `/api/review/session` on explicit start or resume
- show progress (`answeredCount / totalCount`)
- render current card
- submit ratings
- recover cleanly on refresh by re-hydrating from server

#### 3. `src/components/review/ReviewCard.tsx` (new)

**Intent**: present front/back and reveal flow for one review item.

**Recommended UX**

- Step 1: show front only + “Show answer”
- Step 2: reveal back + rating buttons 0–5

This better matches flashcard review than showing answer immediately.

**Props**

- `card: ReviewCard`
- `onReveal()`
- `revealed: boolean`
- `onRate(rating: 0|1|2|3|4|5)`
- `disabled?: boolean`

#### 4. `src/components/review/ReviewRatingScale.tsx` (new)

**Intent**: reusable 0–5 answer control.

**Why separate**

- keeps the main card component small
- easier to adjust labels/tooltips without touching flow logic
- isolates any future overlap with S-04 button sizing into one file

**Suggested labels**

- 0–2 = forgot / difficult
- 3–5 = recalled / easier

Need not over-explain in MVP; numeric buttons are the core requirement.

#### 5. Optional `src/components/review/ReviewProgress.tsx` (new)

**Intent**: encapsulate progress header and completion summary if the top-level component becomes crowded.

### UI behavior requirements

- Current card order must be stable for the entire session.
- User cannot submit twice while a request is in flight.
- Refresh after any point in the session resumes at the correct card.
- Empty state must clearly distinguish “no due cards” from generic load failure.
- Completion state should offer a clear next action (back to dashboard or deck).

### Styling guidance

- Reuse `Button`, `Card`, `CardContent`, `CardHeader`, `CardTitle`.
- Use `cn()` for any conditional Tailwind classes.
- Avoid changing shared default button sizes in `src/components/ui/button.tsx`; S-04 owns global control sizing work.

---

## Section 5: Type Contracts

### Overview

Add shared review/SRS types to `src/types.ts` so route handlers, services, and React components share one contract surface.

### Proposed additions

#### 1. Card shape with SRS fields

```ts
export interface CardWithSRS extends Card {
  easeFactor: number;
  interval: number;
  repetitions: number;
  dueDate: string;
}
```

#### 2. Review-session card payload

Use a narrower payload for active review screens:

```ts
export interface ReviewCard {
  id: string;
  front: string;
  back: string;
  dueDate: string;
}
```

This prevents over-sending unrelated metadata while still letting the session UI render the full card.

#### 3. Review session state

```ts
export interface ReviewSession {
  id: string;
  status: "active" | "completed";
  currentIndex: number;
  answeredCount: number;
  totalCount: number;
  cardOrder: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
```

#### 4. Answer payload

```ts
export interface CardAnswer {
  sessionId: string;
  cardId: string;
  rating: 0 | 1 | 2 | 3 | 4 | 5;
}
```

#### 5. Answer result payload

```ts
export interface ReviewResult {
  cardId: string;
  rating: 0 | 1 | 2 | 3 | 4 | 5;
  previousEaseFactor: number;
  previousInterval: number;
  previousRepetitions: number;
  nextEaseFactor: number;
  nextInterval: number;
  nextRepetitions: number;
  nextDueDate: string;
}
```

#### 6. Endpoint response helpers

Also add explicit response DTOs if helpful:

- `StartReviewSessionResponse`
- `CurrentReviewResponse`
- `SubmitReviewAnswerResponse`

These are optional but recommended because the review flow is more stateful than existing card CRUD.

---

## Shared Dependencies / Overlap with S-04 (ui-improvements)

### Known S-04 touch points

Per user context, S-04 may touch:

- `Dashboard.tsx` / dashboard experience
- `src/components/ui/*` for control sizing
- `src/layouts/Layout.astro` possibly

### S-03 overlap risk assessment

#### Low-risk / acceptable overlap

- `src/pages/dashboard.astro` — only if S-03 adds a small “Start review” CTA/link
- `src/components/ui/button.tsx` — only as a consumer, not a modifier
- `src/layouts/Layout.astro` — likely no change needed for S-03

#### Avoid to reduce conflicts

- Do **not** globally resize `Button` variants in S-03.
- Do **not** refactor dashboard layout structure unless strictly needed to expose the review link.
- Do **not** modify existing generation/deck islands.
- Do **not** rework shared shell styling as part of review implementation.

### Recommended conflict-avoidance strategy

- Put new review UI in `src/components/review/*`.
- Put the main experience on `src/pages/review.astro`.
- If dashboard needs a new entry point, add one isolated anchor/button block only.
- Treat any shared `ui/*` changes as S-04-owned unless S-03 is blocked.

---

## Specific Files Expected to Be Touched

### New files

- `supabase/migrations/<timestamp>_add_srs_fields_and_review_sessions.sql`
- `src/pages/api/review/session.ts`
- `src/pages/api/review/current.ts`
- `src/pages/api/review/answer.ts`
- `src/pages/review.astro`
- `src/components/review/ReviewSessionView.tsx`
- `src/components/review/ReviewCard.tsx`
- `src/components/review/ReviewRatingScale.tsx`
- `src/components/review/ReviewProgress.tsx` (optional)
- `src/lib/services/review/sm2.ts`
- `src/lib/services/review/session.ts`

### Existing files to change

- `src/types.ts` — add SRS/review contracts
- `src/middleware.ts` — add `/review` to `PROTECTED_ROUTES`
- `src/pages/dashboard.astro` — optional small CTA/link to review page
- `src/lib/services/cards.ts` — only if a shared due-card helper is worthwhile; otherwise leave untouched

### Files overlapping S-04 risk

- `src/pages/dashboard.astro` **overlaps with S-04**
- `src/components/ui/button.tsx` **should not be edited by S-03**
- `src/layouts/Layout.astro` **possible overlap; avoid unless necessary**

### Files explicitly to avoid

- `src/components/deck/DeckView.tsx`
- `src/components/deck/CardFormDialog.tsx`
- `src/components/generate/GenerateWizard.tsx`
- existing auth components unless a bug blocks review routing

---

## Risks & Unknowns

### 1. Session durability design complexity

The biggest implementation risk is the NFR. If the team tries to satisfy it with local-only React state, the feature will likely violate the requirement. The plan intentionally chooses a server-backed session table to remove ambiguity.

### 2. Atomicity of answer submission

Updating both the card schedule and the session pointer should behave atomically from the user’s perspective. Supabase JS against plain tables does not give a multi-statement transaction in client code by default, so implementation should be careful:

- either encapsulate the answer operation in a Postgres function/RPC if needed for strong atomicity, or
- keep the update flow in one route/service call and handle failures defensively.

For MVP, start with one route/service operation; if consistency issues appear during implementation, escalate to an RPC-backed transaction.

### 3. Ordering semantics

The PRD requires that cards are not shown out of order or repeated incorrectly. The plan resolves this by snapshotting `card_order` at session start. Implementation should not re-query due cards and reorder mid-session.

### 4. Existing cards migration behavior

Because all pre-existing cards will default to `due_date = now()`, the first review session after rollout may include the user’s whole deck. That is acceptable for MVP, but should be acknowledged in QA.

### 5. Multi-tab behavior

The app may be opened in two tabs. One-active-session-per-user plus current-card validation should make behavior deterministic, but QA should explicitly test this.

### 6. No automated test harness

The repo currently exposes `npm run lint` and `npm run build`, but no unit/integration test suite. Validation therefore relies on:

- lint
- build
- migration sanity
- manual scenario testing

Future slices may justify adding tests, but S-03 should not introduce a new framework purely for this feature.

---

## Phase Breakdown

## Phase 1: Schema and shared contracts

### Scope

- add SRS columns to `cards`
- add `review_sessions` table + RLS + indexes
- extend `src/types.ts`

### Exit criteria

- migration applies cleanly
- types compile
- existing app still builds with new nullable/non-null assumptions handled

## Phase 2: Review services

### Scope

- implement SM-2 pure function
- implement review session DB service
- implement due-card lookup and active-session resume logic

### Exit criteria

- services can:
  - return no-due state
  - start a new session
  - resume active session
  - submit an answer and compute next schedule

## Phase 3: Review API

### Scope

- add `/api/review/session`
- add `/api/review/current`
- add `/api/review/answer`

### Exit criteria

- endpoints follow JSON envelope convention
- auth and ownership checks work
- invalid rating / stale card submission returns the intended errors

## Phase 4: Review UI

### Scope

- add `/review`
- add React review components
- add optional dashboard entry point with minimal changes

### Exit criteria

- user can complete end-to-end review flow from browser
- refresh resumes current card and progress accurately
- empty, error, and completed states are present

## Phase 5: Verification and polish

### Scope

- lint/build
- manual QA of happy path and failure cases
- merge-conflict sanity against S-04 touch points

### Exit criteria

- success criteria below are met

---

## Success Criteria

### Functional

- User can start a review session from a protected review page.
- Only cards due for review are included.
- User can reveal each card’s answer and submit a self-rating 0–5.
- Each answer updates the card’s SRS fields according to SM-2.
- Session advances card-by-card without reordering or duplication.
- Refreshing the browser resumes the same session at the same point.
- Completing the last card marks the session complete and shows a completion state.
- If no cards are due, user sees a no-due empty state.

### Data / security

- New card schedule data is persisted in `public.cards`.
- Review session progress is isolated per authenticated user via RLS.
- Another user cannot read or manipulate someone else’s active session or card schedule.

### Verification

- `npm run lint`
- `npm run build`
- Manual migration verification in Supabase/local DB
- Manual end-to-end scenarios:
  1. start with due cards and complete a session
  2. refresh mid-session and resume correctly
  3. submit each rating 0–5 at least once across test cards
  4. no due cards state
  5. second tab / stale submit conflict
  6. unauthorized access to `/review` redirects to signin

---

## Testing Strategy

### Automated checks available in repo

- `npm run lint`
- `npm run build`

### Manual scenarios required

1. **First session on migrated deck**
   - existing cards appear due
   - session starts successfully
2. **Mid-session refresh**
   - answer some cards
   - refresh browser
   - current card/progress resumes correctly
3. **SM-2 schedule persistence**
   - submit low rating (`0`, `1`, or `2`) and confirm repetitions reset / near-term due date
   - submit high rating (`4`/`5`) and confirm interval grows
4. **No due cards**
   - make all cards not due
   - session start returns empty state
5. **Stale submission**
   - answer in one tab
   - submit old card in another
   - receive conflict/state error
6. **Ownership**
   - ensure another user cannot load or answer your session/card

---

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
