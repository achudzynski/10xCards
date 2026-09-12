import { describe, it, expect } from "vitest";
import { calculateSimilarity, calculateAverageSimilarity } from "@/lib/services/similarity";
import type { GeneratedCard } from "@/types";

describe("similarity helper", () => {
  describe("calculateSimilarity", () => {
    it("should return 1.0 for identical cards", () => {
      const generated: GeneratedCard = { front: "What is 2+2?", back: "4" };
      const reference: GeneratedCard[] = [{ front: "What is 2+2?", back: "4" }];

      const score = calculateSimilarity(generated, reference);
      expect(score).toBe(1.0);
    });

    it("should return high score for very similar cards", () => {
      const generated: GeneratedCard = { front: "What is photosynthesis?", back: "Process converting light to energy" };
      const reference: GeneratedCard[] = [
        {
          front: "What is photosynthesis?",
          back: "Process by which plants convert light into chemical energy",
        },
      ];

      const score = calculateSimilarity(generated, reference);
      expect(score).toBeGreaterThan(0.7);
      expect(score).toBeLessThan(1.0);
    });

    it("should return lower score for dissimilar cards", () => {
      const generated: GeneratedCard = { front: "What color is the sky?", back: "Blue" };
      const reference: GeneratedCard[] = [
        { front: "What is photosynthesis?", back: "Process converting light to energy" },
      ];

      const score = calculateSimilarity(generated, reference);
      expect(score).toBeLessThan(0.5);
    });

    it("should return 0 for empty reference list", () => {
      const generated: GeneratedCard = { front: "Question", back: "Answer" };
      const reference: GeneratedCard[] = [];

      const score = calculateSimilarity(generated, reference);
      expect(score).toBe(0);
    });

    it("should handle empty generated fields", () => {
      const generated: GeneratedCard = { front: "", back: "" };
      const reference: GeneratedCard[] = [{ front: "", back: "" }];

      const score = calculateSimilarity(generated, reference);
      expect(score).toBe(1.0);
    });

    it("should be case-insensitive", () => {
      const generated1: GeneratedCard = { front: "WHAT IS A CELL?", back: "BASIC UNIT OF LIFE" };
      const generated2: GeneratedCard = { front: "what is a cell?", back: "basic unit of life" };
      const reference: GeneratedCard[] = [{ front: "What is a cell?", back: "Basic unit of life" }];

      const score1 = calculateSimilarity(generated1, reference);
      const score2 = calculateSimilarity(generated2, reference);
      expect(score1).toBeCloseTo(score2, 2);
    });

    it("should weight front (question) higher than back (answer)", () => {
      // Generated with matching front but different back
      const generated: GeneratedCard = {
        front: "What is photosynthesis?",
        back: "Something completely different",
      };
      const reference: GeneratedCard[] = [
        {
          front: "What is photosynthesis?",
          back: "Process by which plants convert light into chemical energy",
        },
      ];

      const score = calculateSimilarity(generated, reference);
      // Should be >0.5 because front matches perfectly (60% weight)
      expect(score).toBeGreaterThan(0.5);
    });

    it("should pick best match from multiple reference cards", () => {
      const generated: GeneratedCard = {
        front: "What is the capital of France?",
        back: "Paris",
      };
      const reference: GeneratedCard[] = [
        { front: "What is the capital of Germany?", back: "Berlin" },
        { front: "What is the capital of France?", back: "Paris" },
        { front: "What is the capital of Spain?", back: "Madrid" },
      ];

      const score = calculateSimilarity(generated, reference);
      expect(score).toBe(1.0); // Should match the second card perfectly
    });

    it("should handle very short strings", () => {
      const generated: GeneratedCard = { front: "Q", back: "A" };
      const reference: GeneratedCard[] = [{ front: "Q", back: "A" }];

      const score = calculateSimilarity(generated, reference);
      expect(score).toBe(1.0);
    });

    it("should handle single character difference", () => {
      const generated: GeneratedCard = { front: "What is 2+3?", back: "5" };
      const reference: GeneratedCard[] = [{ front: "What is 2+2?", back: "4" }];

      const score = calculateSimilarity(generated, reference);
      expect(score).toBeGreaterThan(0.5);
    });
  });

  describe("calculateAverageSimilarity", () => {
    it("should return average of multiple cards", () => {
      const generated: GeneratedCard[] = [
        { front: "What is 2+2?", back: "4" },
        { front: "What is 2+3?", back: "5" },
      ];
      const reference: GeneratedCard[] = [
        { front: "What is 2+2?", back: "4" },
        { front: "What is 2+3?", back: "5" },
      ];

      const avg = calculateAverageSimilarity(generated, reference);
      expect(avg).toBe(1.0);
    });

    it("should return 0 for empty generated list", () => {
      const generated: GeneratedCard[] = [];
      const reference: GeneratedCard[] = [{ front: "Q", back: "A" }];

      const avg = calculateAverageSimilarity(generated, reference);
      expect(avg).toBe(0);
    });

    it("should handle mixed similarity scores", () => {
      const generated: GeneratedCard[] = [
        { front: "What is 2+2?", back: "4" }, // Perfect match
        { front: "What color is the sky?", back: "Blue" }, // No match
      ];
      const reference: GeneratedCard[] = [{ front: "What is 2+2?", back: "4" }];

      const avg = calculateAverageSimilarity(generated, reference);
      // One perfect match + one partial/no match averages to ~0.6 range
      expect(avg).toBeCloseTo(0.62, 1);
    });

    it("should prefer higher scoring cards within reference list", () => {
      const generated: GeneratedCard[] = [{ front: "What is photosynthesis?", back: "Energy conversion process" }];
      const reference: GeneratedCard[] = [
        { front: "Completely different question", back: "Unrelated answer" },
        {
          front: "What is photosynthesis?",
          back: "Process by which plants convert light into chemical energy",
        },
      ];

      const avg = calculateAverageSimilarity(generated, reference);
      // Should be high because it picks the best match from reference
      expect(avg).toBeGreaterThan(0.68);
    });
  });
});
