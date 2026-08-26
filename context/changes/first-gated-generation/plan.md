# First Gated Generation (S-01) Implementation Plan

## Overview

Implement the north-star slice: a logged-in user pastes a block of text, triggers AI flashcard
generation via OpenRouter, reviews each generated card one-by-one (accept / edit / delete), and
each accepted card is persisted to their personal `cards` deck and viewable in a minimal read-only
deck page. This is the first slice that adds a service layer, JSON API routes, an interactive
non-auth React island, and an external AI integration on top of the F-01 card-schema foundation.

## Current State Analysis

- **Foundation ready (F-01, `impl_reviewed`)**: `public.cards` table exists with per-user, per-role
  RLS (`TO authenticated`, `auth.uid() = user_id`), a `user_id` index, and an `updated_at` trigger
  (`supabase/migrations/20260815000000_create_cards.sql`, `..._20260823000000_harden_cards_rls.sql`).
  `src/types.ts:1-9` exports the `Card` domain type in camelCase; DB columns are snake_case and the
  mapping layer does **not** exist yet.
- **AI provider wired, no code**: `OPENROUTER_API_KEY` is declared server-only in
  `astro.config.mjs` env schema and `.env.example`; there is no OpenRouter client anywhere.
- **API + auth precedents**: `src/pages/api/auth/*.ts` show the `APIRoute` pattern and the SSR
  client factory `createClient(request.headers, cookies)` (`src/lib/supabase.ts`). These are
  form-post/redirect routes — S-01 introduces the first **JSON** API surface.
- **Middleware**: `src/middleware.ts` resolves `context.locals.user` every request and guards
  `PROTECTED_ROUTES` (currently `["/dashboard"]`). `src/env.d.ts` types `App.Locals.user`.
- **UI precedents**: `src/pages/dashboard.astro` (protected Astro page reading `Astro.locals.user`);
  auth React islands in `src/components/auth/*`; only `src/components/ui/button.tsx` shadcn primitive
  installed; `cn()` in `src/lib/utils.ts`.
- **Missing**: `zod` is not a dependency; no `src/lib/services/`, no `src/components/hooks/`, no
  card/generation code, no JSON error-envelope helper.

## Desired End State

A signed-in user visits `/generate`, pastes text (≤ 5,000 chars), clicks Generate, and receives up
to ~10 AI-generated cards. They step through the cards one at a time — accepting (which immediately
saves the card), editing front/back before accepting, or deleting (skipping) each. When finished
they land on (or link to) `/deck`, a read-only list of all their saved cards. Generation failures
show an inline error with Retry (pasted text preserved); text that yields no cards shows a friendly
empty-state. All card data is strictly per-user (RLS-enforced). Verified by manual E2E walkthrough
and `npm run lint` / `npm run build` passing.

### Key Discoveries:

