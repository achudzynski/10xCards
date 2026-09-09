import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { jsonError, jsonOk } from "@/lib/api";
import { ReviewServiceError, submitReviewAnswer } from "@/lib/services/review/session";

export const prerender = false;

const answerSchema = z.object({
  sessionId: z.uuid(),
  cardId: z.uuid(),
  rating: z.number().int().min(0).max(5),
});

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("unauthorized", "You must be signed in to submit a review answer", 401);
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

  const parsed = answerSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "invalid_input",
      "sessionId and cardId must be UUIDs and rating must be an integer between 0 and 5",
      400,
      parsed.error.issues,
    );
  }

  try {
    const result = await submitReviewAnswer(supabase, context.locals.user.id, {
      sessionId: parsed.data.sessionId,
      cardId: parsed.data.cardId,
      rating: parsed.data.rating as 0 | 1 | 2 | 3 | 4 | 5,
    });
    return jsonOk(result, 200);
  } catch (err) {
    if (err instanceof ReviewServiceError) {
      return jsonError(err.code, err.message, err.status);
    }
    return jsonError("save_failed", "Could not submit the review answer. Please try again.", 500);
  }
};
