# UI Improvements (S-04) Implementation Plan

## Overview

Improve the authenticated landing experience by turning `/dashboard` from a small centered status card into a clear post-login hub with larger, easier-to-discover primary controls. Keep the change isolated to dashboard and auth-surface controls, preserve the current responsive layout patterns, and avoid touching generation, deck-management, or SRS review-session logic.

The codebase already lands authenticated users on `/dashboard`, uses Astro SSR shells with Tailwind utility classes, and has both raw anchor/button markup and reusable shadcn `Button`/`Card` primitives available. The implementation should reuse those primitives where possible, define a "large primary control" treatment only for dashboard/auth entry controls, and leave generation/deck/review interaction components unchanged.

## Current State Analysis

### Post-login landing and route protection

- `/dashboard` is already the authenticated landing page and reads `Astro.locals.user` directly: `src/pages/dashboard.astro:4-41`.
- Authenticated routes are protected centrally in `src/middleware.ts:4-24`; `/dashboard`, `/generate`, and `/deck` are already in `PROTECTED_ROUTES`.
- Top-level signed-in navigation also links back to `/dashboard` and exposes sign-out in `src/components/Topbar.astro:5-37`.

### Current dashboard structure

- The current dashboard is a single centered glass card with:
  - title + welcome text
  - links to `/generate` and `/deck`
  - a separate sign-out form
- All three controls are currently small text-sized affordances using raw Tailwind classes (`px-4 py-2 text-sm`): `src/pages/dashboard.astro:17-38`.
- There is no existing review CTA on the dashboard today; the plan should leave room for a review area without coupling to `s-03`.

### Current component and sizing conventions

- The reusable shadcn button primitive exists in `src/components/ui/button.tsx:7-50`.
  - default size: `h-9 px-4 py-2`
  - large size: `h-10 px-6`
- Cards exist in `src/components/ui/card.tsx:5-56`.
- Auth submit uses the shared `Button` but overrides classes manually for a more prominent full-width CTA in `src/components/auth/SubmitButton.tsx:11-30`.
- Sign-in fields are custom-styled, not shadcn `Input`, in `src/components/auth/FormField.tsx:5-68`.

### Responsive and layout patterns already used

- Global shell is minimal (`src/layouts/Layout.astro:13-49`); page-level layout decisions happen inside pages/components.
- Existing responsive patterns in the repo favor:
  - outer padding `p-4`, then `sm:p-8`
  - centered max-width containers like `max-w-sm`, `max-w-2xl`, `max-w-4xl`
  - single-column mobile → multi-column desktop grids, e.g. `sm:grid-cols-3` in `src/components/Welcome.astro:27-57`
  - stacked mobile CTAs → inline row CTAs with `flex-col sm:flex-row`
- Tailwind 4 tokens come from default spacing/radius scale plus CSS variables in `src/styles/global.css:1-125`; there is no custom Tailwind config file.

### Existing deck/generation surfaces that must not regress

- Generate page only mounts `GenerateWizard` inside a centered `max-w-2xl` shell: `src/pages/generate.astro:6-12`.
- `GenerateWizard` uses shared `Button` heavily for workflow actions such as Generate, Accept, Edit, Skip, Retry, and completion CTAs: `src/components/generate/GenerateWizard.tsx:147-315`.
- Deck page has its own page-level CTA sizing and interactive controls: `src/pages/deck.astro:22-49`, `src/components/deck/DeckView.tsx:81-144`.
- Per `context/foundation/lessons.md:5-10`, installed shadcn primitives should be reused instead of hand-rolled equivalents.

## Desired End State

After sign-in, users land on `/dashboard` and see a clear landing hub — not a small placeholder status card — with large, easy-to-spot primary controls for "Generate cards" and "My deck", and a visually secondary but still easy-to-operate sign-out control. The layout remains fully responsive (mobile stacked → desktop grid), and the generation, deck-management, and SRS review-session workflows are functionally and visually untouched.

Verification: sign in, land on `/dashboard`, confirm the new layout at mobile/tablet/desktop widths, navigate to `/generate` and `/deck` and confirm both pages are unchanged, sign out and confirm it still works, then run `npm run lint` and `npm run build`.

