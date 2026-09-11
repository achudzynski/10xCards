-- Migration: add_srs_fields_and_review_sessions
-- S-03 (srs-review-session): adds SM-2 scheduling columns to cards and a
-- durable review_sessions table so session progress survives refresh/close.

-- 1. SRS columns on cards (all existing cards become immediately due)
ALTER TABLE public.cards
  ADD COLUMN ease_factor NUMERIC(4,2) NOT NULL DEFAULT 2.50,
  ADD COLUMN interval    INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN repetitions INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN due_date    TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Index due-card lookups (filter by owner + due date on every session start)
CREATE INDEX IF NOT EXISTS cards_user_due_date_idx ON public.cards(user_id, due_date);

-- 3. Durable review session table
CREATE TABLE public.review_sessions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status         TEXT        NOT NULL CHECK (status IN ('active', 'completed')),
  card_order     JSONB       NOT NULL,
  current_index  INTEGER     NOT NULL DEFAULT 0,
  answered_count INTEGER     NOT NULL DEFAULT 0,
  total_count    INTEGER     NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ NULL
);

-- 4. Enable RLS (must come before policies)
ALTER TABLE public.review_sessions ENABLE ROW LEVEL SECURITY;

-- 5. Per-operation RLS policies, scoped to the authenticated role and owner
CREATE POLICY "review_sessions: select own"
  ON public.review_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "review_sessions: insert own"
  ON public.review_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "review_sessions: update own"
  ON public.review_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. At most one active session per user
CREATE UNIQUE INDEX review_sessions_one_active_per_user_idx
  ON public.review_sessions(user_id)
  WHERE status = 'active';

-- 7. Lookup index for status queries
CREATE INDEX IF NOT EXISTS review_sessions_user_status_idx ON public.review_sessions(user_id, status);

-- 8. Reuse the existing updated_at trigger function
CREATE TRIGGER review_sessions_set_updated_at
  BEFORE UPDATE ON public.review_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
