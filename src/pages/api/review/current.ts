import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { jsonError, jsonOk } from "@/lib/api";
import { getCurrentReviewSnapshot } from "@/lib/services/review/session";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonError("unauthorized", "You must be signed in to view the review session", 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("server_misconfigured", "Supabase is not configured", 500);
  }

  try {
    const result = await getCurrentReviewSnapshot(supabase, context.locals.user.id);
    return jsonOk(result, 200);
  } catch {
    return jsonError("load_failed", "Could not load the review session. Please try again.", 500);
  }
};
