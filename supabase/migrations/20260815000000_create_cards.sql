-- Migration: create_cards
-- Creates the cards table with RLS policies and updated_at trigger.
-- This is the first migration in the project (F-01).

-- 1. Trigger function: keeps updated_at in sync on every UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2. Cards table
CREATE TABLE public.cards (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  front           TEXT        NOT NULL,
  back            TEXT        NOT NULL,
  is_ai_generated BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Enable RLS (must come before policies)
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

-- 4. Per-operation RLS policies — all scoped to the authenticated user
CREATE POLICY "cards: select own"
  ON public.cards
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "cards: insert own"
  ON public.cards
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cards: update own"
  ON public.cards
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cards: delete own"
  ON public.cards
  FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Trigger: fire set_updated_at() before every UPDATE
CREATE TRIGGER cards_set_updated_at
  BEFORE UPDATE ON public.cards
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
