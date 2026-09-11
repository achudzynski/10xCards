import type { ReviewRating } from "@/types";

export interface SM2State {
  easeFactor: number;
  interval: number;
  repetitions: number;
}

export interface SM2Result {
  nextEaseFactor: number;
  nextInterval: number;
  nextRepetitions: number;
  nextDueDate: string;
}

const MIN_EASE_FACTOR = 1.3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Pure SM-2 scheduling function. No persistence, no I/O — deterministic
 * mapping from the current SRS state + a 0-5 rating to the next state.
 */
export function computeNextSchedule(current: SM2State, rating: ReviewRating, reviewedAt: Date): SM2Result {
  const nextEaseFactor = Math.max(
    MIN_EASE_FACTOR,
    current.easeFactor + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02)),
  );

  if (rating < 3) {
    return {
      nextEaseFactor,
      nextInterval: 1,
      nextRepetitions: 0,
      nextDueDate: new Date(reviewedAt.getTime() + MS_PER_DAY).toISOString(),
    };
  }

  const nextRepetitions = current.repetitions + 1;
  let nextInterval: number;
  if (current.repetitions === 0) {
    nextInterval = 1;
  } else if (current.repetitions === 1) {
    nextInterval = 6;
  } else {
    nextInterval = Math.round(current.interval * current.easeFactor);
  }

  return {
    nextEaseFactor,
    nextInterval,
    nextRepetitions,
    nextDueDate: new Date(reviewedAt.getTime() + nextInterval * MS_PER_DAY).toISOString(),
  };
}
