---
project: "10xCards"
version: 1
status: draft
created: 2026-08-15
updated: 2026-09-06
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: 10xCards

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

10xCards eliminates the bottleneck of manual flashcard creation: professionals with a block
of text to study paste it once and receive a ready-to-review deck of AI-generated cards.
The differentiating trait — the single characteristic that, if removed, would make this
indistinguishable from a generic AI tool — is that AI-generated cards are both grounded in
the user's own source text and human-gated before they land in the deck. After gating, the
deck becomes a spaced-repetition study tool that adapts to the user's own retention pattern.

## North star

**S-01: first-gated-generation** — user pastes text, receives AI-generated cards, gates each
one (accept / edit / delete), and accepted cards appear in their personal deck.

> _Gwiazda przewodnia_ — the smallest end-to-end flow that, if shipped first, proves the
> core hypothesis of the product (that AI can generate flashcard-quality content from
> user-supplied text). Placed as the first slice because every other capability — deck
> management, spaced-repetition sessions — only matters once this works.
>
> Validation milestone (the earliest point at which primary Success Criteria become
> measurable): the primary Success Criterion "75% of AI-generated flashcards are accepted
> by the user" cannot be measured until this slice ships end-to-end.

## At a glance

| ID   | Change ID              | Outcome (user can …)                                                                               | Prerequisites | PRD refs                                                              | Status      |
| ---- | ---------------------- | -------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------- | ----------- |
| F-01 | card-schema            | (foundation) cards table with RLS policies migrated to Supabase; client ready to persist card data | —             | FR-004, FR-009, NFR (data privacy, session durability)                | done        |
| S-01 | first-gated-generation | paste text → AI-generated card list → gate each card → accepted cards in deck                      | F-01          | US-01, FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-009 | done        |
| S-02 | deck-management        | create a card manually; edit and delete any saved card                                             | S-01          | FR-008, FR-010, FR-011                                                | in-progress |
| S-03 | srs-review-session     | start a spaced-repetition review session, answer due cards, have schedule updated                  | S-01, F-01    | US-02, FR-012, FR-013                                                 | ready       |
| S-04 | ui-improvements        | use a clear post-login dashboard and comfortably sized primary controls                            | S-01          | NFR (usability)                                                       | ready       |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives
in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme          | Chain                    | Note                                                                                                         |
| ------ | -------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| A      | Creation loop  | `F-01` → `S-01` → `S-02` | The minimum required sequence for speed-mode: schema → gated generation (north star) → full deck management. |
| B      | Review loop    | `S-03`                   | Joins Stream A at `S-01`; OQ-3 resolved (SM-2) — ready to plan.                                              |
| C      | Product polish | `S-04`                   | Runs in parallel with S-03; improves navigation and control usability without changing core flows.           |

## Baseline

What's already in place in the codebase as of 2026-08-15 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro + React + Tailwind; layout, routing, and auth pages complete (`src/layouts/Layout.astro`, `src/pages/auth/`)
- **Backend / API:** partial — auth API endpoints only (`src/pages/api/auth/*`); no card, generation, or review API layer
- **Data:** partial — Supabase client configured (`src/lib/supabase.ts`); no migrations, no schema defined
- **Auth:** present — Supabase SSR auth fully wired: signup, signin, signout, middleware guarding `/dashboard` (`src/middleware.ts`)
- **Deploy / infra:** partial — GitHub Actions CI present (`.github/workflows/ci.yml`); `wrangler.jsonc` present; no CD pipeline
- **Observability:** partial — Cloudflare `observability` enabled in `wrangler.jsonc`; no structured logging or error-tracking middleware

## Foundations

### F-01: card-schema

- **Outcome:** (foundation) cards table migrated to Supabase with RLS policies that scope all card data strictly to the authenticated user; the Supabase client can create, read, update, and delete card rows.
- **Change ID:** card-schema
- **PRD refs:** FR-004 (generation needs a target table), FR-009 (deck view reads card rows), NFR (per-user data isolation per Access Control section; session durability)
- **Unlocks:** S-01 (first-gated-generation — cards need a place to land), S-02 (deck-management — requires existing card rows to edit and delete), S-03 (srs-review-session — requires card rows to attach SRS scheduling fields to)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** OQ-3 (SRS library choice) will determine which scheduling columns are needed; those SRS-specific fields are NOT required in this foundation — they will be introduced in S-03 when first needed. Owner: user. Block: no.
- **Risk:** Sequenced first because every vertical slice requires card rows to exist. RLS policies must be correct from the start — adding them retroactively after card data exists risks per-user data-leak bugs in later slices.
- **Status:** done

## Slices

### S-01: first-gated-generation

- **Outcome:** user can paste a block of text, trigger AI card generation, review generated cards one-by-one (accepting, editing front/back, or deleting each), and see accepted cards listed in their personal deck.
- **Change ID:** first-gated-generation
- **PRD refs:** US-01, FR-001 (satisfied by auth baseline), FR-002 (satisfied by auth baseline), FR-003 (satisfied by auth baseline), FR-004, FR-005, FR-006, FR-007, FR-009
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - OQ-2: Text length cap for FR-004 — specific token/character limit; to be resolved during implementation based on AI provider cost and rate-limit tradeoffs. Owner: user. Block: no.
  - AI provider API credentials — must be available before generation can be tested end-to-end; the gating UI (accept/edit/delete) can be built and tested against a mocked response first. Owner: user. Block: no.
- **Risk:** Heaviest slice: AI provider integration + gating UI + minimal deck view. Derisked by building gating UI against a mocked AI response first, then wiring the real provider. AI response latency directly affects perceived friction — key to the 75% acceptance Success Criterion.
- **Status:** done

