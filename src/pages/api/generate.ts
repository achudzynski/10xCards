import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { jsonError, jsonOk } from "@/lib/api";
import { generateCards, GenerationError } from "@/lib/services/generation";
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
    return jsonOk(response);
  } catch (error) {
    if (error instanceof GenerationError) {
      return jsonError("generation_failed", "Card generation failed. Please try again.", 502);
    }
    return jsonError("generation_failed", "Card generation failed. Please try again.", 502);
  }
};
