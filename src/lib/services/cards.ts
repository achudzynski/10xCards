import type { SupabaseClient } from "@supabase/supabase-js";
import type { Card, CreateCardRequest, UpdateCardRequest } from "@/types";

interface CardRow {
  id: string;
  user_id: string;
  front: string;
  back: string;
  is_ai_generated: boolean;
  created_at: string;
  updated_at: string;
}

function mapRow(row: CardRow): Card {
  return {
    id: row.id,
    userId: row.user_id,
    front: row.front,
    back: row.back,
    isAiGenerated: row.is_ai_generated,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createCard(supabase: SupabaseClient, userId: string, input: CreateCardRequest): Promise<Card> {
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

  if (error) {
    throw error;
  }
  return mapRow(data);
}

export async function listCards(supabase: SupabaseClient, userId: string): Promise<Card[]> {
  const { data, error } = await supabase
    .from("cards")
    .select("id, user_id, front, back, is_ai_generated, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }
  return (data as CardRow[]).map(mapRow);
}

export async function updateCard(
  supabase: SupabaseClient,
  userId: string,
  cardId: string,
  input: UpdateCardRequest,
): Promise<Card | null> {
  const { data, error } = await supabase
    .from("cards")
    .update({
      ...(input.front !== undefined ? { front: input.front } : {}),
      ...(input.back !== undefined ? { back: input.back } : {}),
    })
    .eq("id", cardId)
    .eq("user_id", userId)
    .select("id, user_id, front, back, is_ai_generated, created_at, updated_at")
    .single();

  if (error) {
    // PGRST116: no rows matched the id + user_id filter — card doesn't exist or isn't owned by this user.
    if (error.code === "PGRST116") {
      return null;
    }
    throw error;
  }
  return mapRow(data);
}

export async function deleteCard(supabase: SupabaseClient, userId: string, cardId: string): Promise<boolean> {
  const { data, error } = await supabase.from("cards").delete().eq("id", cardId).eq("user_id", userId).select("id");

  if (error) {
    throw error;
  }
  return data.length > 0;
}
