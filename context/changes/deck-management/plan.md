# Deck Management (Manual Card Create/Edit/Delete) Implementation Plan

## Overview

Extend the deck view so a user can create a flashcard manually, edit any saved card, and delete any saved card — without leaving `/deck`. This is roadmap slice **S-02: deck-management**, satisfying FR-008 (manual creation), FR-010 (edit), FR-011 (delete).

## Current State Analysis

- `deck.astro` server-fetches cards via `listCards()` and renders a static, read-only `<ul>` of `UiCard` items. There is no client-side interactivity on this page today.
- `POST /api/cards` already exists (used by the AI-generation gating flow in `GenerateWizard.tsx`) and can be reused as-is for manual creation — it does not assume the card came from AI generation.
- No `PATCH`/`DELETE` endpoint exists for individual cards, and no dynamic `[id]` route exists under `src/pages/api/cards/`.
- The `cards` table (`supabase/migrations/20260815000000_create_cards.sql`, hardened in `20260823000000_harden_cards_rls.sql`) has RLS policies scoping SELECT/INSERT/UPDATE/DELETE to `auth.uid() = user_id`, `TO authenticated`. It has **no SRS columns** (`ease_factor`, `interval`, etc.) — those are deferred to S-03, so the roadmap's "edit must preserve SRS schedule" risk does not apply yet; editing today only ever touches `front`/`back`.
- `src/components/ui/` has `button`, `card`, `input`, `label`, `textarea` installed. No `dialog` or `alert-dialog` primitive exists yet.
- `src/lib/api.ts` provides the project-wide `jsonOk`/`jsonError` envelope helpers (`{ error: { code, message, context? } }`).
- `src/lib/services/cards.ts` establishes the snake_case-row → camelCase-domain mapping convention (`mapRow`) that new service functions must follow.

## Desired End State

A user on `/deck` can:
- Click "Add card", fill in front/back in a dialog, and see the new card appear at the top of the list immediately on success.
- Click "Edit" on any card, change front/back in the same dialog component (pre-filled), and see the card update in place on success.
- Click "Delete" on any card, confirm in an alert dialog, and see the card removed from the list on success.

All three actions call the new `PATCH`/`DELETE /api/cards/{id}` endpoints (create reuses the existing `POST /api/cards`), validate ownership via RLS + explicit `user_id` filters, and update the client-side list from the API response — no full-page reload or full-list refetch.

**Verification**: manual — sign in, visit `/deck`, perform create/edit/delete, confirm each persists after a hard page refresh (proves the API call — not just local state — succeeded), and confirm a card belonging to another user cannot be edited/deleted (404).

### Key Discoveries:

- `src/pages/api/cards.ts:9-12` — the existing zod schema (`front`/`back`, trimmed, 1-100 chars) is the exact validation contract to mirror for update.
- `src/lib/services/cards.ts:14-24` — `mapRow()` is the established snake↔camel mapping helper; new functions must reuse it, not duplicate the mapping.
- `src/components/generate/GenerateWizard.tsx` — establishes the client-side form patterns to follow: field-level error state, `isSaving`/`saveError` async state, zod-mirrored client validation, and Loader2/inline error display conventions.
- `src/middleware.ts` — `/deck` is already in `PROTECTED_ROUTES`, so the page itself is guarded; API routes still re-check `context.locals.user` per the established defense-in-depth pattern from S-01.
- `context/foundation/lessons.md` — shadcn primitives already installed must be reused, not hand-rolled; this plan installs `dialog` and `alert-dialog` via the shadcn CLI rather than hand-building modals.

## What We're NOT Doing

- No SRS scheduling fields or logic — out of scope until S-03.
- No full-list `GET /api/cards` refetch endpoint — the deck list is server-rendered once on page load, then kept in sync client-side from create/edit/delete responses only.
- No toast/undo mechanism — errors are shown inline in the relevant dialog.
- No automated tests — the project has no test runner configured yet; this slice follows the same manual-verification-only precedent as S-01.
- No pre-response ("true") optimistic UI with rollback — the client list updates only after the API call succeeds, which satisfies "no full refetch" without the added complexity of rollback-on-error state.
- No bulk operations (multi-select delete, etc.) — one card at a time, matching FR-008/010/011 scope.

