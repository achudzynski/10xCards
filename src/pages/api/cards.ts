import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { jsonError, jsonOk } from "@/lib/api";
import { createCard } from "@/lib/services/cards";

export const prerender = false;

const createCardSchema = z.object({
  front: z.string().trim().min(1).max(100),
  back: z.string().trim().min(1).max(100),
  isAiGenerated: z.boolean().optional().default(false),
});

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("unauthorized", "You must be signed in to save cards", 401);
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

  const parsed = createCardSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "invalid_input",
      "Front and back must each be between 1 and 100 characters",
      400,
      parsed.error.issues,
    );
  }

  try {
    const card = await createCard(supabase, context.locals.user.id, {
      front: parsed.data.front,
      back: parsed.data.back,
      isAiGenerated: parsed.data.isAiGenerated,
    });
    return jsonOk({ card }, 201);
  } catch {
    return jsonError("save_failed", "Could not save the card. Please try again.", 500);
  }
};