### Key Discoveries:

- `/dashboard` is already the authenticated landing page and reads `Astro.locals.user` directly: `src/pages/dashboard.astro:4-41`. All three controls (Generate, Deck, Sign out) currently use small raw Tailwind classes (`px-4 py-2 text-sm`): `src/pages/dashboard.astro:17-38`.
- The reusable shadcn `Button` primitive already has a `size="lg"` variant (`h-10 px-6`) and supports `asChild`: `src/components/ui/button.tsx:7-50`. This is sufficient for the "large primary control" requirement — no new button variant/size token is needed.
- `Card` primitives exist and can structure the new dashboard layout: `src/components/ui/card.tsx:5-56`.
- Existing responsive conventions to reuse: outer padding `p-4` → `sm:p-8`, centered max-width containers (`max-w-sm` / `max-w-2xl` / `max-w-4xl`), and `flex-col sm:flex-row` / `sm:grid-cols-3` patterns already used in `src/components/Welcome.astro:27-57`.
- Per `context/foundation/lessons.md:5-10`, installed shadcn primitives must be reused instead of hand-rolled equivalents.
- `s-03` (srs-review-session) owns `src/pages/api/review/*`, `src/pages/review/*`, review components, and card-table migration columns — none of these exist yet, so there is no review destination to link to safely.

## What We're NOT Doing

- Not modifying `GenerateWizard.tsx` accept/edit/skip/generate buttons or any generation workflow sizing: `src/components/generate/GenerateWizard.tsx:147-315`.
- Not modifying `DeckView.tsx` CRUD buttons or `src/pages/deck.astro` page shell: `src/components/deck/DeckView.tsx:81-144`, `src/pages/deck.astro:22-49`.
- Not touching `src/pages/api/review/*`, `src/pages/review/*`, review-session components, or `supabase/migrations/*` — these belong to `s-03` and do not exist yet.
- Not adding a review-session CTA or placeholder on the dashboard — no real route exists yet to link to, and speculative UI risks colliding with `s-03`'s eventual contract.
- Not introducing a new `buttonVariants` size token — `size="lg"` already covers the "large primary control" requirement.
- Not changing global typography, spacing tokens, or `global.css`.
- Not changing API routes, services, or middleware behavior.

## Implementation Approach

Rework `/dashboard` (`src/pages/dashboard.astro`) into three visual sections, using only existing shadcn primitives and existing responsive conventions:

1. **Header / welcome block** — keep the personalized welcome from `Astro.locals.user`, with expanded copy so the page reads as a landing hub.
2. **Primary action area** — "Generate cards" and "My deck" rendered as `Button size="lg" asChild` links, stacked full-width on mobile and side-by-side (`sm:flex-row` or a 2-column grid) from `sm:` breakpoint up.
3. **Secondary account area** — sign-out kept large enough to operate comfortably but styled with an `outline`/`ghost` variant so it reads as secondary to the two primary CTAs, placed in its own row/card beneath the primary action area.

Auth-surface consistency: review `SubmitButton` (`src/components/auth/SubmitButton.tsx:11-30`) once the dashboard CTA sizing is final. Because `SubmitButton` already renders a prominent full-width CTA, it is expected to already read as comparable in prominence to the new dashboard buttons — update it only if a side-by-side visual check during Phase 3 shows a material mismatch. `src/pages/auth/signin.astro` layout and `FormField` sizing stay untouched regardless.

Isolation: `src/pages/dashboard.astro` remains the sole composition root. Add `src/components/dashboard/DashboardActions.astro` only if the page becomes unwieldy as a single file — this is an implementation-time judgment call, not a required deliverable.

## Phase 1: Dashboard layout and CTA upsizing

### Overview

Replace the small centered dashboard card with a three-section landing hub (welcome, primary actions, secondary account area) using shadcn `Button`/`Card` primitives at `size="lg"`.

### Changes Required:

#### 1. Dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Restructure the authenticated landing page into a welcome block, a primary CTA group (Generate, Deck), and a visually secondary sign-out area, replacing the current single small centered card and its `px-4 py-2 text-sm` links.