- `Card` type is camelCase (`src/types.ts:1-9`) but DB is snake_case — the new `cards` service owns
  the mapping (per the F-01 plan's deferred-service decision).
- INSERT policy `WITH CHECK (auth.uid() = user_id)` enforces per-user safety even if a handler
  forgets a filter — but handlers must still set `user_id = locals.user.id` explicitly.
- `is_ai_generated` must be `true` for cards saved from this flow (default is `false`).
- No `source_text`/provenance column exists by design (NFR: pasted text must not linger) — keep the
  pasted text in the request body only; never persist or log it.
- OpenRouter structured output: `POST /chat/completions` with
  `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`, and
  `provider: { require_parameters: true }` so only structured-output-capable providers are used.

## What We're NOT Doing

- No manual card creation, no edit/delete of *saved* cards (that is S-02 `deck-management`).
- No SRS / review session / scheduling columns (S-03).
- No streaming generation, no background jobs, no model picker in the UI.
- No automated test framework (no Vitest/Playwright) — manual verification only this slice. A
  mockable service seam is kept so the UI can be built before credentials, but no tests are written.
- No draft persistence of un-accepted generated cards — gating state is in-memory only.
- No pagination on the deck view (MVP scale is small).

## Implementation Approach

Bottom-up, mock-first: build the service + type foundations, then the two backend routes (generation
and persistence), then the UI island against those routes, then the deck page. The generation service
exposes a seam so a mock implementation can drive UI development before the real OpenRouter call is
wired. Each accepted card is saved immediately (one insert per accept) to match the one-at-a-time
wizard, so no accepted work is ever lost mid-session.

## Critical Implementation Details

- **API routes must set `prerender = false`** (project hard rule; SSR mode) and return the JSON error
  envelope `{ error: { code, message, context } }` — S-01 is the first route family to establish this
  JSON-error precedent, so add a small reusable helper rather than hand-rolling per route.
- **Defense in depth on identity**: middleware guards the *pages*, but each API handler must
  independently re-check `context.locals.user` before touching `cards`, because the insert needs a
  trustworthy `user_id` and API routes can be called directly.
- **OpenRouter timeout**: the fetch must use an `AbortController` timeout so a slow/hung provider
  surfaces as a clean inline error + Retry rather than hanging the request.

---

## Phase 1: Shared Foundations (deps, types, error envelope, cards service)

### Overview

Add the cross-cutting pieces every later phase depends on: the `zod` dependency, the request/response
DTOs, a JSON error-envelope helper, and the `cards` service that maps between DB snake_case and the
camelCase `Card` domain type.

### Changes Required:

#### 1. Add zod dependency

**File**: `package.json`

**Intent**: Add `zod` for runtime validation of API inputs (mandated by AGENTS.md).

**Contract**: `zod` appears in `dependencies`; `npm install` succeeds; lockfile updated.

#### 2. Generation & card DTOs

**File**: `src/types.ts`

**Intent**: Add the shared types the API and UI exchange, alongside the existing `Card` type.

**Contract**: Export (names indicative) `GeneratedCard` (`{ front: string; back: string }`),
`GenerateRequest` (`{ text: string }`), `GenerateResponse` (`{ cards: GeneratedCard[] }`),
`CreateCardRequest` (`{ front: string; back: string; isAiGenerated?: boolean }`), and an
`ApiError` shape `{ error: { code: string; message: string; context?: unknown } }`. camelCase per
existing domain convention.

#### 3. JSON error-envelope helper

**File**: `src/lib/api.ts` (new)

**Intent**: One place that builds success and error `Response` objects so every route emits the
consistent `{ error: { code, message, context } }` envelope and JSON success bodies.

**Contract**: Export helpers such as `jsonError(code, message, status, context?)` returning a
`Response` with `application/json` body `{ error: { code, message, context } }`, and `jsonOk(data,
status?)`. No business logic.

#### 4. Cards service

**File**: `src/lib/services/cards.ts` (new)

**Intent**: Encapsulate all `cards` table access and the snake_case↔camelCase mapping so routes and
pages never touch raw column names.

**Contract**: Export `createCard(supabase, userId, input)` — inserts one row with `user_id`,
`front`, `back`, `is_ai_generated`, returns a mapped `Card`; and `listCards(supabase, userId)` —
returns `Card[]` ordered by `created_at desc`. `supabase` is the SSR client instance; the service
maps DB rows to the `Card` domain type. Relies on RLS but still passes `user_id` explicitly.

### Success Criteria:

#### Automated Verification:

- `npm install` succeeds and `zod` is in `package.json` dependencies
- `npm run lint` passes with the new files
- `npm run build` passes (types resolve; `astro sync` clean)

#### Manual Verification:

- `import { createCard, listCards } from "@/lib/services/cards"` and the new DTOs resolve in the IDE
- Error-envelope helper produces the exact `{ error: { code, message, context } }` shape

**Implementation Note**: After automated verification passes, pause for confirmation before Phase 2.

---

## Phase 2: Generation Backend (OpenRouter service + `/api/generate`)

### Overview

Add the OpenRouter generation service (with a mockable seam) and the JSON API route that validates
input, calls the service, and returns generated cards.

### Changes Required:

#### 1. OpenRouter model env (optional)

**File**: `astro.config.mjs`

**Intent**: Allow overriding the generation model without a code change, defaulting in code.

**Contract**: Add `OPENROUTER_MODEL` as `envField.string({ context: "server", access: "secret",
optional: true })` alongside the existing keys. Also add `OPENROUTER_MODEL=###` to `.env.example`.

#### 2. Generation service

**File**: `src/lib/services/generation.ts` (new)

**Intent**: Call OpenRouter's chat-completions endpoint with a strict JSON schema to turn source
text into up to ~10 `{front, back}` pairs; keep a seam so a mock can replace the network call during
development.

**Contract**: Export `generateCards(text: string): Promise<GeneratedCard[]>`. Internals: read
`OPENROUTER_API_KEY` (and optional `OPENROUTER_MODEL`, default e.g. `google/gemini-2.0-flash` or
`openai/gpt-4o-mini`) from `astro:env/server`; `POST https://openrouter.ai/api/v1/chat/completions`
with a system+user prompt instructing "generate up to 10 flashcards grounded in the text", and
`response_format: { type: "json_schema", json_schema: { name: "flashcards", strict: true, schema } }`
where schema is `{ cards: array of { front, back } }` with `additionalProperties:false`; send
`provider: { require_parameters: true }`. Use an `AbortController` timeout (e.g. 30s). Parse and
validate the returned JSON with a zod schema; return `[]` when the model yields no cards. On network
/ non-2xx / timeout, throw a typed error the route maps to the envelope. Never log `text`. A
`USE_MOCK`-style seam (env-gated or a swappable function) returns canned cards when the key is absent
so the UI is buildable without credentials.

**Contract snippet** (schema shape other phases depend on):

```
response_format.json_schema.schema =
  { type: "object",
    properties: { cards: { type: "array", items: {
      type: "object",
      properties: { front: {type:"string"}, back: {type:"string"} },
      required: ["front","back"], additionalProperties: false } } },
    required: ["cards"], additionalProperties: false }
```

#### 3. Generate API route

**File**: `src/pages/api/generate.ts` (new)

**Intent**: Authenticated JSON endpoint that validates the pasted text and returns generated cards.

**Contract**: `export const prerender = false;` and `export const POST: APIRoute`. Re-check
`context.locals.user` → `jsonError("unauthorized", …, 401)` if absent. Build the Supabase client via
`createClient` (guard null). Parse JSON body; validate with zod `{ text: string().trim().min(1)
.max(5000) }` → `jsonError("invalid_input", …, 400, issues)` on failure. Call `generateCards(text)`;
return `jsonOk({ cards })` (may be `[]`). Map service errors to `jsonError("generation_failed", …,
502)`. Never echo or log the pasted text.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes
- Route file exports `prerender = false` and `POST`

#### Manual Verification:

- With no `OPENROUTER_API_KEY`, the mock seam returns canned cards from `POST /api/generate`
- With a real key, pasting sample text returns valid `{ front, back }` cards
- Text over 5,000 chars returns a 400 with the error envelope; empty text returns 400
- Simulated provider failure/timeout returns a 502 envelope; pasted text is never logged

**Implementation Note**: Pause for confirmation after automated verification before Phase 3.

---

## Phase 3: Persistence Backend (`/api/cards` + route protection)

### Overview

Add the authenticated endpoint that saves a single accepted card, and protect the new page routes.

### Changes Required:

#### 1. Create-card API route

**File**: `src/pages/api/cards.ts` (new)

**Intent**: Persist one accepted card for the current user; used by the wizard on each accept.

**Contract**: `export const prerender = false;` and `export const POST: APIRoute`. Re-check
`context.locals.user` (401 envelope if absent). Build Supabase client (guard null). Validate body
with zod: `front` and `back` each `string().trim().min(1).max(100)`. Call `createCard(supabase,
user.id, { front, back, isAiGenerated: true })`. Return `jsonOk({ card }, 201)`. Map DB/RLS errors
to `jsonError("save_failed", …, 500)`.

#### 2. Protect new routes

**File**: `src/middleware.ts`

**Intent**: Require auth for the generation and deck pages.

**Contract**: Add `/generate` and `/deck` to `PROTECTED_ROUTES`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes
- Route exports `prerender = false` and `POST`; middleware lists `/generate` and `/deck`

#### Manual Verification:

- Signed in: `POST /api/cards` inserts a row (`is_ai_generated = true`) and returns 201 with the card
- `front`/`back` empty or > 100 chars returns 400 envelope
- Unauthenticated request to `/api/cards` returns 401 envelope; visiting `/generate` or `/deck`
  while signed out redirects to `/auth/signin`
- Second test user cannot see the first user's card (RLS isolation)

**Implementation Note**: Pause for confirmation after automated verification before Phase 4.

---

## Phase 4: Gating UI (`/generate` page + wizard island)

### Overview

Build the protected `/generate` page and the interactive React island: paste → generate → one-at-a-time
accept/edit/delete → save-on-accept, with empty-state and error/retry handling.

### Changes Required:

#### 1. shadcn primitives

**File**: `src/components/ui/*` (via CLI)

**Intent**: Install the UI primitives the wizard needs, per convention (do not hand-craft).

**Contract**: Run `npx shadcn@latest add textarea card input label` (button already present). New
files land under `src/components/ui/`.

#### 2. Generate page shell

**File**: `src/pages/generate.astro` (new)

**Intent**: Protected Astro shell that hosts the wizard island.

**Contract**: Uses `Layout.astro`; reads `Astro.locals.user`; renders the wizard React component as a
client island (e.g. `client:load`). No business logic in the Astro file.

#### 3. Wizard island

**File**: `src/components/generate/GenerateWizard.tsx` (new)

**Intent**: Drive the full flow in the browser with in-memory state.

**Contract**: States — *input* (textarea, char counter to 5,000, Generate button, inline error +
Retry on failure, pasted text preserved), *generating* (loading indicator), *reviewing* (strict
one-card-at-a-time: show current card front/back with Accept / Edit / Delete-skip; Edit switches the
card to editable inputs validated non-empty ≤ 100 chars mirroring the server rule; Accept calls
`POST /api/cards` then advances; Delete advances without saving), *empty* (friendly "no cards —
try a longer/more detailed passage" with a way back to input), *done* (summary count + link to
`/deck`). Cards live in React state only; refresh discards un-saved. Use `cn()` for class merging;
no `"use client"`/`"use server"` directives. Optionally extract a `useCardWizard` hook into
`src/components/hooks/`.

### Success Criteria:

#### Automated Verification:

- shadcn primitives exist under `src/components/ui/`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Paste → Generate shows cards one at a time; Accept saves (row appears in DB) and advances
- Edit lets the user change front/back before accepting; empty/over-length edits are blocked in-UI
- Delete/skip advances without saving
- Generation failure shows inline error + Retry with pasted text intact; zero-card result shows the
  empty-state
- Finishing the wizard shows a summary and a working link to `/deck`; refresh mid-review discards
  un-accepted cards (accepted ones remain saved)

**Implementation Note**: Pause for confirmation after automated verification before Phase 5.

---

## Phase 5: Deck View (`/deck` read-only page)

### Overview

Add a minimal, read-only deck page listing all of the user's saved cards, and link to it.

### Changes Required:

#### 1. Deck page

**File**: `src/pages/deck.astro` (new)

**Intent**: Server-render the signed-in user's saved cards (FR-009); no edit/delete this slice.

**Contract**: Protected Astro page using `Layout.astro`; builds the Supabase client from
`Astro.request.headers` + `Astro.cookies`; calls `listCards(supabase, user.id)`; renders each card's
front/back (shadcn `card`), with an empty-state when the deck has no cards. Read-only.

#### 2. Navigation links

**File**: `src/pages/dashboard.astro` (and wizard done-state)

**Intent**: Let users reach generation and their deck.

**Contract**: Add links to `/generate` and `/deck` from the dashboard; the wizard done-state already
links to `/deck`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- `/deck` lists exactly the signed-in user's saved cards (front/back), most-recent first
- Empty deck shows the empty-state
- A second user's deck never shows the first user's cards (RLS isolation)
- Dashboard links to `/generate` and `/deck` work

**Implementation Note**: Final phase — after verification, the slice is ready for `/10x-impl-review`.

---

## Testing Strategy

No automated test framework is added this slice (per decision). Verification is manual E2E plus the
CI gate (`astro sync → lint → build`). The generation service keeps a mock seam so the UI can be
exercised without OpenRouter credentials.

### Manual Testing Steps:

1. Sign in; visit `/generate`; paste ~1–2 paragraphs; click Generate.
2. Step through cards: Accept one (confirm it saves), Edit one then Accept, Delete/skip one.
3. Visit `/deck`; confirm accepted/edited cards appear, skipped ones do not.
4. Force an error (bad/absent key or simulated timeout) → inline error + Retry, text preserved.
5. Paste gibberish/very short text to exercise the empty-state.
6. Submit > 5,000 chars and empty text → 400 envelopes.
7. Sign in as a second user → confirm no cross-user card visibility.
8. Run `npm run lint` and `npm run build` → both exit 0.

## Performance Considerations

Generation latency is dominated by the OpenRouter call; a single non-streamed request with a ~30s
`AbortController` timeout keeps the UX bounded. Save-on-accept is one small insert per card —
negligible at MVP scale; the `cards_user_id_idx` index already backs the per-user deck read.

## Migration Notes

No schema changes — the F-01 `cards` table and RLS are sufficient. Only a new optional
`OPENROUTER_MODEL` env var is introduced (backward compatible; defaults in code).

## References

- Related research: `context/changes/first-gated-generation/research.md`
- Card schema + RLS: `supabase/migrations/20260815000000_create_cards.sql`,
  `supabase/migrations/20260823000000_harden_cards_rls.sql`
- `Card` type: `src/types.ts:1-9`
- API-route pattern: `src/pages/api/auth/signin.ts`
- SSR client factory: `src/lib/supabase.ts`
- Middleware guard: `src/middleware.ts`
- OpenRouter structured outputs: https://openrouter.ai/docs/features/structured-outputs

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared Foundations

#### Automated

- [x] 1.1 `npm install` succeeds and `zod` is in `package.json` dependencies — 11c2369
- [x] 1.2 `npm run lint` passes with the new files — 11c2369
- [x] 1.3 `npm run build` passes (types resolve; `astro sync` clean) — 11c2369

#### Manual

- [x] 1.4 Card service functions and new DTOs resolve in the IDE — 11c2369
- [x] 1.5 Error-envelope helper produces the exact `{ error: { code, message, context } }` shape — 11c2369

### Phase 2: Generation Backend

#### Automated

- [x] 2.1 `npm run lint` passes
- [x] 2.2 `npm run build` passes
- [x] 2.3 Route file exports `prerender = false` and `POST`

#### Manual

- [x] 2.4 With no `OPENROUTER_API_KEY`, the mock seam returns canned cards from `POST /api/generate`
- [x] 2.5 With a real key, sample text returns valid `{ front, back }` cards
- [x] 2.6 Over-5,000-char and empty text return 400 envelopes
- [x] 2.7 Simulated provider failure/timeout returns a 502 envelope; pasted text is never logged

### Phase 3: Persistence Backend

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npm run build` passes
- [ ] 3.3 Route exports `prerender = false` and `POST`; middleware lists `/generate` and `/deck`

#### Manual

- [ ] 3.4 `POST /api/cards` inserts a row (`is_ai_generated = true`) and returns 201 with the card
- [ ] 3.5 Empty or > 100-char `front`/`back` returns 400 envelope
- [ ] 3.6 Unauthenticated `/api/cards` returns 401; `/generate` and `/deck` redirect when signed out
- [ ] 3.7 Second test user cannot see the first user's card (RLS isolation)

### Phase 4: Gating UI

#### Automated

- [ ] 4.1 shadcn primitives exist under `src/components/ui/`
- [ ] 4.2 `npm run lint` passes
- [ ] 4.3 `npm run build` passes

#### Manual

- [ ] 4.4 Paste → Generate shows cards one at a time; Accept saves and advances
- [ ] 4.5 Edit changes front/back before accepting; empty/over-length edits blocked in-UI
- [ ] 4.6 Delete/skip advances without saving
- [ ] 4.7 Generation failure shows inline error + Retry (text intact); zero cards shows empty-state
- [ ] 4.8 Finishing shows a summary + working `/deck` link; refresh discards un-accepted cards only

### Phase 5: Deck View

#### Automated

- [ ] 5.1 `npm run lint` passes
- [ ] 5.2 `npm run build` passes

#### Manual

- [ ] 5.3 `/deck` lists the signed-in user's saved cards (front/back), most-recent first
- [ ] 5.4 Empty deck shows the empty-state
- [ ] 5.5 A second user's deck never shows the first user's cards (RLS isolation)
- [ ] 5.6 Dashboard links to `/generate` and `/deck` work
