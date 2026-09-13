---
date: 2026-09-13T00:19:56.0399134+01:00
researcher: Copilot
git_commit: ee3237674bc3477441a514391fdc9c1b0f620123
branch: master
repository: 10xCards
topic: "Current state of deck mutations (card edit/delete logic, state management, corruption vectors)"
tags: [research, codebase, deck-management, card-mutations, state-management, rls, durability]
status: complete
last_updated: 2026-09-13
last_updated_by: Copilot
---

# Research: Deck Mutations — State Management & Corruption Vectors

**Date**: 2026-09-13T00:19:56.0399134+01:00  
**Researcher**: Copilot  
**Git Commit**: [ee32376](https://github.com/achudzynski/10xCards/blob/ee3237674bc3477441a514391fdc9c1b0f620123)  
**Branch**: master  
**Repository**: 10xCards

---

## Research Question

What is the current state of deck/card mutation endpoints, client state management patterns, and what corruption vectors or data loss scenarios exist in the edit/delete workflow?

---

## Summary

The codebase has **three mutation endpoints** (`POST /api/cards`, `PATCH /api/cards/:id`, `DELETE /api/cards/:id`) with ownership-scoped Supabase operations. Client-side state is **React component-only** (no Context, no local storage), with **conservative non-optimistic updates**: no mutation is applied to `DeckView`'s card list until the server responds successfully.

However, **several durability and consistency risks exist**:

1. **No concurrency control**: Multiple rapid edits to the same card have no version tracking or ETag — the final server response wins, potentially silencing earlier changes.
2. **No explicit transaction rollback**: If a save succeeds on the server but the client-side callback fails to fire, the deck view can lag indefinitely.
3. **Race condition between dialog and deck list**: A user can close a form, reopen it on another card, and edit while the first mutation is still pending — the responses could arrive out-of-order.
4. **Delete button disabled only within the dialog**: If the UI allows opening multiple dialogs or re-triggering delete on a card from another path, concurrent deletes could race.
5. **No request cancellation**: If a user navigates away or closes the page mid-mutation, the request still completes on the server and modifies state.
6. **SRS schedule preserved across edit** (good), but no test coverage yet that verify this across rapid succession of edits + deletes.

The **database layer is sound** — RLS policies enforce ownership per-operation, and there are no missing CASCADE deletes or orphan scenarios. The risk is in the **client-server coordination** and **lack of integration test coverage**.

---

## Detailed Findings

### API Endpoints & Handlers

#### `POST /api/cards` (Create)

**File**: `src/pages/api/cards.ts:9-52`

```typescript
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("unauthorized", "You must be signed in to save cards", 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("server_misconfigured", "Supabase is not configured", 500);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError("invalid_input", "Request body must be valid JSON", 400);
  }

  const parsed = createCardSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "invalid_input",
      "Front and back must each be between 1 and 100 characters",
      400,
      parsed.error.issues,
    );
  }

  try {
    const card = await createCard(supabase, context.locals.user.id, {
      front: parsed.data.front,
      back: parsed.data.back,
      isAiGenerated: parsed.data.isAiGenerated,
    });
    return jsonOk({ card }, 201);
  } catch {
    return jsonError("save_failed", "Could not save the card. Please try again.", 500);
  }
};
```

- **Validation**: `front` and `back` required; 1–100 chars each; optional `isAiGenerated` defaults to `false`
- **Service call**: delegates to `createCard()` in `src/lib/services/cards.ts:26-42`
- **Success response**: `201 { card }`
- **No concurrency control**: creates a new row; relies on Supabase to generate the UUID

---

#### `PATCH /api/cards/:id` (Edit)

**File**: `src/pages/api/cards/[id].ts:9-61`

```typescript
export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("unauthorized", "You must be signed in to update cards", 401);
  }

  const parsedId = idSchema.safeParse(context.params.id);
  if (!parsedId.success) {
    return jsonError("invalid_input", "Card id must be a valid UUID", 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("server_misconfigured", "Supabase is not configured", 500);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError("invalid_input", "Request body must be valid JSON", 400);
  }

  const parsed = updateCardSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "invalid_input",
      "Front and back must each be between 1 and 100 characters, and at least one must be provided",
      400,
      parsed.error.issues,
    );
  }

  try {
    const card = await updateCard(supabase, context.locals.user.id, parsedId.data, parsed.data);
    if (!card) {
      return jsonError("not_found", "Card not found", 404);
    }
    return jsonOk({ card }, 200);
  } catch {
    return jsonError("save_failed", "Could not update the card. Please try again.", 500);
  }
};
```

- **Validation**: `front` and/or `back` optional; at least one must be provided; 1–100 chars each
- **Service call**: delegates to `updateCard()` in `src/lib/services/cards.ts:57-82`
- **Ownership check**: UPDATE scoped to `id + user_id`; returns `null` if no row matched (PGRST116)
- **Success response**: `200 { card }`
- **Critical gap**: No version/ETag. If two requests overlap, the later response silently overwrites any earlier changes.

---

#### `DELETE /api/cards/:id` (Delete)

**File**: `src/pages/api/cards/[id].ts:63-87`

```typescript
export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("unauthorized", "You must be signed in to delete cards", 401);
  }

  const parsedId = idSchema.safeParse(context.params.id);
  if (!parsedId.success) {
    return jsonError("invalid_input", "Card id must be a valid UUID", 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("server_misconfigured", "Supabase is not configured", 500);
  }

  try {
    const deleted = await deleteCard(supabase, context.locals.user.id, parsedId.data);
    if (!deleted) {
      return jsonError("not_found", "Card not found", 404);
    }
    return jsonOk({ success: true }, 200);
  } catch {
    return jsonError("delete_failed", "Could not delete the card. Please try again.", 500);
  }
};
```

- **Validation**: `id` must be valid UUID
- **Service call**: delegates to `deleteCard()` in `src/lib/services/cards.ts:84-91`
- **Ownership check**: DELETE scoped to `id + user_id`; returns `false` if nothing deleted
- **Success response**: `200 { success: true }`

---

### Service Layer

**File**: `src/lib/services/cards.ts:26-91`

```typescript
// Create
export async function createCard(
  supabase: SupabaseClient,
  userId: string,
  data: { front: string; back: string; isAiGenerated: boolean },
): Promise<Card> {
  const { data: card, error } = await supabase
    .from("cards")
    .insert({
      user_id: userId,
      front: data.front,
      back: data.back,
      is_ai_generated: data.isAiGenerated,
    })
    .select()
    .single();

  if (error) throw error;
  return card;
}

// Update
export async function updateCard(
  supabase: SupabaseClient,
  userId: string,
  cardId: string,
  data: { front?: string; back?: string },
): Promise<Card | null> {
  const { data: card, error } = await supabase
    .from("cards")
    .update({
      ...(data.front !== undefined && { front: data.front }),
      ...(data.back !== undefined && { back: data.back }),
    })
    .eq("id", cardId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error?.code === "PGRST116") return null; // No rows matched
  if (error) throw error;
  return card;
}

// Delete
export async function deleteCard(supabase: SupabaseClient, userId: string, cardId: string): Promise<boolean> {
  const { data, error } = await supabase.from("cards").delete().eq("id", cardId).eq("user_id", userId).select("id");

  if (error) throw error;
  return data.length > 0;
}
```

- **Create**: inserts a new row, returns the created card
- **Update**: patches the specified columns, scoped to user ownership; returns `null` if not found
- **Delete**: removes the row, scoped to user ownership; returns `true` if a row was deleted, `false` otherwise
- **Ownership enforcement**: All three use `.eq("user_id", userId)` to ensure the user can only modify their own cards
- **No concurrency protection**: No version field, no ETag check, no optimistic locking

---

### Client State Management

**File**: `src/components/deck/DeckView.tsx:16-56`

```typescript
const [cards, setCards] = useState<Card[]>(initialCards);

function handleFormSaved(card: Card) {
  setCards((prev) => {
    const existingIndex = prev.findIndex((c) => c.id === card.id);
    if (existingIndex >= 0) {
      const updated = [...prev];
      updated[existingIndex] = card;
      return updated;
    }
    return [card, ...prev];
  });
  setDialogState("closed");
}

function handleDeleted(cardId: string) {
  setCards((prev) => prev.filter((c) => c.id !== cardId));
  setDialogState("closed");
}
```

- **State location**: React component state only (`useState`)
- **Update strategy**: Non-optimistic; local list updated only after server success via callbacks
- **Create flow**: New card prepended to list
- **Edit flow**: Existing card replaced by index
- **Delete flow**: Card filtered out by ID

---

#### Card Edit Dialog

**File**: `src/components/deck/CardFormDialog.tsx:81-147`

```typescript
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  dispatch({ type: "setSaving", value: true });
  dispatch({ type: "setSaveError", error: null });

  const method = card ? "PATCH" : "POST";
  const url = card ? `/api/cards/${card.id}` : "/api/cards";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.json();
    dispatch({ type: "setSaveError", error: error.error.message });
    dispatch({ type: "setSaving", value: false });
    return;
  }

  const data = (await res.json()) as { card: Card };
  onSaved(data.card);
  onOpenChange(false);
}
```

- **Saves locally via reducer state**: front/back text stored in component state until submit
- **Disables inputs and button while saving**: `disabled={state.isSaving}`
- **On server failure**: re-enables form, displays error message, does NOT close dialog
- **On server success**: calls parent callback `onSaved(card)` and closes dialog
- **Critical risk**: If `onSaved` callback fails to execute (e.g., exception in parent), the dialog closes but parent state never updates

---

#### Card Delete Dialog

**File**: `src/components/deck/DeleteCardDialog.tsx:42-74`

```typescript
async function handleConfirm() {
  dispatch({ type: "setDeleting", value: true });
  dispatch({ type: "setError", error: null });

  const res = await fetch(`/api/cards/${card.id}`, { method: "DELETE" });

  if (!res.ok) {
    const error = await res.json();
    dispatch({ type: "setError", error: error.error.message });
    dispatch({ type: "setDeleting", value: false });
    return;
  }

  onDeleted(card.id);
  onOpenChange(false);
}
```

- **Delete button disabled while deleting**: `disabled={isDeleting}`
- **On server failure**: re-enables button, displays error, does NOT close dialog
- **On server success**: calls parent callback `onDeleted(cardId)` and closes dialog
- **Same risk as edit**: If `onDeleted` callback fails, card remains in deck view indefinitely

---

### Database Schema & Constraints

**File**: `supabase/migrations/`

#### `cards` table definition

From `20260815000000_create_cards.sql` + `20260909000000_add_srs_fields_and_review_sessions.sql`:

```sql
CREATE TABLE public.cards (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  front           TEXT        NOT NULL,
  back            TEXT        NOT NULL,
  is_ai_generated BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- SRS columns added in 20260909000000
  ease_factor     NUMERIC(4,2) NOT NULL DEFAULT 2.50,
  interval        INTEGER     NOT NULL DEFAULT 0,
  repetitions     INTEGER     NOT NULL DEFAULT 0,
  due_date        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Constraints**:

- **Primary key**: `id` is UUID
- **Foreign key**: `user_id → auth.users(id) ON DELETE CASCADE` — deleting a user cascades to their cards
- **NOT NULL**: all columns except none (all are required or have defaults)
- **Defaults**: `is_ai_generated = false`, SRS columns initialize to neutral values
- **No version/ETag column**: No way to detect concurrent modifications
- **No uniqueness** beyond PK

**Indexes**:

- `cards_user_id_idx` on `(user_id)` — RLS filter performance
- `cards_user_due_date_idx` on `(user_id, due_date)` — SRS query performance

**Triggers**:

- `cards_set_updated_at()` fires BEFORE UPDATE to keep `updated_at` in sync

---

#### RLS Policies

From `20260815000000_create_cards.sql:31-50` + `20260823000000_harden_cards_rls.sql:7-10`:

```sql
-- All four policies restricted to authenticated role (TO authenticated)

CREATE POLICY "cards: select own"
  ON public.cards
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "cards: insert own"
  ON public.cards
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cards: update own"
  ON public.cards
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cards: delete own"
  ON public.cards
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
```

- **Ownership enforcement**: Every operation scoped to the authenticated user's own rows
- **No cross-user access**: RLS prevents IDOR attacks
- **Solid security baseline** for Phase 2 risk #6 (IDOR protection)

---

## Corruption Vectors & Durability Risks

### 1. **No Concurrency Control on Edits**

**Scenario**: User A and User B (or User A in two tabs) both edit the same card rapidly.

1. Client A sends `PATCH /api/cards/:id` with `front: "A's version"`
2. Client B sends `PATCH /api/cards/:id` with `front: "B's version"`
3. B's response arrives first: card.front = "B's version" (B's UI updates)
4. A's response arrives second: card.front = "A's version" (A's UI updates)
5. **Result**: The database has "A's version", but B sees "B's version" locally. If B closes the page, "A's version" is the source of truth, silently overwriting B's input.

**Severity**: High (data loss + silent corruption)  
**Why it happens**: No version field, no ETag, no client-side request cancellation

---

### 2. **Client Callback Failure Silently Desynchronizes State**

**Scenario**: Card edit succeeds on the server, but `onSaved(card)` throws an exception.

1. `fetch()` returns 200 with the updated card
2. `onSaved(card)` throws (e.g., callback error, JSON parse error)
3. Dialog closes (line 147: `onOpenChange(false)`)
4. Parent `DeckView` never receives the update
5. **Result**: Server has the new card, UI shows the old card. User never knows the edit succeeded.

**Severity**: High (data loss + inconsistency)  
**Why it happens**: No try-catch around `onSaved()` callback; success path closes dialog unconditionally

---

### 3. **Delete Button Only Disabled Within Dialog**

**Scenario**: User opens delete dialog, confirms, then immediately tries to delete the same card from another path (e.g., Ctrl+A to select multiple, or a separate card quick-delete button).

1. First DELETE request sent, `isDeleting = true` in dialog
2. User closes dialog (due to impatience or bug) and opens another card/view
3. Second DELETE request sent (from different UI path)
4. Both requests complete; one wins
5. **Result**: Duplicate delete attempts, one fails with 404, potential for orphaned state if the first delete is still pending

**Severity**: Medium (edge case, but UI/UX dependent)  
**Why it happens**: Button state is scoped to the dialog component only; parent has no shared delete-in-flight flag

---

### 4. **No Request Cancellation on Navigation**

**Scenario**: User starts editing a card, immediately closes the dialog, and navigates away or refreshes the page.

1. `fetch()` request is in-flight, waiting for server
2. Page unloads before response arrives
3. Server processes the request and updates the card
4. User's newer/different version is lost
5. **Result**: Card in the database reflects a stale edit that the user didn't intend to keep

**Severity**: Medium (depends on user workflow)  
**Why it happens**: No AbortController to cancel requests on component unmount

---

### 5. **SRS Schedule Preserved Across Edits** (Good Design, But No Test Coverage)

**Finding**: The edit endpoint only updates `front` and `back`; SRS fields (`ease_factor`, `interval`, `repetitions`, `due_date`) are never touched.

**Design intent**: A user can edit card content without losing their review progress.

**Risk**: No integration test verifies this. If a developer later adds SRS field updates to the edit endpoint, or if the schema changes, this invariant silently breaks.

**Evidence from prior work**:

- `context/archive/2026-09-06-deck-management/change.md:12` — S-02 notes "editing a card with an SRS schedule must preserve schedule across content changes"
- But no integration test was added to verify this behavior

---

## Code References

### API Endpoints

- `src/pages/api/cards.ts:9-52` — POST /api/cards (create)
- `src/pages/api/cards/[id].ts:9-61` — PATCH /api/cards/:id (edit)
- `src/pages/api/cards/[id].ts:63-87` — DELETE /api/cards/:id (delete)

### Service Layer

- `src/lib/services/cards.ts:26-42` — createCard()
- `src/lib/services/cards.ts:57-82` — updateCard()
- `src/lib/services/cards.ts:84-91` — deleteCard()

### Client Components

- `src/components/deck/DeckView.tsx:16-56` — Card list state management
- `src/components/deck/CardFormDialog.tsx:81-147` — Edit/create form
- `src/components/deck/DeleteCardDialog.tsx:42-74` — Delete confirmation

### Schema & RLS

- `supabase/migrations/20260815000000_create_cards.sql` — Initial cards table + RLS policies
- `supabase/migrations/20260823000000_harden_cards_rls.sql` — RLS policy hardening
- `supabase/migrations/20260909000000_add_srs_fields_and_review_sessions.sql:6-10` — SRS columns added

---

## Architecture Insights

### Mutation Design Pattern

1. **Conservative, non-optimistic**: Client waits for server confirmation before updating local state
2. **Callback-driven**: Parent components pull updates via `onSaved`/`onDeleted` callbacks
3. **Form-scoped state**: Each dialog manages its own input state; parent list is source of truth for card data
4. **Ownership-scoped DB operations**: RLS + service-layer `.eq("user_id", userId)` ensure no cross-user mutations

### Strengths

- **RLS enforcement**: Database-layer access control is solid (risk #6 protected)
- **No optimistic corruption**: Non-optimistic pattern means no stale local state from failed mutations
- **Clear separation of concerns**: API endpoints handle auth + validation, service layer handles DB, components handle UI

### Weaknesses

- **No concurrency control**: Multiple edits to the same card can race
- **No request lifecycle management**: No cancellation, timeout, or retry logic
- **Callback-driven state is fragile**: If any callback throws, state desynchronizes
- **No event-sourcing or audit trail**: No way to see what happened if a mutation appears to silently fail

---

## Historical Context (from prior changes)

### `context/archive/2026-09-06-deck-management/`

**Status**: Completed (archived)  
**Coverage**: S-02 deck-management (FR-008/FR-010/FR-011) — create/edit/delete

**Key findings from impl-review**:

- F1: Manual card creation incorrectly marked as `is_ai_generated = true` (fixed)
- F2: Delete dialog could close before async failure was shown (noted, not fixed)
- F3: Stale card index in `DeckView` after rapid edits (noted)
- F4: Manual verification lacked review-visible evidence

**Lessons** (from `context/foundation/lessons.md`):

- None yet for deck mutations; lessons focus on UI component reuse (shadcn/ui primitives)

---

### Test-Plan References

From `context/foundation/test-plan.md`:

- **Risk #3**: "Deck management (edit/delete) corrupts card state or loses data" — High impact, Medium likelihood
  - User Q3 evidence: "deck management feels fragile"
  - Hot-spot churn: `src/components/deck: 5 commits/30d`

- **Risk #4**: "Review session loses progress mid-session" — High impact, Medium likelihood
  - Related to session durability (Phase 2 scope)
  - Hot-spot churn: `src/lib/services/review: 4 commits/3d`
  - Recent revert/fix cycle on 2026-09-11

---

## Related Research

- `context/archive/2026-09-12-testing-critical-path-coverage/research.md` — Earlier research on SRS schedule and session persistence (revert/fix cycle)
- `context/foundation/test-plan.md §3 Phase 2` — Durability + access control testing strategy
- `context/foundation/lessons.md` — UI component reuse conventions

---

## Open Questions

1. **Do edits to the same card in quick succession preserve SRS fields consistently?** No integration test verifies this yet. (Phase 2 test scope)

2. **What happens if a user opens two dialogs for the same card in two browser tabs?** Both could send conflicting mutations. RLS and ownership checks prevent data corruption, but state could diverge.

3. **Is there a "last-writer-wins" semantics expectation, or should we detect and prevent concurrent edits?** Not documented yet. Phase 2 plan should clarify.

4. **Should delete operations be soft-deletes (mark `deleted_at`) or hard-deletes?** Currently hard-delete; may want to reconsider for audit trail or recovery.

5. **What is the SLA for edit/delete confirmation feedback to the user?** No timeout or max-wait logic is present; if the server stalls, the UI stalls too.

---

## Next Steps for Phase 2 Planning

Based on this research, the `/10x-plan` for Phase 2 should cover:

1. **Integration test for deck mutations**: create → edit (verify SRS preserved) → delete → verify other cards unaffected
2. **Integration test for RLS enforcement**: User A cannot query/edit/delete User B's cards
3. **Session durability test**: Start review → answer cards → close browser → reopen → verify state
4. **Concurrency test** (if time permits): Two concurrent edits to the same card; verify final state is consistent
5. **Error handling test**: Simulate network failures during edit/delete; verify UI state and error messages are correct
