import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { jsonError, jsonOk } from "@/lib/api";
import { generateCards, GenerationError } from "@/lib/services/generation";
import { calculateAverageSimilarity } from "@/lib/services/similarity";
import referenceVectors from "@/lib/reference-vectors.json";
import type { GenerateResponse } from "@/types";

export const prerender = false;

const generateSchema = z.object({
  text: z.string().trim().min(1).max(5000),
});

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("unauthorized", "You must be signed in to generate cards", 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("server_misconfigured", "Supabase is not configured", 500);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError("invalid_input", "Request body must be valid JSON", 400);
  }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("invalid_input", "Text must be between 1 and 5,000 characters", 400, parsed.error.issues);
  }

  try {
    const cards = await generateCards(parsed.data.text);
    const response: GenerateResponse = { cards };

    // Semantic logging: calculate similarity against reference vectors (advisory, non-blocking)
    if (cards.length > 0 && referenceVectors.length > 0) {
      // Pool all reference cards from all vectors for semantic comparison
      const allReferenceCards = referenceVectors.flatMap((v) => v.expected_cards);
      const avgSimilarity = calculateAverageSimilarity(cards, allReferenceCards);

      // Log event for monitoring (informational; does not affect HTTP response)
      console.info(
        JSON.stringify({
          event: "cards_generated",
          card_count: cards.length,
          avg_similarity_score: parseFloat(avgSimilarity.toFixed(2)),
          source_length: parsed.data.text.length,
          timestamp: new Date().toISOString(),
        }),
      );
    }

    return jsonOk(response);
  } catch (error) {
    if (error instanceof GenerationError) {
      return jsonError("generation_failed", "Card generation failed. Please try again.", 502);
    }
    return jsonError("generation_failed", "Card generation failed. Please try again.", 502);
  }
};
