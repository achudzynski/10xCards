import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CardAnswer,
  CurrentReviewSnapshotResponse,
  ReviewCard,
  ReviewResult,
  ReviewSession,
  StartReviewSessionResponse,
  SubmitReviewAnswerResponse,
} from "@/types";
import { computeNextSchedule } from "./sm2";

/** Thrown by review-session service functions; route handlers map `code`/`status` to the API error envelope. */
export class ReviewServiceError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface ReviewSessionRow {
  id: string;
  status: "active" | "completed";
  card_order: string[];
  current_index: number;
  answered_count: number;
  total_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface ReviewCardRow {
  id: string;
  front: string;
  back: string;
  due_date: string;
}

interface CardSRSRow extends ReviewCardRow {
  ease_factor: number;
  interval: number;
  repetitions: number;
}

interface CardSRSState {
  easeFactor: number;
  interval: number;
  repetitions: number;
}

function mapCardSRSRow(row: CardSRSRow): CardSRSState {
  return {
    easeFactor: row.ease_factor,
    interval: row.interval,
    repetitions: row.repetitions,
  };
}

const SESSION_COLUMNS =
  "id, status, card_order, current_index, answered_count, total_count, created_at, updated_at, completed_at";
const REVIEW_CARD_COLUMNS = "id, front, back, due_date";
const CARD_SRS_COLUMNS = "id, front, back, due_date, ease_factor, interval, repetitions";

function mapSessionRow(row: ReviewSessionRow): ReviewSession {
  return {
    id: row.id,
    status: row.status,
    currentIndex: row.current_index,
    answeredCount: row.answered_count,
    totalCount: row.total_count,
    cardOrder: row.card_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function mapReviewCardRow(row: ReviewCardRow): ReviewCard {
  return {
    id: row.id,
    front: row.front,
    back: row.back,
    dueDate: row.due_date,
  };
}

export async function getActiveReviewSession(supabase: SupabaseClient, userId: string): Promise<ReviewSession | null> {
  const { data, error } = await supabase
    .from("review_sessions")
    .select(SESSION_COLUMNS)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ? mapSessionRow(data) : null;
}

async function getReviewCardById(supabase: SupabaseClient, userId: string, cardId: string): Promise<ReviewCard | null> {
  const { data, error } = await supabase
    .from("cards")
    .select(REVIEW_CARD_COLUMNS)
    .eq("id", cardId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ? mapReviewCardRow(data) : null;
}

export async function startOrResumeReviewSession(
  supabase: SupabaseClient,
  userId: string,
): Promise<StartReviewSessionResponse> {
  const existing = await getActiveReviewSession(supabase, userId);
  if (existing) {
    const expectedCardId = existing.cardOrder[existing.currentIndex] ?? null;
    const currentCard = expectedCardId ? await getReviewCardById(supabase, userId, expectedCardId) : null;
    return { session: existing, currentCard, summary: { totalDue: existing.totalCount } };
  }

  const { data: dueRows, error: dueError } = await supabase
    .from("cards")
    .select(REVIEW_CARD_COLUMNS)
    .eq("user_id", userId)
    .lte("due_date", new Date().toISOString())
    .order("due_date", { ascending: true })
    .order("id", { ascending: true });

  if (dueError) {
    throw dueError;
  }

  const dueCards = (dueRows as ReviewCardRow[]).map(mapReviewCardRow);
  if (dueCards.length === 0) {
    return { session: null, currentCard: null, summary: { totalDue: 0 } };
  }

  const cardOrder = dueCards.map((card) => card.id);
  const { data: sessionRow, error: insertError } = await supabase
    .from("review_sessions")
    .insert({
      user_id: userId,
      status: "active",
      card_order: cardOrder,
      current_index: 0,
      answered_count: 0,
      total_count: cardOrder.length,
    })
    .select(SESSION_COLUMNS)
    .single();

  if (insertError) {
    throw insertError;
  }

  const session = mapSessionRow(sessionRow);
  return { session, currentCard: dueCards[0], summary: { totalDue: dueCards.length } };
}

export async function getCurrentReviewSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<CurrentReviewSnapshotResponse> {
  const session = await getActiveReviewSession(supabase, userId);
  if (!session) {
    return { session: null, currentCard: null };
  }

  const expectedCardId = session.cardOrder[session.currentIndex] ?? null;
  const currentCard = expectedCardId ? await getReviewCardById(supabase, userId, expectedCardId) : null;
  return { session, currentCard };
}

export async function submitReviewAnswer(
  supabase: SupabaseClient,
  userId: string,
  input: CardAnswer,
): Promise<SubmitReviewAnswerResponse> {
  const session = await getActiveReviewSession(supabase, userId);
  if (session?.id !== input.sessionId) {
    throw new ReviewServiceError("not_found", "Active review session not found", 404);
  }

  const expectedCardId = session.cardOrder[session.currentIndex];
  if (!expectedCardId || expectedCardId !== input.cardId) {
    throw new ReviewServiceError("session_state_invalid", "Submitted card is not the current queued card", 409);
  }

  const { data: cardRow, error: cardError } = await supabase
    .from("cards")
    .select(CARD_SRS_COLUMNS)
    .eq("id", input.cardId)
    .eq("user_id", userId)
    .maybeSingle();

  if (cardError) {
    throw cardError;
  }
  if (!cardRow) {
    throw new ReviewServiceError("not_found", "Card not found", 404);
  }

  const card = mapCardSRSRow(cardRow);
  const reviewedAt = new Date();
  const schedule = computeNextSchedule(card, input.rating, reviewedAt);

  const { error: cardUpdateError } = await supabase
    .from("cards")
    .update({
      ease_factor: schedule.nextEaseFactor,
      interval: schedule.nextInterval,
      repetitions: schedule.nextRepetitions,
      due_date: schedule.nextDueDate,
    })
    .eq("id", input.cardId)
    .eq("user_id", userId);

  if (cardUpdateError) {
    throw new ReviewServiceError("save_failed", "Failed to persist card schedule", 500);
  }

  const nextIndex = session.currentIndex + 1;
  const nextAnsweredCount = session.answeredCount + 1;
  const isComplete = nextIndex >= session.totalCount;

  const { data: updatedSessionRow, error: sessionUpdateError } = await supabase
    .from("review_sessions")
    .update({
      current_index: nextIndex,
      answered_count: nextAnsweredCount,
      status: isComplete ? "completed" : "active",
      completed_at: isComplete ? reviewedAt.toISOString() : null,
    })
    .eq("id", session.id)
    .eq("user_id", userId)
    .select(SESSION_COLUMNS)
    .single();

  if (sessionUpdateError) {
    throw new ReviewServiceError("save_failed", "Failed to persist session progress", 500);
  }

  const updatedSession = mapSessionRow(updatedSessionRow);
  const nextCardId = isComplete ? null : session.cardOrder[nextIndex];
  const nextCard = nextCardId ? await getReviewCardById(supabase, userId, nextCardId) : null;

  const result: ReviewResult = {
    cardId: input.cardId,
    rating: input.rating,
    previousEaseFactor: card.easeFactor,
    previousInterval: card.interval,
    previousRepetitions: card.repetitions,
    nextEaseFactor: schedule.nextEaseFactor,
    nextInterval: schedule.nextInterval,
    nextRepetitions: schedule.nextRepetitions,
    nextDueDate: schedule.nextDueDate,
  };

  return { session: updatedSession, result, nextCard };
}
