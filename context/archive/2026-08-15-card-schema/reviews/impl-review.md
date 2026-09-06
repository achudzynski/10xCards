<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Card Schema (F-01)

- **Plan**: context/changes/card-schema/plan.md
- **Scope**: Phase 2 of 2 (full plan)
- **Date**: 2026-08-23
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — RLS policies omit `TO authenticated` role

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260815000000_create_cards.sql:33-56
- **Detail**: All four policies are created without a `TO` clause, so they apply to the default `public` role (which includes `anon`). The project hard rule (AGENTS.md) requires "per-operation, **per-role** policies". Functionally the `auth.uid() = user_id` predicate already blocks anonymous access (anon `auth.uid()` is NULL), so this is not exploitable — but it deviates from the mandated per-role convention and causes the policies to be evaluated for the `anon` role unnecessarily. Supabase's own linter/best-practice guidance recommends scoping policies with `TO authenticated`.
- **Fix**: Add `TO authenticated` to each of the four `CREATE POLICY` statements (e.g. `FOR SELECT TO authenticated USING (...)`).
- **Decision**: FIXED — corrective migration `20260823000000_harden_cards_rls.sql` sets all four policies `TO authenticated` via ALTER POLICY (2026-08-23)

### F2 — Trigger function has a mutable `search_path`

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260815000000_create_cards.sql:6-15
- **Detail**: `public.set_updated_at()` does not pin `search_path`. Supabase's database linter flags `function_search_path_mutable`. Risk is low here (the function is SECURITY INVOKER and only assigns `now()`), but pinning the path is the documented hardening default.
- **Fix**: Add `SET search_path = ''` (or `= pg_catalog`) to the function definition.
- **Decision**: SKIPPED — low risk, deferred (2026-08-23)

### F3 — No index on `user_id`

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260815000000_create_cards.sql:18-26
- **Detail**: Every RLS-gated query filters on `user_id`, and S-01/S-02 will list cards per user. Without an index, those queries are sequential scans. Negligible at MVP scale, but a `CREATE INDEX ON public.cards(user_id)` is cheap insurance and conventional for FK/RLS-filter columns.
- **Fix**: Add `CREATE INDEX cards_user_id_idx ON public.cards(user_id);` to the migration.
- **Decision**: FIXED — corrective migration `20260823000000_harden_cards_rls.sql` adds `cards_user_id_idx` (2026-08-23)