## Implementation Approach

Follow the exact layered pattern S-01 established: DB (RLS) → Service (snake↔camel mapping + Supabase calls) → API Route (auth check + zod validation + service call, `{ error: { code, message, context } }` envelope) → React island (fetch calls, local state).

The deck list itself becomes a React island (`DeckView`) so that a newly-created or edited card can appear without a page reload. `deck.astro` keeps its server-side `listCards()` fetch and error-state handling, but hands the fetched cards to `DeckView` as `initialCards` instead of rendering the `<ul>` itself.

One shared `CardFormDialog` component handles both create and edit (differing only in initial values and whether it POSTs or PATCHes), matching the "single dialog" decision and minimizing duplicated form logic. A separate `DeleteCardDialog` (shadcn `AlertDialog`) handles delete confirmation.

## Phase 1: Service & API layer

### Overview

Add `updateCard`/`deleteCard` to the service layer and a new `PATCH`/`DELETE /api/cards/{id}` route, mirroring the existing `POST /api/cards` conventions exactly (auth check, supabase-null check, zod validation, `jsonOk`/`jsonError` envelope).

### Changes Required:

#### 1. Shared types

**File**: `src/types.ts`

**Intent**: Add the request DTO for partial card updates, used by both the API route's zod schema and the client dialog's fetch call.

