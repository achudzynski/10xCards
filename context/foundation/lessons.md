# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Use installed shadcn/ui primitives instead of hand-rolled markup

- **Context**: src/pages/deck.astro:45-49 — deck list rendered with raw `<li>`/`<div>` markup while the shadcn `Card` primitive was already installed in src/components/ui/card.tsx.
- **Problem**: A plan contract specified the shadcn `card` primitive, but the implementation used raw markup, drifting from the project convention that shadcn components live in src/components/ui/ and should be reused (not re-created) for consistent styling.
- **Rule**: When a shadcn/ui primitive exists for a UI element, use it — never hand-roll equivalent markup.
- **Applies to**: Astro pages and React components rendering card/input/label/button/textarea UI.
