export interface Card {
  id: string;
  userId: string;
  front: string;
  back: string;
  isAiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedCard {
  front: string;
  back: string;
}

export interface GenerateRequest {
  text: string;
}

export interface GenerateResponse {
  cards: GeneratedCard[];
}

export interface CreateCardRequest {
  front: string;
  back: string;
  isAiGenerated?: boolean;
}

export interface UpdateCardRequest {
  front?: string;
  back?: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    context?: unknown;
  };
}

export interface CardWithSRS extends Card {
  easeFactor: number;
  interval: number;
  repetitions: number;
  dueDate: string;
}

export interface ReviewCard {
  id: string;
  front: string;
  back: string;
  dueDate: string;
}

export interface ReviewSession {
  id: string;
  status: "active" | "completed";
  currentIndex: number;
  answeredCount: number;
  totalCount: number;
  cardOrder: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type ReviewRating = 0 | 1 | 2 | 3 | 4 | 5;

export interface CardAnswer {
  sessionId: string;
  cardId: string;
  rating: ReviewRating;
}

export interface ReviewResult {
  cardId: string;
  rating: ReviewRating;
  previousEaseFactor: number;
  previousInterval: number;
  previousRepetitions: number;
  nextEaseFactor: number;
  nextInterval: number;
  nextRepetitions: number;
  nextDueDate: string;
}

export interface StartReviewSessionResponse {
  session: ReviewSession | null;
  currentCard: ReviewCard | null;
  summary: { totalDue: number };
}

export interface CurrentReviewSnapshotResponse {
  session: ReviewSession | null;
  currentCard: ReviewCard | null;
}

export interface SubmitReviewAnswerResponse {
  session: ReviewSession;
  result: ReviewResult;
  nextCard: ReviewCard | null;
}

// Test hook - this comment was added to trigger the PostToolUse hook
