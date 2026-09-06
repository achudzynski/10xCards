---
date: 2026-08-23T22:46:39+01:00
researcher: Copilot CLI
git_commit: 7e0dc062271158983388f6f93618116a648b51fe
branch: master
repository: achudzynski/10xCards
topic: "S-01 first-gated-generation: paste text → AI-generate cards → gate each → save accepted to deck"
tags: [research, codebase, ai-generation, gating, cards, openrouter, supabase, rls]
status: complete
last_updated: 2026-08-23
last_updated_by: Copilot CLI
---

# Research: S-01 first-gated-generation

**Date**: 2026-08-23T22:46:39+01:00
**Researcher**: Copilot CLI
**Git Commit**: 7e0dc062271158983388f6f93618116a648b51fe
**Branch**: master
**Repository**: achudzynski/10xCards

## Research Question

What does the existing codebase already provide, and what must be built, to implement
the north-star slice **S-01 first-gated-generation**: a logged-in user pastes a block of
text, triggers AI flashcard generation, reviews each generated card one-by-one
(accept / edit / delete), and sees accepted cards land in their personal deck
(PRD refs: US-01, FR-004–FR-007, FR-009)?

## Summary

The foundation is **ready**: F-01 (`card-schema`) is `impl_reviewed` — the `cards` table
exists with hardened per-user, per-role RLS, a `user_id` index, and an `updated_at` trigger,
and a matching `Card` domain type is exported from `src/types.ts`. Auth, the SSR Supabase
client factory, per-request user resolution, and the API-route conventions are all in place
and can be copied directly.

**Nothing card-related exists in `src/` yet** beyond the type — no service layer, no card API
routes, no generation code, no deck UI. Everything for S-01 is greenfield on top of the
foundation. The AI provider decision is effectively already made: **OpenRouter** is wired into
the env schema (`OPENROUTER_API_KEY` in `astro.config.mjs` + `.env.example`) but has no client
code yet. OpenRouter's `/chat/completions` with `response_format: json_schema` (strict mode) is
the natural fit for generating structured `{front, back}` pairs.

The heaviest, highest-risk pieces are: (1) the OpenRouter integration + prompt/schema, (2) the
interactive one-by-one gating UI (the first React island beyond auth forms), and (3) the batch
"save accepted cards" write. The roadmap's derisking guidance — build the gating UI against a
**mocked** generation response first, then wire the real provider — is directly supported by
the current architecture (the service layer can be swapped without touching the UI).

## Detailed Findings

### Data foundation (F-01, done) — cards table + type

- `supabase/migrations/20260815000000_create_cards.sql` — creates `public.cards`:
  `id UUID pk`, `user_id UUID NOT NULL → auth.users(id) ON DELETE CASCADE`, `front TEXT NOT NULL`,
  `back TEXT NOT NULL`, `is_ai_generated BOOLEAN NOT NULL DEFAULT false`, `created_at`, `updated_at`
  (both `TIMESTAMPTZ DEFAULT now()`). RLS enabled; four per-operation policies gated on
  `auth.uid() = user_id`; `BEFORE UPDATE` trigger `cards_set_updated_at` calls `public.set_updated_at()`.
- `supabase/migrations/20260823000000_harden_cards_rls.sql` — scopes all four policies
  `TO authenticated` (per-role rule) and adds `cards_user_id_idx ON public.cards(user_id)`.
- `src/types.ts:1-9` — `Card` domain type in **camelCase** (`userId`, `isAiGenerated`,
  `createdAt`, `updatedAt`). DB columns are snake_case; **the plan states the mapping happens at
  the service layer, which does not exist yet** — S-01 must introduce that mapping.
- Implication for S-01: `is_ai_generated` must be set `true` on inserts from the gated-generation
  flow. There is **no `source_text` / provenance column** — pasted text is not persisted (aligns
  with the NFR that pasted text must not linger; see Architecture Insights).

### AI provider — OpenRouter wired, no client code

- `astro.config.mjs` env schema declares `OPENROUTER_API_KEY` as
  `envField.string({ context: "server", access: "secret", optional: true })` — same pattern as
  the Supabase secrets, so it is **server-only** and imported via `astro:env/server`.
