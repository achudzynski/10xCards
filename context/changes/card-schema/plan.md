# Card Schema (F-01) Implementation Plan

## Overview

Create the `cards` database foundation: a Supabase migration that defines the `cards` table with per-user RLS policies, and a `Card` TypeScript domain type in `src/types.ts`. No service layer is included — CRUD helpers are added incrementally in S-01 and S-02 as each slice needs them. This is the first migration in the project.

## Current State Analysis

- Supabase CLI is initialised (`supabase/config.toml`, project ID: `10xcards`) but `supabase/migrations/` is empty — this plan creates the first migration file.
- `src/lib/supabase.ts` — SSR client factory is ready; every API route and page uses `createClient(request.headers, context.cookies)`.
- `src/middleware.ts:10` — `context.locals.user` is resolved on every request; `user.id` (UUID) is the identity RLS will enforce.
- `src/types.ts` — does not exist yet; must be created.
- `src/lib/services/` — does not exist yet; not needed for this change.
- No existing card-related code anywhere in `src/`.

## Desired End State

After this plan completes:
- A timestamped migration file exists at `supabase/migrations/<timestamp>_create_cards.sql`.
- Running `supabase db push` applies the migration to the hosted Supabase project without error.
- The `cards` table exists in the `public` schema with RLS enabled and four per-operation policies that scope every row to `auth.uid() = user_id`.
- `src/types.ts` exists with the `Card` domain type matching the table columns.
- Future API routes can import `Card` from `@/types` and call `supabase.from("cards")` against the typed table.

### Key Discoveries:

- `auth.users` is managed by Supabase Auth; the `user_id` FK must reference `auth.users(id)` with `ON DELETE CASCADE` so card rows are automatically cleaned up if an account is deleted.
- `updated_at` must be kept in sync via a PostgreSQL trigger — Supabase does not auto-update timestamp columns.
- The roadmap explicitly defers SRS scheduling columns (OQ-3) to S-03; they must NOT appear in this migration.
- `is_ai_generated` is a boolean flag (not an enum) per the planning decision; default `false` so manual cards need no explicit value.

## What We're NOT Doing

- No service layer (`src/lib/services/cards.ts`) — added per-slice in S-01/S-02.
- No card API routes (`src/pages/api/cards/`) — those belong to S-01 and S-02.
- No SRS / scheduling columns (`next_review_at`, `stability`, etc.) — deferred to S-03.
- No soft-delete (`deleted_at`) — hard DELETE is the chosen approach.
- No separate `CardRow` DB type — a single `Card` domain type is sufficient for MVP.
- No seed data.

## Implementation Approach

Two-step, bottom-up: database first, then TypeScript. The migration is self-contained SQL that can be reviewed and rolled back independently of the TypeScript layer. The `Card` type is derived from the migration schema — written after the migration is finalised so there is one source of truth.

## Critical Implementation Details

**RLS must be enabled before policies are added.** `ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY` must appear in the migration before any `CREATE POLICY` statement — PostgreSQL silently allows policy creation on tables without RLS enabled, but the policies won't be enforced until RLS is on. Putting them in the same migration file, in order, is the safest approach.

---

## Phase 1: Database Migration

### Overview

Write and apply a single SQL migration file that creates the `cards` table, enables RLS, creates four per-operation policies, and installs the `updated_at` auto-update trigger.

### Changes Required:

#### 1. Migration file

**File**: `supabase/migrations/20260815000000_create_cards.sql`

**Intent**: Create the `cards` table with all columns needed by S-01, S-02, and (structurally) S-03, enable RLS, and add per-operation policies that enforce per-user data isolation. This is the first migration in the project.

**Contract**: The migration must define the following in order:
1. A helper trigger function `set_updated_at()` that sets `NEW.updated_at = now()`.
2. `CREATE TABLE public.cards` with columns: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `front TEXT NOT NULL`, `back TEXT NOT NULL`, `is_ai_generated BOOLEAN NOT NULL DEFAULT false`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
3. `ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY`.
4. Four `CREATE POLICY` statements — one each for SELECT, INSERT, UPDATE, DELETE — all gated on `auth.uid() = user_id`. INSERT uses `WITH CHECK`; SELECT and DELETE use `USING`; UPDATE uses both.
5. `CREATE TRIGGER` that fires `BEFORE UPDATE ON public.cards` and executes `set_updated_at()`.

