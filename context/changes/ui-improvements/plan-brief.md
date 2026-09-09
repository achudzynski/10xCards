# UI Improvements (S-04) — Plan Brief

> Full plan: `context/changes/ui-improvements/plan.md`

## What & Why

After sign-in, users currently land on a small centered status card with tiny text-sized links. This plan turns `/dashboard` into a real landing hub with large, easy-to-discover primary controls for "Generate cards" and "My deck", so the post-login experience is comfortable to operate rather than feeling like an auth placeholder.

## Starting Point

`/dashboard` already exists as the authenticated landing page (`src/pages/dashboard.astro`), protected centrally by `src/middleware.ts`. Today it's a single glass card with a welcome message, two small links (`px-4 py-2 text-sm`) to `/generate` and `/deck`, and a separate sign-out form. The shadcn `Button` (with an existing `size="lg"` variant) and `Card` primitives are already installed and available for reuse.

## Desired End State

Users sign in, land on `/dashboard`, and see three clear sections: a welcome header, a prominent primary-action group (Generate / Deck) sized for easy tap/click, and a visually secondary sign-out control. The layout stays responsive (stacked on mobile, side-by-side on larger screens), and generation, deck-management, and SRS review-session workflows are completely unaffected.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Button sizing | Use existing `Button size="lg"` + `asChild` | Already available in `src/components/ui/button.tsx`; no new size token or variant needed. |
| Sign-out treatment | Outline/ghost variant, placed below/beside primary CTAs | Keeps it operable but visually secondary to the main task CTAs. |
| Review CTA | Omit entirely | `s-03` review routes/components don't exist yet — no safe destination to link to; avoids scope collision. |
| Auth submit harmonization | Conditional — only if a real visual mismatch is found in Phase 2 | `SubmitButton` is already a prominent full-width CTA; changing it should be justified, not assumed. |
| Component boundary | `dashboard.astro` stays composition root; optional `DashboardActions.astro` only if the file grows unwieldy | Keeps isolation from generate/deck/review components per scope. |

## Scope

**In scope:**
- `src/pages/dashboard.astro` layout restructuring (welcome, primary CTAs, secondary sign-out)
- Optional presentational extraction to `src/components/dashboard/*`
- Conditional sizing tweak to `src/components/auth/SubmitButton.tsx`

**Out of scope:**
- `GenerateWizard.tsx`, `DeckView.tsx`, and their page shells
- `src/pages/api/review/*`, `src/pages/review/*`, `supabase/migrations/*` (all `s-03` territory)
- New `buttonVariants` size tokens, global typography/spacing changes
- Any review-session CTA or placeholder

## Architecture / Approach

Pure presentation-layer change confined to the dashboard page and (conditionally) the auth submit button, reusing existing shadcn `Button`/`Card` primitives and existing responsive Tailwind conventions (`flex-col sm:flex-row`, `p-4 sm:p-8`). No new routes, no data-model changes, no changes to middleware or route protection.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Dashboard layout and CTA upsizing | Three-section dashboard with large primary CTAs and secondary sign-out | Larger controls could crowd/wrap on narrow screens |
| 2. Auth control harmonization check | Verified (and if needed, adjusted) sign-in submit prominence | Unnecessary change if mismatch isn't real — kept conditional |
| 3. Verification | Lint/build pass + full regression check against generate/deck/review scope | Accidental touch of `s-03` territory |

**Prerequisites:** None beyond `S-01` (already done); no dependency on `s-03`.
**Estimated effort:** ~1 session across 3 phases (presentation-only change, no test runner in repo).

## Open Risks & Assumptions

- Assumes `Button size="lg"` provides sufficient visual prominence without further customization.
- Assumes no review-session route exists yet at implementation time — if `s-03` ships first, this plan does not add a review CTA and would need a follow-up change to do so.

## Success Criteria (Summary)

- Dashboard reads as a real landing hub with materially larger, easy-to-operate primary controls.
- Responsive behavior holds across mobile/tablet/desktop; generation and deck workflows are unaffected.
- No `s-03` routes, components, or migrations are touched; lint and build succeed.