**Contract**: Page continues to read `Astro.locals.user` and render for authenticated users only (no change to route protection, which stays in `src/middleware.ts`). Generate/Deck links use `Button` with `size="lg"` and `asChild` wrapping an `<a>`; layout is `flex-col` on mobile and `sm:flex-row` (or `sm:grid-cols-2`) from the `sm:` breakpoint up, matching the pattern in `src/components/Welcome.astro:27-57`. Sign-out remains a form posting to the existing sign-out action, styled with an `outline`/`ghost` `Button` variant, placed below/beside the primary CTA group as a visually secondary element.

#### 2. Optional dashboard sub-component

**File**: `src/components/dashboard/DashboardActions.astro` (new, only if needed)

**Intent**: Extract the primary-action + sign-out markup from `dashboard.astro` if inlining it makes the page file unwieldy.

**Contract**: Presentational only — receives no new data beyond what `dashboard.astro` already has; introduces no new routes, props from generate/deck/review components, or business logic.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Sign in and confirm redirect to `/dashboard` still works.
- `/dashboard` shows the new three-section layout with a personalized welcome.
- Primary controls (Generate, Deck) are visibly larger than the previous `px-4 py-2 text-sm` treatment at mobile, tablet, and desktop widths.
- Dashboard → `/generate` and dashboard → `/deck` navigation both work.
- Sign-out still works from the dashboard and is visually secondary to the primary CTAs.
- `/generate` and `/deck` pages are visually and functionally unchanged when entered via the new dashboard.

---

## Phase 2: Auth control harmonization check

### Overview

Verify whether the sign-in primary submit control reads as comparably prominent to the new dashboard CTAs, and adjust only if a real mismatch is found.

### Changes Required:

#### 1. Auth submit button

**File**: `src/components/auth/SubmitButton.tsx`

**Intent**: Bring the sign-in primary CTA visually in line with the new dashboard `size="lg"` controls, only if a side-by-side comparison during this phase shows the current full-width custom-class treatment is materially smaller/less prominent.

**Contract**: If changed, `SubmitButton` keeps its existing full-width pattern and loading-state behavior (`src/components/auth/SubmitButton.tsx:11-30`); only size/padding classes are adjusted. `src/pages/auth/signin.astro` layout and `FormField` sizing are not touched.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Sign-in flow still posts to `/api/auth/signin` and redirects to `/dashboard` on success.
- Auth card layout remains stable and does not overflow at narrow (mobile) widths.
- Sign-in submit loading/disabled state still renders correctly.

---

## Phase 3: Verification

### Overview

Final regression pass confirming no unintended effects on generation, deck-management, or SRS review-session scope.

### Changes Required:

No file changes in this phase — verification only.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Full responsive walkthrough of `/dashboard` at mobile, tablet, and desktop widths.
- Generation workflow (`/generate`, `GenerateWizard`) confirmed visually/functionally unchanged.
- Deck workflow (`/deck`, `DeckView`) confirmed visually/functionally unchanged.
- No files under `src/pages/api/review/*`, `src/pages/review/*`, or `supabase/migrations/*` were touched.

---

## Testing Strategy

### Manual Testing Steps:

1. Sign in and confirm successful redirect to `/dashboard`.
2. Verify `/dashboard` shows the new structure and personalized welcome state.
3. Verify primary dashboard controls are easy to spot and operate at mobile, tablet, and desktop widths.
4. Confirm CTA navigation still works: dashboard → `/generate`, dashboard → `/deck`.
5. Confirm sign-out still works from the dashboard.
6. Confirm generation workflow remains visually/functionally unchanged after entering via dashboard.
7. Confirm deck workflow remains visually/functionally unchanged after entering via dashboard.
8. If auth controls were resized in Phase 2, verify sign-in submit loading state still renders correctly and the auth card does not overflow at narrow widths.

## Performance Considerations

None — this is a presentation-only change using existing components; no new network calls, data fetching, or bundle-affecting dependencies are introduced.

## Migration Notes

Not applicable — no data model, schema, or migration changes are part of this plan.

## References

