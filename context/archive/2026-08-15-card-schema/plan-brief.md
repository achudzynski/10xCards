# Card Schema (F-01) — Plan Brief

> Full plan: `context/changes/card-schema/plan.md`

## What & Why

Create the `cards` table in Supabase and define the shared `Card` TypeScript type. This is the first migration in the project and the prerequisite for every other roadmap item — S-01 (AI generation), S-02 (deck management), and S-03 (SRS review) all need card rows to exist before they can function.

## Starting Point

Supabase CLI is initialised (`supabase/config.toml`) but no migrations exist and `src/types.ts` is absent. The SSR Supabase client and auth middleware are fully wired — the foundation for calling `supabase.from("cards")` is already in place, just missing the table and types.

## Desired End State

A `cards` table exists in the hosted Supabase project with RLS enabled, four per-operation policies that enforce strict per-user data isolation, and an `updated_at` auto-update trigger. `src/types.ts` exports a `Card` interface. Any future API route can import `Card` from `@/types` and query the table immediately.

## Key Decisions Made

| Decision           | Choice                              | Why (1 sentence)                                                                                                  |
| ------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Track card origin  | `is_ai_generated` boolean           | Distinguishes AI-generated from manually created cards; boolean is simpler than an enum for a binary distinction. |
| Gating flow state  | No status column in DB              | S-01's accept/edit/delete flow is transient — pending cards live in memory, not the database.                     |
| Deletion strategy  | Hard delete                         | PRD explicitly accepts history loss for MVP; avoids `deleted_at` filter complexity across every query.            |
| Service layer      | None in F-01                        | CRUD helpers added per-slice (S-01, S-02) to avoid premature abstraction.                                         |
| Error handling     | N/A for F-01                        | No service functions; error handling pattern decided per slice.                                                   |
| TypeScript types   | Single `Card` domain type           | One type is sufficient for MVP; DB/domain split added only when they diverge.                                     |
| Migration workflow | Migration file + `supabase db push` | File lives in git; applied to hosted Supabase via CLI.                                                            |

## Scope

**In scope:**

- `supabase/migrations/20260815000000_create_cards.sql` — table DDL, RLS enable, 4 policies, `updated_at` trigger
- `src/types.ts` — `Card` interface

**Out of scope:**

- Service layer (`src/lib/services/cards.ts`) — deferred to S-01/S-02
- Card API routes — deferred to S-01/S-02
- SRS scheduling columns — deferred to S-03
- Soft delete
- Seed data

## Architecture / Approach

Bottom-up: database migration first (single SQL file, self-contained, independently reviewable), then TypeScript types derived from the finalised schema. The `user_id` column references `auth.users(id)` with `ON DELETE CASCADE`; RLS policies use `auth.uid() = user_id` for all four operations. No application code changes are needed — the Supabase client already knows how to call the table once it exists.

## Phases at a Glance

| Phase                 | What it delivers                          | Key risk                                                                                          |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1. Database Migration | `cards` table + RLS + trigger in Supabase | RLS policies must be created after `ENABLE ROW LEVEL SECURITY` — order matters                    |
| 2. TypeScript Types   | `Card` interface in `src/types.ts`        | Field naming (camelCase in type vs snake_case in DB) must be documented for service layer authors |

**Prerequisites:** Supabase project linked (`supabase/.temp/linked-project.json` exists ✓); `SUPABASE_URL` and `SUPABASE_KEY` available in environment for `supabase db push`.
**Estimated effort:** ~1 session; both phases are mechanical once the schema is decided.

## Open Risks & Assumptions

- SRS columns (OQ-3) are intentionally absent — S-03 will `ALTER TABLE` to add them when needed. This is fine as long as S-03 authors know to write an additive migration, not a replacement.
- `updated_at` trigger function is created in the `public` schema; if a same-named function already exists from another migration added later, the order must be respected.

## Success Criteria (Summary)

- `supabase db push` applies cleanly with exit code 0
- Supabase Dashboard confirms table, columns, and 4 RLS policies are correct
- RLS isolation verified: user A's cards are not visible when queried as user B
