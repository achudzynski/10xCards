-- Migration: harden_cards_rls
-- Corrective follow-up to 20260815000000_create_cards.sql (impl-review F1, F3).
-- 1. Scope the four cards policies to the `authenticated` role (per-role rule).
-- 2. Add an index on user_id (RLS/filter column).

-- 1. Restrict policies to authenticated role
ALTER POLICY "cards: select own" ON public.cards TO authenticated;
ALTER POLICY "cards: insert own" ON public.cards TO authenticated;
ALTER POLICY "cards: update own" ON public.cards TO authenticated;
ALTER POLICY "cards: delete own" ON public.cards TO authenticated;

-- 2. Index the RLS/filter column
CREATE INDEX IF NOT EXISTS cards_user_id_idx ON public.cards(user_id);