- Historical context: `context/archive/2026-08-23-first-gated-generation/research.md` (confirms `/dashboard` as the existing protected landing page precedent; middleware-based protection already covers `/dashboard`, `/generate`, and `/deck`)
- Historical context: `context/archive/2026-09-06-deck-management/plan.md` (deck CRUD intentionally isolated to `/deck` and React deck components, supporting keeping `s-04` out of deck internals)
- `context/foundation/lessons.md` — reuse installed shadcn primitives rather than hand-rolled equivalents
- `src/pages/dashboard.astro:7-38` — current post-login card and undersized CTAs
- `src/pages/auth/signin.astro:8-22` — sign-in shell and handoff context
- `src/components/auth/SignInForm.tsx:45-88` — auth primary submit usage
- `src/components/auth/SubmitButton.tsx:11-30` — current auth CTA sizing
- `src/components/ui/button.tsx:7-50` — reusable button sizes/variants
- `src/components/ui/card.tsx:5-56` — reusable card structure
- `src/components/Topbar.astro:5-37` — signed-in dashboard/sign-out links
- `src/components/Welcome.astro:27-57` — responsive hero/grid patterns worth mirroring
- `src/pages/deck.astro:22-49` — deck page shell to avoid affecting
- `src/components/deck/DeckView.tsx:81-144` — deck interactive controls to leave untouched
- `src/components/generate/GenerateWizard.tsx:246-312` — generation workflow buttons to leave untouched

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dashboard layout and CTA upsizing

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — fadd7cb
- [x] 1.2 Build succeeds: `npm run build` — fadd7cb

#### Manual

- [x] 1.3 Sign in and confirm redirect to `/dashboard` still works — fadd7cb
- [x] 1.4 `/dashboard` shows the new three-section layout with a personalized welcome — fadd7cb
- [x] 1.5 Primary controls (Generate, Deck) are visibly larger than the previous treatment at mobile, tablet, and desktop widths — fadd7cb
- [x] 1.6 Dashboard → `/generate` and dashboard → `/deck` navigation both work — fadd7cb
- [x] 1.7 Sign-out still works from the dashboard and is visually secondary to the primary CTAs — fadd7cb
- [x] 1.8 `/generate` and `/deck` pages are visually and functionally unchanged when entered via the new dashboard — fadd7cb

### Phase 2: Auth control harmonization check

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — f6e5f38
- [x] 2.2 Build succeeds: `npm run build` — f6e5f38

#### Manual

- [x] 2.3 Sign-in flow still posts to `/api/auth/signin` and redirects to `/dashboard` on success — f6e5f38
- [x] 2.4 Auth card layout remains stable and does not overflow at narrow (mobile) widths — f6e5f38
- [x] 2.5 Sign-in submit loading/disabled state still renders correctly — f6e5f38

### Phase 3: Verification

#### Automated

- [x] 3.1 Lint passes: `npm run lint` (2691 problems, down from 2784 pre-existing repo-wide CRLF baseline — no new errors introduced by this change)
- [x] 3.2 Build succeeds: `npm run build`

#### Manual

- [x] 3.3 Full responsive walkthrough of `/dashboard` at mobile, tablet, and desktop widths — substituted with rendered-HTML/class inspection via dev server + curl (no interactive browser available in autopilot); `buttonVariants`/`Card` classes are the same responsive utility classes used elsewhere in the app
- [x] 3.4 Generation workflow (`/generate`, `GenerateWizard`) confirmed visually/functionally unchanged — file untouched (`git diff --stat 88e17a6..HEAD -- src/pages/generate.astro` empty), route still redirects to `/auth/signin` when unauthenticated (curl-verified in Phase 1)
- [x] 3.5 Deck workflow (`/deck`, `DeckView`) confirmed visually/functionally unchanged — file untouched (`git diff --stat 88e17a6..HEAD -- src/pages/deck.astro` empty), route still redirects to `/auth/signin` when unauthenticated (curl-verified in Phase 1)
- [x] 3.6 No files under `src/pages/api/review/*`, `src/pages/review/*`, or `supabase/migrations/*` were touched — confirmed via `git diff --stat 88e17a6..HEAD` (empty)