- `.env.example` lists `OPENROUTER_API_KEY=###`; tech-stack `has_ai: true`.
- No `src/lib/openrouter*.ts` or any generation service exists yet — **greenfield**.
- External research (OpenRouter docs, 2026): POST `/api/v1/chat/completions` with
  `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`.
  Best practices: `strict: true`, per-property `description`s, validate the response against the
  schema server-side, set `require_parameters: true` so only providers supporting structured
  output are used. For a **list** of cards, wrap in
  `{ type: "object", properties: { cards: { type: "array", items: {front, back} } }, required:["cards"], additionalProperties:false }`.
  Refs: https://openrouter.ai/docs/features/structured-outputs ,
  https://openrouter.ai/docs/api_reference/overview

### API route conventions (copy these)

- `src/pages/api/auth/signin.ts`, `signup.ts`, `signout.ts` — the only existing API routes.
  Pattern: `export const POST: APIRoute = async (context) => { ... }`, build the client with
  `createClient(context.request.headers, context.cookies)`, guard the null client
  (`if (!supabase) ...`). **These are form-post routes that `context.redirect(...)`**, not JSON
  APIs — S-01's generation/save endpoints will instead be `fetch`-called from a React island and
  must return JSON.
- **Two project hard rules apply to every new route**:
  - API routes must `export const prerender = false` (SSR mode). The existing auth routes do not
    set it explicitly — verify whether the adapter defaults it; S-01 routes should set it to be safe.
  - API errors must use the envelope `{ error: { code, message, context } }` (never `{ error: string }`).
    No existing route models this yet (auth routes redirect with query-string errors), so S-01
    establishes the JSON-error precedent for the codebase.
- Input validation: AGENTS.md mandates **zod** for API input validation. `zod` is **not yet a
  dependency** (`package.json`) — S-01 will need to add it.

### Auth / user resolution / route protection

- `src/middleware.ts` — resolves `context.locals.user` on every request via
  `supabase.auth.getUser()`; redirects unauthenticated hits to `/auth/signin` for any path in
  `PROTECTED_ROUTES` (currently only `["/dashboard"]`).
- `src/env.d.ts` — types `App.Locals.user` as `User | null`.
- Implication: the generation page + its API routes must be under a protected path. Either add the
  new route(s) to `PROTECTED_ROUTES` (e.g. `/generate`, `/deck`) **and** re-check
  `context.locals.user` inside each API handler (defense in depth — middleware guards pages, but
  API routes should verify identity before touching `cards`, since inserts need `user_id`).

### UI / component conventions

- `src/pages/dashboard.astro` — the only protected page; static Astro, reads `Astro.locals.user`,
  server-rendered. Good template for a new `/generate` or `/deck` shell.
- React islands live under `src/components/**` and are all **auth forms today**
  (`src/components/auth/SignInForm.tsx`, etc.) — these are the closest precedent for an
  interactive client component. The gating UI (accept/edit/delete, per-card state) will be the
  first non-auth React island.
- shadcn/ui: only `src/components/ui/button.tsx` is installed ("new-york" variant). Per AGENTS.md,
  install new primitives with `npx shadcn@latest add [name]` (e.g. `textarea`, `card`, `input`) —
  do **not** hand-craft them.
- `src/lib/utils.ts` — `cn()` (clsx + tailwind-merge). Hard rule: use `cn()` for all class merging.
- Layout: `src/layouts/Layout.astro`; hooks go in `src/components/hooks/` (dir not created yet).
- Hard rules to respect in new components: no `"use client"` / `"use server"` directives; Astro for
  static/layout, React only for the interactive gating section.

### Deck view (FR-009)

- No deck/list page or card-read code exists. S-01's FR-009 scope is a **minimal** deck view
  (list accepted cards) — full CRUD management is deferred to S-02 (`deck-management`). A
  `GET /api/cards` (or direct Supabase read in an Astro page) + a simple list satisfies FR-009.

## Code References

- `supabase/migrations/20260815000000_create_cards.sql` - cards table, RLS, updated_at trigger
- `supabase/migrations/20260823000000_harden_cards_rls.sql` - `TO authenticated` + user_id index
- `src/types.ts:1-9` - `Card` domain type (camelCase; needs snake_case service mapping)
- `astro.config.mjs` - env schema: `SUPABASE_URL/KEY`, `OPENROUTER_API_KEY` (server secrets); `output:"server"`
- `src/lib/supabase.ts` - `createClient(requestHeaders, cookies)` SSR factory (returns null if unconfigured)
- `src/middleware.ts` - user resolution + `PROTECTED_ROUTES` guard
- `src/env.d.ts` - `App.Locals.user` typing
- `src/pages/api/auth/signin.ts` - API-route pattern (POST, redirect-based errors)
- `src/pages/dashboard.astro` - protected Astro page reading `Astro.locals.user`
- `src/components/auth/SignInForm.tsx` - existing interactive React island precedent
- `src/components/ui/button.tsx` - only installed shadcn primitive
- `src/lib/utils.ts:5` - `cn()` class-merge helper
- `.env.example` - required secrets incl. `OPENROUTER_API_KEY`