### S-02: deck-management

- **Outcome:** user can create a flashcard manually (front and back), edit any saved card in their deck, and delete any saved card from their deck.
- **Change ID:** deck-management
- **PRD refs:** FR-008, FR-010, FR-011
- **Prerequisites:** S-01
- **Parallel with:** S-03 (S-01 is done and OQ-3 is resolved; S-02 and S-03 have no dependency on each other and can be built in parallel)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Smallest slice; sequenced after S-01 because manual card management only matters once a deck exists. Editing a card that has an SRS schedule (FR-010) creates an edge case — the PRD resolution states the schedule survives content changes; important to confirm this behaviour before implementation to avoid later migration.
- **Status:** in-progress

### S-03: srs-review-session

- **Outcome:** user can start a spaced-repetition review session, see each card due for review and answer it per the SRS answer schema, and have each card's next review date updated according to the chosen SRS algorithm.
- **Change ID:** srs-review-session
- **PRD refs:** US-02, FR-012, FR-013
- **Prerequisites:** S-01, F-01
- **Parallel with:** S-02 (no dependency on each other; can be built in parallel)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The SM-2 answer schema (0–5 self-rating) drives the review UI and requires new SRS-specific columns (`ease_factor`, `interval`, `repetitions`, `due_date`) on the card table. NFR (session progress must survive browser refresh) adds state-persistence complexity — review session state must be durable, not in-memory.
- **Status:** ready

### S-04: ui-improvements

- **Outcome:** after signing in, the user lands on the dashboard, and primary dashboard and authentication controls are large enough to be easy to discover and operate.
- **Change ID:** ui-improvements
- **PRD refs:** NFR (usability)
- **Prerequisites:** S-01
- **Parallel with:** S-03 (UI polish has no dependency on the review-session implementation and can be built in parallel)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Visual changes must preserve the existing responsive layout and avoid changing shared control defaults in ways that unintentionally affect generation or deck workflows.
- **Status:** ready

## Backlog Handoff

| Roadmap ID | Change ID              | Suggested issue title                               | Ready for `/10x-plan` | Notes                                                                 |
| ---------- | ---------------------- | --------------------------------------------------- | --------------------- | --------------------------------------------------------------------- |
| F-01       | card-schema            | Set up cards table with Supabase migrations and RLS | done                  | Archived — see Done log                                               |
| S-01       | first-gated-generation | AI flashcard generation + gating flow (north star)  | done                  | Archived — see Done log                                               |
| S-02       | deck-management        | Manual card creation, edit, and delete              | yes                   | Requires S-01 (done); run `/10x-plan deck-management`                 |
| S-03       | srs-review-session     | Spaced-repetition review session                    | yes                   | SM-2 chosen for OQ-3 (2026-09-03); run `/10x-plan srs-review-session` |
| S-04       | ui-improvements        | Post-login dashboard and larger primary controls    | yes                   | Runs in parallel with S-03; run `/10x-plan ui-improvements`           |

## Open Roadmap Questions

1. **OQ-1: What are the acceptance criteria for US-01 (AI generation)?** — Minimum card count per generation, expected response time, empty-state behavior when input text yields no extractable concepts. Owner: user. Block: no (MVP can ship; criteria needed for testing S-01). Affects: S-01 verification.
2. **OQ-2: What is the text length cap for FR-004?** — Token/character limit based on chosen AI provider's cost and rate-limit tradeoffs. Owner: user. Block: no. Affects: S-01.
3. ~~**OQ-3: Which SRS library will be integrated for FR-012?**~~ **Resolved 2026-09-03: SM-2.** Chosen for simplicity — a small, dependency-free formula (ease factor, interval, repetitions) well suited to MVP scale; FR-013's answer schema is a 0–5 self-rating. New SRS-specific columns (`ease_factor`, `interval`, `repetitions`, `due_date`) will be added to the card table in S-03. Unblocks S-03.

## Parked

- **Building own SRS algorithm** — Why parked: PRD §Non-Goals; custom algorithm would exceed the 3-week timeline and the problem is already solved by existing libraries.
- **Advanced import formats (PDF, DOCX, images)** — Why parked: PRD §Non-Goals; text paste covers the primary use case for MVP.
- **Shared decks and team workspaces** — Why parked: PRD §Non-Goals; multi-user sharing adds access-control complexity beyond the solo primary persona.
- **Mobile apps** — Why parked: PRD §Non-Goals; the web app is accessible from mobile browsers without native app overhead.
- **External platform integrations (LMS, Coursera, etc.)** — Why parked: PRD §Non-Goals; no outbound integrations for MVP.
- **SuperMemo / Anki parity features** — Why parked: PRD §Non-Goals; 10xCards solves card creation, not the full review ecosystem.
- **FR-014: show next scheduled review date per card** — Why parked: PRD Priority: nice-to-have; deferred in speed-mode; low value relative to the scheduling metadata UI complexity.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches a roadmap item is archived.)

- **S-01: user can paste a block of text, trigger AI card generation, review generated cards one-by-one (accepting, editing front/back, or deleting each), and see accepted cards listed in their personal deck.** — Archived 2026-09-03 → `context/archive/2026-08-23-first-gated-generation/`. Lesson: —.
- **F-01: (foundation) cards table migrated to Supabase with RLS policies that scope all card data strictly to the authenticated user; the Supabase client can create, read, update, and delete card rows.** — Archived 2026-09-03 → `context/archive/2026-08-15-card-schema/`. Lesson: —.
