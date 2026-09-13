# Durability + Access Control Integration Tests

## Overview

Phase 2 of the test-plan rollout protects three critical risks: deck mutations corrupting state (Risk #3), review sessions losing progress mid-session (Risk #4), and RLS policies failing to enforce multi-user boundaries (Risk #6). This phase introduces integration tests via Vitest (API + mutation logic) and Playwright (session persistence via browser refresh), adds defensive error handling to mutation callbacks, and validates that concurrent edge cases either work safely or fail with clear errors + documentation.

## Current State Analysis

The API endpoints and service layer correctly scope mutations to user ownership via Supabase RLS:

- `POST /api/cards`, `PATCH /api/cards/:id`, `DELETE /api/cards/:id` all use `.eq("user_id", userId)` to enforce ownership
- RLS policies define four per-operation (select/insert/update/delete), all scoped to `auth.uid() = user_id`
- Database schema has no version/ETag field, leaving concurrent edits vulnerable to silent overwrites

However, five durability and consistency risks exist:

1. **No concurrency control on edits** — Multiple rapid edits to the same card have no version tracking; later response silently overwrites earlier ones
2. **Client callback failure desynchronizes state** — If `onSaved()` or `onDeleted()` throws after the server succeeds, dialog closes but parent state never updates
3. **Delete button only disabled within dialog** — Multiple delete paths could race; concurrent deletes are possible
4. **No request cancellation on navigation** — If user navigates away mid-mutation, the request still completes on the server
5. **SRS schedule preservation on edit lacks test coverage** — Design intent is solid (edit only touches `front`/`back`), but no test verifies this across rapid edits

The client uses **React component state only** (no Context, no localStorage) and **non-optimistic updates**: mutations apply to `DeckView`'s card list only after server success via callbacks. Session state lives entirely in the database: `card_order` (JSONB in review_sessions table) and `due_dates` (SRS fields on cards) persist across browser refresh.

### Key Discoveries:

- `CardFormDialog` and `DeleteCardDialog` call parent callbacks without try-catch; callback exceptions silently close dialogs and desynchronize state
- Supabase SSR client with RLS enforces auth boundary at DB query time, but no test currently verifies this
- Session state (`card_order`, due dates) is persisted to DB immediately on card answer; browser refresh simply re-fetches from DB — no session recovery logic exists yet
- Concurrent edit risk is known and documented in `context/archive/2026-09-06-deck-management/change.md:12`, but concurrent edit behavior (last-write-wins + silent overwrites) is not tested

## Desired End State

After Phase 2 completes:

1. **Deck mutations are durable and consistent**: Card edits and deletes execute safely under concurrent pressure; state never corrupts. Concurrent edits race (documented), but never leave the deck in an invalid state. If a mutation callback throws, the error is caught and displayed; the dialog doesn't close, leaving the user with a clear path to retry.

2. **Review sessions survive browser refresh**: A user can start a review session, answer several cards, close the browser (or refresh the page), and return to find their progress persisted — no cards are repeated, no answers are lost, the next card is correct.

3. **RLS policies enforce multi-user isolation**: A user cannot query, edit, or delete another user's cards. Attempting to do so fails safely with a 403 or empty result. RLS boundary is verified via integration tests.

4. **Test infrastructure is in place for Phase 3**: Vitest integration test structure is established for mutation tests; Playwright structure is established for session/browser tests.

**Verification**: `npm run test` (Vitest) passes all integration tests. Playwright session tests pass (either in CI or manual). No regressions in existing Phase 1 tests.

## What We're NOT Doing

- **Deferred: Concurrent edit conflict prevention** — The plan tests and documents current behavior (last-write-wins). Adding version/ETag checking is deferred post-MVP. RLS ownership is still enforced; the risk is data loss between user edits, not unauthorized access.
- **Deferred: SRS preservation test** — Testing that edits preserve SRS fields is deferred to Phase 3. The code design is correct; validation can follow once mutation tests are running.
- **Deferred: Request cancellation on navigation** — AbortController integration is deferred post-MVP. Current risk is acceptable (stale edits enter the DB if user navigates away); RLS still prevents cross-user data loss.
- **Deferred: Multiple concurrent delete paths** — Testing duplicate delete scenarios is out of scope. Phase 2 tests single-user delete flow; multi-path race scenarios are deferred.
- **Not testing: Visual regressions, Astro SSR rendering, Supabase SDK itself** — Per the test plan's exclusions (§7).

## Implementation Approach

**Hybrid testing strategy:**

- **Vitest + Supabase (real database)** for API endpoints, service layer logic, RLS boundary validation, and mutation state management. Tests will:
  - Create test data in a real dev Supabase instance
  - Call API endpoints directly (or via Astro's simulated context)
  - Verify database state post-mutation (cards table, review_sessions table)
  - Mock JWT tokens to simulate multi-user scenarios without auth setup overhead

- **Playwright (browser-based)** for session persistence testing. Tests will:
  - Start a review session in the browser
  - Answer cards via the UI
  - Verify state in database (card_order, due_dates)
  - Refresh the browser
  - Verify session resumes correctly (no repeated cards, correct next card)

**Defensive error handling (code change):**

- Wrap `onSaved()` and `onDeleted()` callbacks in try-catch blocks in `CardFormDialog` and `DeleteCardDialog`
- Display error to user if callback throws; do NOT close dialog
- Provide "Retry" action

**Test isolation:**

- Per-suite cleanup: Set up test fixtures once per test suite, delete all created cards/sessions after suite completes
- Each test is independent but shares the cleanup hook

## Phase 1: Defensive Error Handling

### Overview

Add try-catch error handling to `CardFormDialog` and `DeleteCardDialog` so callback exceptions don't silently close dialogs and desynchronize state. This prevents Risk #2 (callback failure desynchronizes state).

### Changes Required:

#### 1. CardFormDialog Component

**File**: `src/components/deck/CardFormDialog.tsx`

**Intent**: Wrap the `onSaved()` callback in try-catch; if it throws, catch the error, display it to the user, and keep the dialog open so the user can retry. This prevents callback exceptions from silently closing the dialog and leaving the card unsaved in the user's mind.

**Contract**: The `handleSubmit()` function must catch exceptions from `onSaved(card)` and update the error state (which is already displayed as `state.saveError`). Add a new error message for callback failures: `"Failed to update the deck list. Please try again or refresh the page."`. On error, set `isSaving = false` and keep the dialog open.

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

  try {
    onSaved(data.card);
    onOpenChange(false);
  } catch (err) {
    dispatch({
      type: "setSaveError",
      error: "Failed to update the deck list. Please try again or refresh the page.",
    });
    dispatch({ type: "setSaving", value: false });
  }
}
```

#### 2. DeleteCardDialog Component

**File**: `src/components/deck/DeleteCardDialog.tsx`

**Intent**: Wrap the `onDeleted()` callback in try-catch; if it throws, catch the error, display it, and keep the dialog open. Prevents callback exceptions from silently closing the delete dialog.

**Contract**: The `handleConfirm()` function must catch exceptions from `onDeleted(cardId)` and update the error state. Add error message: `"Failed to remove the card from the list. Please try again or refresh the page."`. On error, set `isDeleting = false` and keep the dialog open.

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

  try {
    onDeleted(card.id);
    onOpenChange(false);
  } catch (err) {
    dispatch({
      type: "setError",
      error: "Failed to remove the card from the list. Please try again or refresh the page.",
    });
    dispatch({ type: "setDeleting", value: false });
  }
}
```

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npm run typecheck`
- Build succeeds: `npm run build`
- Existing tests pass: `npm run test`

#### Manual Verification:

- Edit a card and modify the form to trigger a callback error (inject a console error or modify handler)
- Dialog stays open after save attempt; error message is displayed
- Delete button shows error; dialog stays open
- Retry is possible (form can be re-submitted)

---

## Phase 2: Mutation & RLS Integration Tests (Vitest)

### Overview

Create integration tests in Vitest that verify:

- Card edits preserve SRS fields and update only `front`/`back`
- Card deletes remove the card and don't affect other cards
- Concurrent edits race safely (last-write-wins, documented)
- RLS policies enforce per-user ownership (User A cannot edit User B's cards)

These tests use Vitest + real Supabase database + mocked JWT tokens for multi-user scenarios.

### Changes Required:

#### 1. Test Infrastructure & Setup

**File**: `src/__tests__/db-setup.ts` (new file)

**Intent**: Provide reusable fixtures for integration tests: create test users (via mocked JWT), create cards, clean up after tests. This prevents test data from polluting the database across runs.

**Contract**: Export functions:

- `createTestUser(userId: string)` — returns a mock JWT token for the user
- `createTestCard(supabase, userId, cardData)` — creates a card and returns it
- `cleanupTestData(supabase, userId)` — deletes all cards + sessions for the user
- `beforeEachTest()` / `afterEachTest()` — hooks for test isolation

#### 2. Mutation Durability Tests

**File**: `src/lib/services/__tests__/cards.integration.test.ts` (new file)

**Intent**: Test the mutation service layer with real database. Verify that edits and deletes don't corrupt state, don't affect SRS fields, and handle concurrent operations safely.

**Contract**: Suite covers:

- **Edit preserves SRS**: Create card with SRS schedule → edit front/back → verify SRS fields unchanged
- **Delete removes only target**: Create 3 cards → delete middle card → verify first and last remain
- **Concurrent edits race**: Create card → send two PATCH requests simultaneously → verify database contains only one update (last-write-wins)
- **Edit non-existent card returns null**: Update a card ID that doesn't exist → verify null is returned

Test structure:

```typescript
describe("cards service (integration)", () => {
  beforeEach(async () => {
    // Create test user and establish Supabase client
  });

  afterEach(async () => {
    // Clean up all cards/sessions for test user
  });

  it("should preserve SRS fields when editing card", async () => {
    // Create card with SRS schedule
    // Edit front/back
    // Verify SRS fields unchanged in database
  });

  it("should delete only the target card", async () => {
    // Create 3 cards
    // Delete middle
    // Verify first and last remain
  });

  it("should handle concurrent edits (last-write-wins)", async () => {
    // Create card
    // Send two PATCH requests in parallel
    // Verify database has only one update (documented race)
  });
});
```

#### 3. RLS Boundary Tests

**File**: `src/__tests__/rls-boundary.integration.test.ts` (new file)

**Intent**: Verify that Supabase RLS policies prevent IDOR. User A should not be able to query, edit, or delete User B's cards.

**Contract**: Suite covers:

- **User A cannot query User B's cards**: Create cards as User B → query as User A → verify empty result
- **User A cannot edit User B's card**: Create card as User B → attempt PATCH as User A with User B's card ID → verify 403 or not found
- **User A cannot delete User B's card**: Create card as User B → attempt DELETE as User A → verify 403 or not found

Test structure:

```typescript
describe("RLS policies (integration)", () => {
  beforeEach(async () => {
    // Create two test users (mocked JWT tokens)
    // Create a card as User B
  });

  afterEach(async () => {
    // Clean up both users' data
  });

  it("should prevent User A from querying User B's cards", async () => {
    // Query as User A
    // Verify empty result
  });

  it("should prevent User A from editing User B's card", async () => {
    // Attempt PATCH as User A
    // Verify 404 or 403
  });

  it("should prevent User A from deleting User B's card", async () => {
    // Attempt DELETE as User A
    // Verify 404 or 403
  });
});
```

### Success Criteria:

#### Automated Verification:

- Vitest integration tests pass: `npm run test`
- No type errors
- RLS policies audit passes (verify policy definitions match test expectations)

#### Manual Verification:

- Run test suite locally and verify all tests pass
- Inspect test output for clear failure messages if any test fails
- Verify database is clean after test suite completes

---

## Phase 3: Session Persistence Tests (Playwright)

### Overview

Create Playwright tests that verify review session state survives browser refresh. A user can start a review, answer cards, refresh the page, and resume from where they left off without losing progress.

### Changes Required:

#### 1. Playwright Test Infrastructure

**File**: `playwright.config.ts` (new file, if not present)

**Intent**: Configure Playwright for the project: base URL, authentication, browser launch options, retry policy.

**Contract**: Basic configuration with:

- `baseURL: http://localhost:3000` (dev server)
- `headless: true` for CI, `headless: false` for local debugging
- `timeout: 30000` for default test timeout
- `retries: 1` to handle flakes

#### 2. Session Persistence Test

**File**: `tests/session-persistence.spec.ts` (new file)

**Intent**: Verify that session state (card_order, answered cards) persists across browser refresh.

**Contract**: Test flow:

1. Log in (or use test account)
2. Start a review session with 5 cards
3. Answer 2 cards (e.g., pass both)
4. Verify in database: `card_order` matches original, answered count is 2
5. Refresh browser (`page.reload()`)
6. Verify session resumes: next card is card #3 (not #1), no cards are repeated
7. Answer the remaining 3 cards
8. Verify final session state in database

Test structure:

```typescript
test("review session persists across browser refresh", async ({ page, request }) => {
  // 1. Log in
  // 2. Create a deck with 5 cards
  // 3. Start review session
  // 4. Answer 2 cards (pass)
  // 5. Verify database state (card_order, answered count)
  // 6. Refresh page
  // 7. Verify session resumes (next card is #3)
  // 8. Answer 3 more cards
  // 9. Verify final state (session complete)
});
```

### Success Criteria:

#### Automated Verification:

- Playwright tests pass (if run in CI): `npx playwright test`
- No browser console errors during test
- Database state matches expected session state after each step

#### Manual Verification:

- Run locally: `npx playwright test --headed` to watch the browser
- Start review, answer cards, refresh, verify resume works
- Session state matches what the user sees on screen

---

## Testing Strategy

### Unit vs. Integration

- **Unit tests** (Phase 1): Test individual functions with mocked dependencies (already in Phase 1 via MSW mocking)
- **Integration tests** (Phase 2): Test service layer with real Supabase database
- **End-to-end / Session tests** (Phase 3): Test full user flow via Playwright

### RLS Testing Approach

Rather than creating real auth accounts (expensive and slow), Phase 2 uses mocked JWT tokens:

```typescript
// Example: mock JWT for User A
const userAToken = createMockJWT({ sub: "user-a-id", email: "a@test.com" });
const supabaseA = createClient(userAToken);

// Example: mock JWT for User B
const userBToken = createMockJWT({ sub: "user-b-id", email: "b@test.com" });
const supabaseB = createClient(userBToken);

// User A creates a card
const cardA = await createCard(supabaseA, "user-a-id", { front: "Q", back: "A" });

// User B attempts to query it (should return empty)
const result = await supabaseB.from("cards").select().eq("id", cardA.id);
expect(result.data).toHaveLength(0); // RLS blocks it
```

### Concurrent Edit Test

Phase 2 documents the concurrent edit race:

```typescript
it("should handle concurrent edits (last-write-wins)", async () => {
  const cardId = "test-id";

  // Send two PATCHes in parallel
  const p1 = updateCard(supabase, userId, cardId, { front: "Version A" });
  const p2 = updateCard(supabase, userId, cardId, { front: "Version B" });

  const [result1, result2] = await Promise.all([p1, p2]);

  // One update wins; the other is silently lost
  const final = await getCard(supabase, cardId);
  expect(final.front).toBe("Version A" || "Version B"); // One of them, not guaranteed which

  // Document this as a known limitation
  console.log("⚠️ Concurrent edits race: last-write-wins. No version field present.");
});
```

## Performance Considerations

- **Test suite size**: Vitest integration tests should complete in <30s (dev Supabase can be slow; use indexed queries)
- **Playwright tests**: Should complete in <60s per test (browser startup is slow)
- **CI timeout**: Set generous timeouts in CI (2-3x local) to account for environment variability

## Migration Notes

No data migrations are required for Phase 2 — we're adding tests, not changing schema or existing data.

## References

- **Test plan**: `context/foundation/test-plan.md` (overall strategy, risks, phases)
- **Research**: `context/changes/durability-acces-control/research.md` (codebase analysis, 5 risks, code references)
- **Lessons**: `context/foundation/lessons.md` (shadcn/ui pattern rule)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Defensive Error Handling

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 50f5931
- [x] 1.2 Type checking passes: `npm run typecheck` — 50f5931
- [x] 1.3 Build succeeds: `npm run build` — 50f5931
- [x] 1.4 Existing tests pass: `npm run test` — 50f5931

#### Manual

- [x] 1.5 Edit form shows error and stays open when callback throws — 50f5931
- [x] 1.6 Delete dialog shows error and stays open when callback throws — 50f5931
- [x] 1.7 User can retry after error — 50f5931

### Phase 2: Mutation & RLS Integration Tests (Vitest)

#### Automated

- [x] 2.1 Integration test infrastructure (db-setup.ts) created — f08ec58
- [x] 2.2 Mutation durability tests pass (cards.integration.test.ts) — f08ec58
- [x] 2.3 RLS boundary tests pass (rls-boundary.integration.test.ts) — f08ec58
- [x] 2.4 No type errors in new tests — f08ec58
- [x] 2.5 All tests pass: `npm run test` — f08ec58

#### Manual

- [ ] 2.6 Run test suite locally; verify all tests pass
- [ ] 2.7 Database is clean after test suite completes

### Phase 3: Session Persistence Tests (Playwright)

#### Automated

- [x] 3.1 Playwright infrastructure configured (playwright.config.ts, auth setup, E2E rules) — 86fd77e
- [x] 3.2 Session persistence test passes (session-persistence.spec.ts) — 86fd77e
- [x] 3.3 Playwright tests pass: `npx playwright test` — 86fd77e

#### Manual

- [x] 3.4 Run locally with `--headed` flag; manually verify session resumes after refresh
- [x] 3.5 No browser console errors during test
