import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateCardRequest } from "@/types";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_KEY ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required for integration tests");
}

if (!SUPABASE_KEY) {
  throw new Error("SUPABASE_KEY is required for integration tests");
}

/**
 * Check if we can run integration tests.
 * Returns true if SERVICE_ROLE_KEY is available, false otherwise.
 */
export function canRunIntegrationTests(): boolean {
  return !!SERVICE_ROLE_KEY;
}

/**
 * Get a helpful message for users who need to set up the service role key.
 */
export function getServiceRoleKeySetupMessage(): string {
  return (
    "SUPABASE_SERVICE_ROLE_KEY is required to run integration tests.\n" +
    "This key allows tests to bypass RLS policies for setup and cleanup.\n\n" +
    "To set it up:\n" +
    "1. Go to your Supabase project: https://app.supabase.com\n" +
    "2. Navigate to: Project Settings → API → Service Role Secret\n" +
    "3. Copy the secret key\n" +
    "4. Add to .dev.vars: SUPABASE_SERVICE_ROLE_KEY=<your-secret-key>\n\n" +
    "For security: Never commit the service role key to version control."
  );
}

/**
 * Create a Supabase client with the service role key (bypasses RLS).
 * Used for test setup, data creation, and cleanup.
 */
function createSupabaseAdminClient(): SupabaseClient {
  if (!SERVICE_ROLE_KEY) {
    throw new Error(getServiceRoleKeySetupMessage());
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Create a test card in the database (using admin client to bypass RLS).
 */
export async function createTestCard(userId: string, input: CreateCardRequest) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("cards")
    .insert({
      user_id: userId,
      front: input.front,
      back: input.back,
      is_ai_generated: input.isAiGenerated ?? false,
    })
    .select("id, user_id, front, back, is_ai_generated, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

/**
 * Create multiple test cards.
 */
export async function createTestCards(userId: string, inputs: CreateCardRequest[]) {
  const cards = [];
  for (const input of inputs) {
    const card = await createTestCard(userId, input);
    cards.push(card);
  }
  return cards;
}

/**
 * Update a test card.
 */
export async function updateTestCard(userId: string, cardId: string, updates: { front?: string; back?: string }) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("cards")
    .update(updates)
    .eq("id", cardId)
    .eq("user_id", userId)
    .select("id, user_id, front, back, is_ai_generated, created_at, updated_at")
    .single();

  if (error?.code === "PGRST116") return null;
  if (error) throw error;
  return data;
}

/**
 * Delete a test card.
 */
export async function deleteTestCard(userId: string, cardId: string) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase.from("cards").delete().eq("id", cardId).eq("user_id", userId).select("id");

  if (error) throw error;
  return data.length > 0;
}

/**
 * Clean up all test data for a user.
 */
export async function cleanupUserData(userId: string) {
  const supabase = createSupabaseAdminClient();
  await supabase.from("review_sessions").delete().eq("user_id", userId);
  await supabase.from("cards").delete().eq("user_id", userId);
}

/**
 * Generate a unique user ID for testing (valid UUID format).
 */
export function generateTestUserId(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  randomBytes[6] = (randomBytes[6] & 0x0f) | 0x40;
  randomBytes[8] = (randomBytes[8] & 0x3f) | 0x80;

  const hex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Query cards for a user.
 */
export async function queryUserCards(userId: string) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase.from("cards").select("id, user_id, front, back").eq("user_id", userId);

  if (error) throw error;
  return data;
}