## Architecture Insights

- **Layered pattern implied by the card-schema plan**: DB → `src/lib/services/*` (snake↔camel
  mapping + Supabase calls) → API routes → React island. The service layer is deliberately
  deferred to slices; S-01 creates the first card service (`src/lib/services/cards.ts`) and the
  first AI service (`src/lib/services/generation.ts` or `src/lib/openrouter.ts`).
- **Mock-first derisking is architecturally supported**: because the island talks to an API route
  that talks to a service, the OpenRouter call can be stubbed behind the service boundary so the
  gating UI is buildable/testable before credentials exist (matches roadmap S-01 risk note).
- **NFR — pasted text must not linger**: no `source_text` column exists and none is needed; keep
  the pasted text in the request body only, do not log it, do not persist it. Generation should be
  stateless: text in → `{front, back}[]` out → discarded.
- **RLS does the isolation**: inserts must carry `user_id = locals.user.id`; the INSERT policy's
  `WITH CHECK (auth.uid() = user_id)` rejects mismatches, so per-user safety is enforced at the DB
  even if an API handler forgets a filter. Still set/verify `user_id` explicitly.
- **Error-envelope precedent**: S-01 is the first JSON API surface — it defines the reusable
  `{ error: { code, message, context } }` shape (consider a tiny helper in `src/lib/`).
- **Batch accept**: "save accepted cards" is a multi-row insert; Supabase `insert([...])` in one
  call is preferable to N round-trips.

## Historical Context (from prior changes)

- `context/changes/card-schema/plan.md` - F-01 plan; explicitly **defers** the service layer,
  card API routes, and SRS columns to later slices; establishes camelCase domain type + snake_case
  DB columns with service-layer mapping as the convention S-01 must implement.
- `context/changes/card-schema/reviews/impl-review.md` - F-01 review: RLS `TO authenticated` and
  `user_id` index were added as corrective migration `20260823000000`; trigger `search_path`
  hardening (F2) was **skipped/deferred** (low risk). Lesson for S-01: follow the per-role RLS +
  index conventions when/if new tables are added, and prefer Supabase linter-clean SQL.
- `context/foundation/roadmap.md` - S-01 is the north star; prerequisites (F-01) satisfied;
  derisk via mocked generation first; open unknowns OQ-1 (acceptance criteria), OQ-2 (text cap),
  and AI credentials are non-blocking for building the gating UI.
- `context/foundation/prd.md` - FR-004–FR-007, FR-009 scope; NFR (pasted text privacy); Access
  Control (strict per-user isolation); Non-Goal: don't build SRS here (S-03).

## Related Research

- None yet — this is the first `research.md` for `first-gated-generation`. F-01 has no separate
  research artifact (only `plan.md`, `plan-brief.md`, `reviews/impl-review.md`).

## Open Questions

1. **OQ-1 (acceptance criteria for US-01)** — minimum card count per generation, expected latency,
   and empty-state behavior when the text yields no concepts. Non-blocking for build; needed for
   S-01 verification. Owner: user.
2. **OQ-2 (text length cap for FR-004)** — pick a character/token cap for the paste input based on
   OpenRouter model context + cost. Enforce with a zod `.max()` on input. Owner: user.
3. **Which OpenRouter model?** — env key is set but no model chosen. Needs a default (e.g. a
   low-cost structured-output-capable model) with `require_parameters: true`. Owner: user.
4. **`prerender = false` on existing auth routes** — confirm whether the Cloudflare adapter
   defaults API routes to non-prerendered; S-01 routes should set it explicitly regardless.
5. **Streaming vs. single response** — MVP can use a single non-streamed generation call; streaming
   the card list is a later UX refinement.
6. **Partial-accept semantics** — if the user accepts some cards and leaves, is the session state
   persisted? PRD NFR about durable progress targets the _review_ session (S-03), not generation;
   assume in-memory gating for S-01 unless the user wants otherwise.
