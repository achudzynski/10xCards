# First Gated Generation (S-01) — Plan Brief

> Full plan: `context/changes/first-gated-generation/plan.md`
> Research: `context/changes/first-gated-generation/research.md`

## What & Why

Ship the north-star slice: a user pastes text, gets AI-generated flashcards, gates each one
(accept / edit / delete), and accepted cards land in their personal deck. This is the smallest
end-to-end flow that proves the core hypothesis — that AI can produce flashcard-quality content
grounded in the user's own source text, human-gated before it enters the deck.

## Starting Point

The F-01 `cards` table (with per-user RLS, `user_id` index, `updated_at` trigger) and the `Card`
domain type already exist. `OPENROUTER_API_KEY` is wired into the env schema. Everything else for
this slice is greenfield: no service layer, no JSON API routes, no OpenRouter client, no gating UI,
no deck view, and `zod` isn't installed.

## Desired End State

A signed-in user visits `/generate`, pastes up to 5,000 characters, and gets up to ~10 generated
cards. They step through them one at a time — accepting (saves immediately), editing before
accepting, or skipping — then land on a read-only `/deck` listing their saved cards. Failures show
an inline Retry; text with no extractable concepts shows a friendly empty-state.

## Key Decisions Made

| Decision                    | Choice                                                                 | Why                                                              | Source   |
| --------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- | -------- |
| AI provider/model           | OpenRouter, configurable model via optional env, low-cost default     | Key already wired; env override avoids code changes             | Research/Plan |
| Text length cap             | ~5,000 chars, zod-enforced                                            | Balances cost/latency vs. useful input size                     | Plan     |
| Cards per generation        | Up to ~10, no hard minimum                                            | Simple contract; accept whatever valid cards return             | Plan     |
| Zero-card result            | Friendly empty-state, edit + retry                                    | Better UX than an error for legitimately thin text              | Plan     |
| Request/latency handling    | Single non-streamed call, server timeout, inline error + Retry        | Simplest robust UX; preserves pasted text on failure            | Plan     |
| Gating UX                   | Strict one-card-at-a-time wizard                                      | User's explicit choice; focused decisions                       | Plan     |
| Gating state persistence    | In-memory React state only                                           | NFR durability targets review sessions (S-03), not generation   | Plan     |
| Persistence timing          | Save each card on accept (`POST /api/cards`)                          | Matches wizard; no accepted work lost                           | Plan     |
| Card validation             | front/back required, trimmed, 1–100 chars, zod server + UI mirror     | Consistent guardrails at boundary and UI                        | Plan     |
| Deck view scope             | Minimal read-only Astro page; edit/delete deferred to S-02           | Satisfies FR-009 without scope creep                            | Plan     |
| Testing                     | Manual only; keep a mock seam for dev                                | User opted out of tests this slice; seam derisks UI build       | Plan     |

## Scope

**In scope:** paste + generate (OpenRouter), one-at-a-time accept/edit/delete gating, save-on-accept
persistence, read-only deck view, JSON error envelope + zod validation, route protection.

**Out of scope:** manual card creation, editing/deleting *saved* cards (S-02), SRS/review (S-03),
streaming, background jobs, model picker, automated tests, draft persistence, pagination.

## Architecture / Approach

Bottom-up, mock-first. Layers: `cards` service (snake↔camel mapping) + generation service (OpenRouter
structured `json_schema`, with a mock seam) → two JSON API routes (`/api/generate`, `/api/cards`) that
re-check auth, validate with zod, and emit the `{ error: { code, message, context } }` envelope →
a protected `/generate` Astro page hosting a React wizard island → a read-only `/deck` Astro page.
RLS enforces per-user isolation; pasted text is never persisted or logged.

## Phases at a Glance

| Phase                      | What it delivers                                              | Key risk                                            |
| -------------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| 1. Shared foundations      | zod, DTOs, error-envelope helper, `cards` service            | Getting the snake↔camel mapping contract right      |
| 2. Generation backend      | OpenRouter service (mock seam) + `POST /api/generate`        | OpenRouter response reliability / structured output |
| 3. Persistence backend     | `POST /api/cards` + route protection                         | Correct `user_id`/RLS handling                      |
| 4. Gating UI               | `/generate` page + one-at-a-time wizard island               | First non-auth island; wizard state edge cases      |
| 5. Deck view               | Read-only `/deck` page + nav links                           | Minimal — server-rendered list only                 |

**Prerequisites:** F-01 `cards` schema (done); an `OPENROUTER_API_KEY` for real E2E (mock seam works
without it).
**Estimated effort:** ~3–5 focused sessions across the 5 phases.

## Open Risks & Assumptions

- OpenRouter structured-output quality/latency directly affects the 75%-acceptance success metric;
  the chosen model may need tuning.
- No automated tests means regressions rely on manual verification and the lint/build CI gate.
- Acceptance criteria for US-01 (min card count, latency target) are still soft (OQ-1) — used as
  guidance, not gates, for this slice.

## Success Criteria (Summary)

- A user can paste text and receive gated, editable AI cards, saving the ones they accept.
- Accepted cards appear in a per-user read-only deck; no cross-user leakage.
- Generation failures and empty results are handled gracefully; `lint` and `build` pass.
