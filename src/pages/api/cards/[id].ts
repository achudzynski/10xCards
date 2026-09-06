import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { jsonError, jsonOk } from "@/lib/api";
import { updateCard, deleteCard } from "@/lib/services/cards";

export const prerender = false;

const idSchema = z.uuid();

const updateCardSchema = z
  .object({
    front: z.string().trim().min(1).max(100).optional(),
    back: z.string().trim().min(1).max(100).optional(),
  })
  .refine((v) => v.front !== undefined || v.back !== undefined, {
    message: "At least one of front or back must be provided",
  });

export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("unauthorized", "You must be signed in to update cards", 401);
  }

  const parsedId = idSchema.safeParse(context.params.id);
  if (!parsedId.success) {
    return jsonError("invalid_input", "Card id must be a valid UUID", 400);
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

  const parsed = updateCardSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "invalid_input",
      "Front and back must each be between 1 and 100 characters, and at least one must be provided",
      400,
      parsed.error.issues,
    );
  }

  try {
    const card = await updateCard(supabase, context.locals.user.id, parsedId.data, parsed.data);
    if (!card) {
      return jsonError("not_found", "Card not found", 404);
    }
    return jsonOk({ card }, 200);
  } catch {
    return jsonError("save_failed", "Could not update the card. Please try again.", 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("unauthorized", "You must be signed in to delete cards", 401);
  }

  const parsedId = idSchema.safeParse(context.params.id);
  if (!parsedId.success) {
    return jsonError("invalid_input", "Card id must be a valid UUID", 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("server_misconfigured", "Supabase is not configured", 500);
  }

  try {
    const deleted = await deleteCard(supabase, context.locals.user.id, parsedId.data);
    if (!deleted) {
      return jsonError("not_found", "Card not found", 404);
    }
    return jsonOk({ success: true }, 200);
  } catch {
    return jsonError("delete_failed", "Could not delete the card. Please try again.", 500);
  }
};