### Success Criteria:

#### Automated Verification:

- Migration file exists at `supabase/migrations/20260815000000_create_cards.sql`
- `supabase db push` exits with code 0 (no SQL errors)
- `npm run lint` passes (no TypeScript changes yet, but must not regress)

#### Manual Verification:

- Supabase Dashboard → Table Editor shows `cards` table with all expected columns and correct types
- Supabase Dashboard → Authentication → Policies shows four policies on `cards`, one per operation
- Signed in as two different test users: inserting a card as user A, then querying as user B returns 0 rows (RLS isolation confirmed)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the table and policies are correct in the Supabase Dashboard before proceeding.

---

## Phase 2: TypeScript Types

### Overview

Create `src/types.ts` with the `Card` domain type that mirrors the `cards` table columns. This is the shared type contract that S-01, S-02, and S-03 will import.

### Changes Required:

#### 1. Shared types file

**File**: `src/types.ts`

**Intent**: Define the `Card` domain type so all future API routes, service functions, and UI components share a single, versioned type contract for card data. Creating the file now (even with only one type) avoids the later friction of finding the right place to put it.

**Contract**: Export a `Card` interface with fields: `id: string`, `userId: string`, `front: string`, `back: string`, `isAiGenerated: boolean`, `createdAt: string`, `updatedAt: string`. Field names use camelCase (domain convention) even though the DB columns use snake_case — the mapping happens at the service layer when it is written.

### Success Criteria:

#### Automated Verification:

- `src/types.ts` exists and exports a `Card` interface
- `npm run lint` passes with the new file

#### Manual Verification:

- Importing `import type { Card } from "@/types"` in a scratch file resolves without error (quick IDE check)

---

## Testing Strategy

### Manual Testing Steps:

1. Run `supabase db push` and confirm exit code 0.
2. Open Supabase Dashboard → Table Editor, select `cards`, verify all columns and types match the migration.
3. Open Supabase Dashboard → Authentication → Policies, confirm four policies on `cards`.
4. Using two test accounts via the app's existing sign-in flow, verify that cards created by one user are not visible to the other (RLS isolation).
5. Confirm `npm run lint` exits 0 after both phases are complete.

## Migration Notes

This is the first migration in the project. The file name `20260815000000_create_cards.sql` uses the timestamp prefix required by the Supabase CLI (`supabase migration new` generates this format). Future migrations must use a later timestamp to ensure correct ordering.

To roll back: drop the table (`DROP TABLE public.cards CASCADE`) and remove the migration file, then re-push. No existing data is at risk since this is a greenfield table.

## References

- Roadmap: `context/foundation/roadmap.md` — F-01 item
- PRD refs: FR-004, FR-009, NFR (data privacy, session durability)
- Supabase RLS docs: https://supabase.com/docs/guides/database/row-level-security
- Auth client: `src/lib/supabase.ts`
- Middleware (user resolution): `src/middleware.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database Migration

#### Automated

- [x] 1.1 Migration file exists at `supabase/migrations/20260815000000_create_cards.sql`
- [x] 1.2 `supabase db push` exits with code 0
- [x] 1.3 `npm run lint` passes

#### Manual

- [x] 1.4 Supabase Dashboard shows `cards` table with all expected columns and types
- [x] 1.5 Supabase Dashboard shows four RLS policies on `cards`, one per operation
- [x] 1.6 RLS isolation confirmed: user A's cards not visible to user B

### Phase 2: TypeScript Types

#### Automated

- [ ] 2.1 `src/types.ts` exists and exports a `Card` interface
- [ ] 2.2 `npm run lint` passes with the new file

#### Manual

- [ ] 2.3 Importing `Card` from `@/types` resolves without error in IDE
