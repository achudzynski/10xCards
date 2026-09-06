# Deck Management (Manual Card Create/Edit/Delete) — Plan Brief

> Full plan: `context/changes/deck-management/plan.md`

## What & Why

Add manual flashcard creation, editing, and deletion to the deck view so users aren't limited to AI-generated cards. This is roadmap slice S-02, satisfying FR-008 (create), FR-010 (edit), FR-011 (delete) — the smallest remaining slice in the Creation Loop stream, sequenced right after S-01 (first-gated-generation).

## Starting Point

`/deck` (`deck.astro`) already server-fetches and renders cards read-only via `listCards()`. `POST /api/cards` already exists (built for the AI-generation gating flow) and can be reused as-is for manual creation. There is no update/delete endpoint, no dynamic `[id]` API route, and no client-side interactivity on the deck page today. The `cards` table has no SRS columns yet (deferred to S-03), so the roadmap's "edit must preserve SRS schedule" risk doesn't apply.

## Desired End State

A signed-in user on `/deck` can click "Add card" to create one via a dialog, click "Edit" on any card to change its front/back in the same dialog component, and click "Delete" to remove a card after confirming in an alert dialog — all without a full page reload, and all changes persist to Supabase.

## Key Decisions Made

| Decision                          | Choice                                              | Why (1 sentence)                                                                 |
| ---------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Create entry point                | "Add card" button opens a dialog                      | Keeps the page mostly static, matches the existing modal-like gating UX          |
| Edit UX                           | Shared create/edit dialog                             | One component, consistent with the create dialog, matches GenerateWizard's pattern |
| Delete confirmation               | AlertDialog before delete                             | Prevents accidental permanent data loss (hard delete, no undo)                    |
| List update strategy              | Update from response, no full refetch                 | Instant feel without adding true pre-response optimistic rollback complexity      |
| Deck list architecture            | Whole list becomes a React island (`DeckView`)        | Only way newly-created cards can appear without a page reload                     |
| Not-found vs forbidden             | Always 404 `not_found`, never 403                     | Avoids leaking whether another user's card id exists                             |
| Testing approach                  | Manual verification only                              | No test runner in the project yet; matches S-01 precedent                        |
| Fallback priority if time is tight | None — create/edit/delete are all must-have           | All three are explicitly required by FR-008/010/011; roadmap frames this as smallest slice |

## Scope

**In scope:**
- `PATCH`/`DELETE /api/cards/{id}` endpoints
- `updateCard`/`deleteCard` service functions
- `dialog` + `alert-dialog` shadcn primitives
- `DeckView`, `CardFormDialog`, `DeleteCardDialog` React components
- Wiring `deck.astro` to mount `DeckView` with server-fetched cards as initial props

**Out of scope:**
- SRS scheduling fields/logic (S-03)
- A `GET /api/cards` refetch endpoint
- Toast/undo mechanism
- Automated tests
- True pre-response optimistic UI with rollback
- Bulk/multi-select operations

## Architecture / Approach

Same layered pattern as S-01: DB (RLS, `user_id` scoped) → Service (snake↔camel mapping) → API route (auth + zod + envelope) → React island (fetch calls, local state). The deck list becomes client-state-driven so create/edit/delete can update it in place; `CardFormDialog` handles both create (POST) and edit (PATCH) via one component, switching on whether a `card` prop is passed.

## Phases at a Glance

| Phase                              | What it delivers                                                        | Key risk                                                        |
| ----------------------------------- | -------------------------------------------------------------------------| ------------------------------------------------------------------ |
| 1. Service & API layer              | `updateCard`/`deleteCard` + `PATCH`/`DELETE /api/cards/{id}`             | Getting the "not found vs not owned → always 404" mapping right via `PGRST116` handling |
| 2. shadcn UI primitives              | `dialog` + `alert-dialog` installed                                      | Low risk — CLI install, no custom logic                          |
| 3. Deck React island                 | `DeckView`, `CardFormDialog`, `DeleteCardDialog`, wired into `deck.astro` | Keeping list state in sync with server responses without a refetch endpoint |

**Prerequisites:** S-01 (done) — cards must exist to edit/delete.
**Estimated effort:** ~1 session across 3 phases; smallest roadmap slice.

## Open Risks & Assumptions

- Assumes `.single()` on a Supabase `.update()` with no matching rows reliably throws `PGRST116` — this is the standard PostgREST/supabase-js behavior but should be confirmed during Phase 1 implementation.
- No rollback-on-error handling for the client list means a failed create/edit/delete simply surfaces an inline error and leaves state untouched (not a true optimistic update) — acceptable per the chosen strategy, but worth re-confirming if a future slice wants true optimistic UI.

## Success Criteria (Summary)

- User can create, edit, and delete a card from `/deck` without a full page reload, and all three actions persist across a page refresh.
- A card belonging to another user cannot be edited or deleted (404, not leaked via a different status code).
- Empty front/back is blocked client-side before any network call.
