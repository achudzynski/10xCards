import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { jsonError, jsonOk } from "@/lib/api";
import { startOrResumeReviewSession } from "@/lib/services/review/session";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("unauthorized", "You must be signed in to start a review session", 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("server_misconfigured", "Supabase is not configured", 500);
  }

  try {
    const result = await startOrResumeReviewSession(supabase, context.locals.user.id);
    return jsonOk(result, 200);
  } catch {
    return jsonError("save_failed", "Could not start the review session. Please try again.", 500);
  }
};
