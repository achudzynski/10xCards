<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: First Gated Generation (S-01)

- **Plan**: context/changes/first-gated-generation/plan.md
- **Scope**: Phases 1–5 of 5 (full plan)
- **Date**: 2026-08-26
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Deck page renders raw markup instead of the planned shadcn `Card`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency / Plan Adherence
- **Location**: src/pages/deck.astro:45-49
- **Detail**: The Phase 5 contract says "renders each card's front/back (shadcn `card`)". The page instead uses raw `<li>` + `<div>` styling. The `Card`/`CardHeader`/`CardContent` primitives are already installed in src/components/ui/card.tsx. Behavior is correct; only the primitive convention drifts.
- **Fix**: Import and use the shadcn `Card`/`CardContent` primitives in deck.astro for each card row, matching the wizard's use of the same primitive.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Use installed shadcn/ui primitives instead of hand-rolled markup

### F2 — Deck load errors are uncaught and surface as a 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/pages/deck.astro:10-12
- **Detail**: `listCards()` is awaited with no try/catch. A transient Supabase failure throws during SSR and renders a blank 500 rather than a friendly deck-load error state. The wizard and API routes handle their external-boundary errors; the deck page does not.
- **Fix**: Wrap `listCards` in try/catch; on failure render a safe "couldn't load your deck, try again" state instead of throwing.
- **Decision**: FIXED (Fix now)

### F3 — Generated cards are not length-capped, so un-edited Accept of a long card fails on save

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability / UX)
- **Location**: src/lib/services/generation.ts:17
- **Detail**: The generation zod schema validates `front`/`back` only as strings. `/api/cards` enforces `max(100)`. A model can return a card longer than 100 chars; accepting it without editing produces a generic "invalid input" save error with no in-UI guidance about the length rule. The plan's contract snippet did not specify a length cap here, so this is a plan gap rather than a deviation.
- **Fix**: Add `.max(100)` (and `.trim().min(1)`) to the generated-card zod schema and truncate/drop over-length cards, or surface the length rule in the review UI before Accept.
- **Decision**: FIXED (Fix now — drop empty/over-length cards via per-card schema)

### F4 — `/generate` shell does not read `Astro.locals.user` as the contract states

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/generate.astro:1-10
- **Detail**: Phase 4 contract says the shell "reads `Astro.locals.user`". The page only mounts the island; auth is enforced by middleware (`PROTECTED_ROUTES`). Behaviorally correct — the read is redundant given middleware — so this is a benign contract drift.
- **Fix**: Optionally drop the contract clause (no code change needed) or read `Astro.locals.user` for symmetry with dashboard/deck.
- **Decision**: SKIPPED

### F5 — Missing `OPENROUTER_API_KEY` fails open to mock cards

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/generation.ts:56
- **Detail**: When the key is absent, `generateCards` returns canned mock cards. This is intentional per the plan ("a mockable service seam ... returns canned cards when the key is absent so the UI is buildable without credentials"). Flagged only as a production-hardening reminder: in production a missing key silently yields fake, ungrounded cards rather than an error.
- **Fix**: Gate the mock behind an explicit dev/test flag and fail closed with a configuration error in production.
- **Decision**: SKIPPED

### F6 — Accept has no synchronous in-flight lock (double-submit window)

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Data safety)
- **Location**: src/components/generate/GenerateWizard.tsx:93
- **Detail**: `handleAccept` guards re-entry via `isSaving` state, and the Accept button is `disabled={isSaving}` (line 247), so the practical double-submit window is a single render tick. A ref-based lock would close it entirely, but the current guard makes duplicate inserts very unlikely.
- **Fix**: Add a `useRef` in-flight lock checked at the top of `handleAccept` for belt-and-suspenders idempotency.
- **Decision**: SKIPPED