**Contract**: `UpdateCardRequest { front?: string; back?: string }` — both fields optional but at least one must be present (enforced by the route's zod `.refine`, not the type itself).

#### 2. Service layer

**File**: `src/lib/services/cards.ts`

**Intent**: Add `updateCard` and `deleteCard`, following the existing `createCard`/`listCards` shape — same `mapRow` reuse, same "throw on unexpected Supabase error" behavior, but returning a sentinel for "not found or not owned" so the route can map it to 404 without a separate existence check (avoids the ID-leak tradeoff already decided against).

**Contract**:
- `updateCard(supabase, userId, cardId, input: UpdateCardRequest): Promise<Card | null>` — issues `.from("cards").update({...}).eq("id", cardId).eq("user_id", userId).select(...).single()`. Supabase's `.single()` raises a `PGRST116` ("no rows") error when the `id`+`user_id` filter matches nothing (wrong owner or nonexistent id); catch that specific code and return `null` instead of rethrowing. Any other error still rethrows.
- `deleteCard(supabase, userId, cardId): Promise<boolean>` — issues `.from("cards").delete().eq("id", cardId).eq("user_id", userId).select("id")` (the `.select()` after `.delete()` returns the deleted rows so the result is inspectable). Returns `true` if one row came back, `false` if zero (not found or not owned).

#### 3. API route

**File**: `src/pages/api/cards/[id].ts` (new dynamic route)

**Intent**: Handle `PATCH` (partial update) and `DELETE` for a single card, reusing the exact auth/validation/envelope pattern from `src/pages/api/cards.ts`.

**Contract**:
- `export const prerender = false;`
- Both handlers: 401 `unauthorized` if no `context.locals.user`; 500 `server_misconfigured` if `createClient()` returns null; validate `context.params.id` with `z.string().uuid()` → 400 `invalid_input` on failure (malformed id can never match a row, but validating up front avoids a wasted DB round-trip and gives a clearer error).
- `PATCH`: body schema `z.object({ front: z.string().trim().min(1).max(100).optional(), back: z.string().trim().min(1).max(100).optional() }).refine((v) => v.front !== undefined || v.back !== undefined, { message: "At least one of front or back must be provided" })`. On `updateCard` returning `null` → 404 `not_found`, message "Card not found". On success → `jsonOk({ card }, 200)`. On unexpected service error → 500 `save_failed`.
- `DELETE`: no body parsing. On `deleteCard` returning `false` → 404 `not_found`. On success → `jsonOk({ success: true }, 200)`. On unexpected service error → 500 `delete_failed`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run astro check` (via `@astrojs/check`, run through `npx astro check`)
- Linting passes: `npm run lint`

#### Manual Verification:

- `PATCH /api/cards/{id}` with a valid id and `{ front: "x" }` updates only `front`, leaves `back` and `updated_at` correctly bumped, and returns the updated card
- `PATCH`/`DELETE` with another user's card id (or a random uuid) returns 404 `not_found`
- `PATCH` with an empty body `{}` returns 400 `invalid_input`
- `DELETE` on an existing owned card removes the row from the database (verify via a subsequent deck page reload)

---

## Phase 2: shadcn UI primitives

### Overview

Install the `dialog` and `alert-dialog` shadcn/ui primitives needed for the create/edit form and the delete confirmation, per the project convention of never hand-rolling markup for which an installable primitive exists.

### Changes Required:

#### 1. Install primitives

**Intent**: Add the two missing shadcn components used by Phase 3's `CardFormDialog` and `DeleteCardDialog`.

**Contract**: Run `npx shadcn@latest add dialog alert-dialog`, which writes `src/components/ui/dialog.tsx` and `src/components/ui/alert-dialog.tsx` (new-york variant, matching the rest of `src/components/ui/`).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build succeeds: `npm run build` (requires `SUPABASE_URL`/`SUPABASE_KEY` in env per repo convention)

#### Manual Verification:

- `src/components/ui/dialog.tsx` and `src/components/ui/alert-dialog.tsx` exist and export the standard shadcn API (`Dialog`, `DialogContent`, `DialogTrigger`, `AlertDialog`, `AlertDialogAction`, etc.)

---

## Phase 3: Deck React island (create, edit, delete UI)

### Overview

Replace `deck.astro`'s static card list with a `DeckView` React island that owns the card list in local state, seeded from the server-fetched cards, and renders the Add/Edit/Delete affordances.

### Changes Required:

#### 1. Card form dialog (create + edit)

**File**: `src/components/deck/CardFormDialog.tsx` (new)

**Intent**: One dialog component used for both "Add card" and "Edit card". Mode is determined by whether a `card` prop is passed (edit) or not (create). Mirrors `GenerateWizard.tsx`'s field-error/`isSaving`/`saveError` state pattern and its client-side validation (trim, 1-100 chars) so errors surface before hitting the network.

**Contract**: Props: `{ open: boolean; onOpenChange: (open: boolean) => void; card?: Card; onSaved: (card: Card) => void }`. On submit: if `card` is undefined, `POST /api/cards` with `{ front, back }`; if defined, `PATCH /api/cards/${card.id}` with only the changed field(s) (or both, simplest to always send both — either is a valid contract since the route accepts partial or full). On success, call `onSaved(card)` with the returned `Card` and close the dialog. On failure, show `saveError` inline from the response's `error.message`, keep the dialog open.

#### 2. Delete confirmation dialog

**File**: `src/components/deck/DeleteCardDialog.tsx` (new)

**Intent**: `AlertDialog`-based confirmation before calling `DELETE /api/cards/{id}`.

**Contract**: Props: `{ open: boolean; onOpenChange: (open: boolean) => void; card: Card; onDeleted: (cardId: string) => void }`. On confirm: `DELETE /api/cards/${card.id}`; on success call `onDeleted(card.id)` and close; on failure show an inline error inside the alert dialog and keep it open (do not silently close on failure).

#### 3. Deck list island

**File**: `src/components/deck/DeckView.tsx` (new)

**Intent**: Own the card list as client state, render the existing empty-state / card-list markup (moved from `deck.astro`), and wire up Add/Edit/Delete actions to the two dialogs above.

**Contract**: Props: `{ initialCards: Card[] }`. State: `cards: Card[]` initialized from `initialCards`; dialog open/target state for both `CardFormDialog` and `DeleteCardDialog`. `onSaved` from `CardFormDialog`: if the saved card's id already exists in `cards`, replace it in place; otherwise prepend it to the list (new card). `onDeleted` from `DeleteCardDialog`: filter it out of `cards` by id. Reuses `UiCard`/`CardContent` from `src/components/ui/card.tsx` for each row per the lessons.md rule, and adds an Edit/Delete `Button` pair (icon buttons, `lucide-react` `Pencil`/`Trash2`, matching `GenerateWizard.tsx`'s icon usage) to each row. Renders the existing empty-state markup itself when `cards.length === 0`, with the "Add card" button still available.

#### 4. Deck page wiring

**File**: `src/pages/deck.astro`

**Intent**: Keep the server-side `listCards()` fetch and `loadError` handling as-is; replace the static `<ul>` rendering with the `DeckView` island.

**Contract**: When `!loadError`, render `<DeckView client:load initialCards={cards} />` instead of the current `<ul>`/empty-state block. Keep the `loadError` branch server-rendered (no island — nothing to hydrate if the initial fetch failed). Remove the now-unused inline empty-state markup from the `.astro` file (moved into `DeckView`).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Visiting `/deck` with existing cards shows them via the new island, visually consistent with the prior static rendering
- Clicking "Add card", submitting valid front/back, shows the new card at the top of the list without a page reload; refreshing the page confirms it persisted
- Clicking "Edit" on a card, changing front/back, submitting, shows the updated values in place without a page reload; refreshing confirms persistence
- Clicking "Delete" on a card shows the confirmation dialog; confirming removes it from the list without a page reload; refreshing confirms it's gone; canceling leaves the card untouched
- Submitting a create/edit with an empty front or back shows an inline validation error and does not call the API
- Attempting any action while a request is in-flight shows a disabled/loading state (no double-submit)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding further.

---

## Testing Strategy

### Unit Tests:

- None — no test runner configured in this project (see "What We're NOT Doing").

### Integration Tests:

- None — manual verification only, per project precedent.

### Manual Testing Steps:

1. Sign in, visit `/deck`.
2. Click "Add card", enter front/back, submit — confirm it appears immediately and survives a page refresh.
3. Edit an existing card (including a just-created one) — confirm changes appear immediately and survive a refresh.
4. Delete a card — confirm the confirmation dialog appears, canceling does nothing, confirming removes it and it stays gone after refresh.
5. Try to `PATCH`/`DELETE` a card id that isn't yours (e.g. via browser devtools/curl with a second test account's card id) — confirm 404, not 403 or 200.
6. Try submitting an empty front/back in the create and edit dialogs — confirm inline validation blocks the request.

## Performance Considerations

None beyond existing per-user query scoping (`cards_user_id_idx` already covers the `user_id` filter used by all four operations).

## Migration Notes

No schema changes — reuses the existing `cards` table as-is.

## References

- Related plan (F-01, schema): `context/archive/2026-08-15-card-schema/plan.md`
- Related plan (S-01, gating flow): `context/archive/2026-08-23-first-gated-generation/plan.md`
- Existing create endpoint to mirror: `src/pages/api/cards.ts`
- Existing service conventions: `src/lib/services/cards.ts`
- Existing client form/dialog patterns: `src/components/generate/GenerateWizard.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Service & API layer

#### Automated

- [x] 1.1 Type checking passes: `npm run astro check`
- [x] 1.2 Linting passes: `npm run lint`

#### Manual

- [x] 1.3 PATCH with valid id updates only the given field(s) and returns the updated card
- [x] 1.4 PATCH/DELETE with another user's or nonexistent card id returns 404 not_found
- [x] 1.5 PATCH with an empty body returns 400 invalid_input
- [x] 1.6 DELETE on an owned card removes the row (verified via deck reload)

### Phase 2: shadcn UI primitives

#### Automated

- [ ] 2.1 Linting passes: `npm run lint`
- [ ] 2.2 Build succeeds: `npm run build`

#### Manual

- [ ] 2.3 dialog.tsx and alert-dialog.tsx exist and export the standard shadcn API

### Phase 3: Deck React island (create, edit, delete UI)

#### Automated

- [ ] 3.1 Type checking passes: `npx astro check`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Build succeeds: `npm run build`

#### Manual

- [ ] 3.4 Existing cards render via the new island, visually consistent with prior rendering
- [ ] 3.5 Add card appears immediately and persists after refresh
- [ ] 3.6 Edit updates in place immediately and persists after refresh
- [ ] 3.7 Delete confirmation dialog works; confirm removes and persists, cancel leaves untouched
- [ ] 3.8 Empty front/back shows inline validation error, no API call made
- [ ] 3.9 In-flight requests show disabled/loading state, no double-submit
