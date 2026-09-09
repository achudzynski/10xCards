# UI Improvements (S-04) Implementation Plan

## Executive Summary

Improve the authenticated landing experience by turning `/dashboard` from a small centered status card into a clear post-login hub with larger, easier-to-discover primary controls. Keep the change isolated to dashboard and auth-surface controls, preserve the current responsive layout patterns, and avoid touching generation, deck-management, or SRS review-session logic.

The codebase already lands authenticated users on `/dashboard`, uses Astro SSR shells with Tailwind utility classes, and has both raw anchor/button markup and reusable shadcn `Button`/`Card` primitives available. The implementation should reuse those primitives where possible, define a “large primary control” treatment only for dashboard/auth entry controls, and leave generation/deck/review interaction components unchanged.

## Research-Backed Current State

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

## Technical Approach

### 1. Dashboard structure

Rework `/dashboard` into a clearer landing page that still uses Astro SSR and remains visually aligned with the cosmic authenticated surfaces already used elsewhere.

Planned structure:

1. **Header / welcome block**
   - Keep personalized welcome using `Astro.locals.user`.
   - Expand descriptive copy so the page reads like a landing hub, not an auth placeholder.

2. **Primary action area**
   - Promote the two live destinations already in scope:
     - Generate cards
     - My deck
   - Present them as large, highly discoverable CTAs with enough tap/click area.
   - Use a stacked mobile layout and side-by-side layout at larger breakpoints.

3. **Secondary account area**
   - Keep sign-out visible, but visually secondary to task-starting actions.
   - Consider including a lightweight “account/actions” card or footer row rather than mixing sign-out with primary task CTAs.

4. **Review area placeholder strategy**
   - Because `s-03` owns review-session UI/routes, do not add SRS-specific workflow logic here.
   - If roadmap alignment requires dashboard acknowledgment of review, limit this to a non-functional placeholder/info block only if a real target already exists by implementation time; otherwise omit it to avoid overlap.

### 2. Control sizing

Define “primary controls” narrowly so the change improves discoverability without globally resizing workflow buttons.

Primary controls in scope:

- dashboard CTA to `/generate`
- dashboard CTA to `/deck`
- dashboard sign-out control
- sign-in primary submit button and auth entry links only if needed for consistency in the post-login/auth handoff
- topbar auth links only if discoverability review shows they are materially too small; otherwise leave topbar untouched to minimize surface area

Controls explicitly out of scope:

- `GenerateWizard` accept/edit/skip/generate buttons
- deck CRUD buttons in `DeckView`
- dialog buttons
- any future review-session controls

Implementation strategy:

- Prefer using `Button` with `size="lg"` and `asChild` for dashboard navigation links, rather than repeating raw anchor class strings.
- If `size="lg"` is still not prominent enough, add a dashboard-local class override or extend `buttonVariants` with a new size token only if it can remain semantically scoped and won’t force downstream consumers to change.
- Keep sign-out visibly large enough for usability, but stylistically secondary (outline/ghost or subdued filled treatment).
- Preserve existing layout integrity by increasing control height/padding before increasing text size too aggressively.

### 3. Responsive strategy

Use existing project patterns instead of inventing a new breakpoint system.

- **Mobile**
  - Single-column layout
  - Full-width or near-full-width primary controls
  - Generous vertical spacing between sections
- **Tablet**
  - Promote CTAs into a 2-column grid or `sm:flex-row` arrangement if widths remain comfortable
  - Maintain readable spacing around welcome text and action cards
- **Desktop**
  - Keep content centered within a moderate max width (`max-w-2xl` to `max-w-4xl`, to be chosen during implementation based on visual fit)
  - Use grid/card presentation for primary actions rather than stretching a narrow centered card

Guardrails:

- Do not reduce current minimum page padding (`p-4`) on small screens.
- Avoid fixed heights that could clip longer labels or future copy.
- Avoid global typography or spacing changes in `global.css`.

### 4. Shared components and isolation strategy

Keep the implementation isolated to dashboard/auth surfaces and avoid refactoring business-flow components.

Preferred component boundaries:

- `src/pages/dashboard.astro` remains the composition root.
- Optionally add a small presentational component such as `src/components/dashboard/DashboardActions.astro` or `...tsx` only if the page becomes unwieldy; do not refactor generate/deck/review components into it.
- Reuse:
  - `Button` from `src/components/ui/button.tsx`
  - `Card` primitives from `src/components/ui/card.tsx`
  - existing cosmic utility/background patterns from current pages

Do **not**:

- modify `GenerateWizard.tsx` for shared sizing
- modify `DeckView.tsx` sizing rules
- change API routes, services, migrations, or middleware behavior
- introduce review-session-specific routes or controls from `s-03`

### 5. Auth surface consistency

The outcome mentions dashboard and authentication controls. Because sign-in already redirects to `/dashboard`, the auth surface should only be adjusted where it directly affects discoverability/operability of the handoff.

Likely scope:

- Keep `src/pages/auth/signin.astro` layout intact.
- Update `SubmitButton` sizing only if it is materially smaller than the new dashboard primary CTAs, while preserving the existing full-width pattern.
- Leave field sizing alone unless button changes create visual imbalance.
- Consider matching sign-up/sign-in text links’ spacing/visibility without redesigning the auth page.

## Files Expected to Change

### Primary touch targets

- `src/pages/dashboard.astro` — main layout and CTA restructuring
- `src/components/ui/button.tsx` — only if a new reusable large button size/token is required
- `src/components/auth/SubmitButton.tsx` — only if auth primary CTA should be brought into the same sizing treatment

### Possible helper/component additions

- `src/components/dashboard/*` — only if extracting presentational dashboard sections improves clarity without widening scope

### Files expected **not** to change

- `src/pages/generate.astro`
- `src/components/generate/GenerateWizard.tsx`
- `src/pages/deck.astro`
- `src/components/deck/*`
- `src/pages/api/review/*`
- `src/pages/review/*`
- review-session components
- `supabase/migrations/*`

## Overlap / Conflict Check with s-03 (srs-review-session)

Known `s-03` areas:

- `src/pages/api/review/*`
- `src/pages/review/*`
- review session components
- card table migrations

Conflict assessment:

- **No direct overlap** if `s-04` stays limited to dashboard/auth presentation.
- Potential soft overlap only if `/dashboard` adds a CTA to a future review page; this should be handled as a plain link only after confirming the route exists, not by building any review UI here.
- Avoid touching shared card data structures, migrations, and review-page components to preserve parallel work.

## Phase Breakdown

### Phase 1 — Confirm dashboard IA and visual scope

Deliverables:

- Final dashboard content map:
  - welcome block
  - primary CTA group
  - secondary account/sign-out area
- decision on whether auth submit sizing changes are included
- decision on whether `Button` variant extension is necessary or page-local classes suffice

Success criteria:

- Scope remains isolated to dashboard/auth controls
- No dependency introduced on review-session work

### Phase 2 — Implement dashboard layout and CTA upsizing

Deliverables:

- Replace the small centered dashboard card with a clearer dashboard composition
- Convert dashboard action links to larger controls using shared primitives where feasible
- Make sign-out easier to discover and operate without competing with the main task CTAs

Success criteria:

- `/dashboard` still SSR-renders correctly for authenticated users
- primary controls are visibly larger than current `px-4 py-2 text-sm` treatment
- layout remains usable from mobile through desktop

### Phase 3 — Optional auth control harmonization

Deliverables:

- Update `SubmitButton` and/or auth page control spacing only if needed for consistency with the new dashboard treatment

Success criteria:

- sign-in flow still posts to `/api/auth/signin`
- auth card layout remains stable at small widths
- no regression to validation/loading states in `SignInForm`

### Phase 4 — Verification

Deliverables:

- targeted lint/build validation
- manual responsive walkthrough
- regression check on dashboard → generate/deck navigation

Success criteria:

- lint passes
- build passes
- manual checks confirm no unintended workflow regressions

## Testing Focus

### Automated validation

Run the smallest existing checks that cover the touched UI:

- `npm run lint`
- `npm run build`

Rationale:

- There is no dedicated test runner in the repo.
- Build validation is important because Astro SSR pages and component imports can fail at compile time even for visual-only changes.

### Manual verification checklist

1. Sign in and confirm successful redirect to `/dashboard`.
2. Verify `/dashboard` shows the new structure and personalized welcome state.
3. Verify primary dashboard controls are easy to spot and operate on:
   - mobile width
   - tablet width
   - desktop width
4. Confirm CTA navigation still works:
   - dashboard → `/generate`
   - dashboard → `/deck`
5. Confirm sign-out still works from the dashboard.
6. Confirm generation workflow remains visually/functionally unchanged after entering via dashboard.
7. Confirm deck workflow remains visually/functionally unchanged after entering via dashboard.
8. If auth controls were resized, verify:
   - sign-in submit loading state still renders correctly
   - auth card does not overflow at narrow widths

## Success Criteria

- After sign-in, users land on a dashboard that reads as a real landing hub rather than a placeholder status card.
- Dashboard primary actions are materially larger and easier to discover/activate than the current small buttons.
- Responsive behavior is preserved across mobile, tablet, and desktop.
- No unintended UI or behavior changes occur in generation or deck-management workflows.
- No `s-03` review-session codepaths, routes, or migrations are touched.
- Lint and build succeed.

## Risks & Unknowns

### Risks

1. **Visual regression on small screens**
   - Larger controls may wrap or crowd the glass-card layout if the dashboard remains too narrow.
   - Mitigation: widen the dashboard container and use stacked mobile layout first.

2. **Shared button regression**
   - Extending `buttonVariants` could unintentionally affect deck/generation surfaces if existing sizes are altered instead of extended.
   - Mitigation: add new size tokens or page-local overrides; never change existing `default`/`sm`/`lg` semantics in place.

3. **Inconsistent auth/dashboard affordances**
   - If dashboard controls are enlarged but sign-in submit remains comparatively small, the end-to-end experience may feel uneven.
   - Mitigation: explicitly review auth submit during implementation and harmonize only if justified.

4. **Accidental scope creep into review workflow**
   - Adding a “review” CTA could drift into `s-03` if the route/component contract is not yet settled.
   - Mitigation: keep `s-04` limited to dashboard shell and generic control sizing; no SRS-specific UI construction.

### Unknowns

1. Whether `Button size="lg"` is sufficient or a dashboard-specific larger treatment is needed.
2. Whether sign-out should remain a standalone form button or move into a secondary card/action row for better hierarchy.
3. Whether a review destination exists by implementation time and can be safely linked without colliding with `s-03`.

## Historical Context

- `context/archive/2026-08-23-first-gated-generation/research.md` confirms:
  - `/dashboard` is the existing protected landing page precedent
  - middleware-based protection already covers `/dashboard`, `/generate`, and `/deck`
- `context/archive/2026-09-06-deck-management/plan.md` shows deck CRUD was intentionally isolated to `/deck` and React deck components, supporting the decision to keep `s-04` out of deck internals.
- `context/foundation/lessons.md` reinforces reuse of installed shadcn primitives rather than hand-rolled equivalent UI.

## Key Code References

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
