/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateTestUserId,
  createTestCards,
  deleteTestCard,
  updateTestCard,
  cleanupUserData,
  queryUserCards,
  canRunIntegrationTests,
} from "@/__tests__/db-setup";

describe("cards service (integration)", () => {
  let userId: string;

  if (!canRunIntegrationTests()) {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    it.skip("tests require SUPABASE_SERVICE_ROLE_KEY", () => {});
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    it.skip("placeholder", () => {});
    return;
  }

  beforeEach(() => {
    userId = generateTestUserId();
  });

  afterEach(async () => {
    await cleanupUserData(userId);
  });

  it("should create and retrieve a card", async () => {
    const cards = await createTestCards(userId, [{ front: "Q1", back: "A1", isAiGenerated: false }]);

    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe("Q1");
    expect(cards[0].back).toBe("A1");
    expect(cards[0].user_id).toBe(userId);
  });

  it("should edit a card", async () => {
    const [originalCard] = await createTestCards(userId, [{ front: "Original Question", back: "Original Answer" }]);

    const cardId = originalCard.id;

    const updated = await updateTestCard(userId, cardId, {
      front: "Updated Question",
      back: "Updated Answer",
    });

    expect(updated).not.toBeNull();
    expect(updated?.front).toBe("Updated Question");
    expect(updated?.back).toBe("Updated Answer");
    expect(updated?.id).toBe(cardId);
  });

  it("should delete only the target card", async () => {
    const cards = await createTestCards(userId, [
      { front: "Card 1", back: "Back 1" },
      { front: "Card 2", back: "Back 2" },
      { front: "Card 3", back: "Back 3" },
    ]);

    const [first, middle, last] = cards;

    const deleted = await deleteTestCard(userId, middle.id);
    expect(deleted).toBe(true);

    const remaining = await queryUserCards(userId);
    expect(remaining).toHaveLength(2);
    const ids = remaining.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([first.id, last.id]));
    expect(ids).not.toContain(middle.id);
  });

  it("should handle concurrent edits (last-write-wins)", async () => {
    const [card] = await createTestCards(userId, [{ front: "Original", back: "Answer" }]);

    const cardId = card.id;

    const [result1, result2] = await Promise.all([
      updateTestCard(userId, cardId, { front: "Version A" }),
      updateTestCard(userId, cardId, { front: "Version B" }),
    ]);

    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();

    const remaining = await queryUserCards(userId);
    expect(remaining).toHaveLength(1);

    const finalCard = remaining[0];
    expect(finalCard.front).toMatch(/Version A|Version B/);
  });

  it("should return null when editing non-existent card", async () => {
    const nonExistentId = "00000000-0000-0000-0000-000000000000";

    const result = await updateTestCard(userId, nonExistentId, {
      front: "New Front",
    });

    expect(result).toBeNull();
  });

  it("should return false when deleting non-existent card", async () => {
    const nonExistentId = "00000000-0000-0000-0000-000000000000";

    const result = await deleteTestCard(userId, nonExistentId);

    expect(result).toBe(false);
  });

  it("should preserve card identity across edits", async () => {
    const [originalCard] = await createTestCards(userId, [{ front: "Q", back: "A" }]);

    const cardId = originalCard.id;
    const createdAt = originalCard.created_at;

    await updateTestCard(userId, cardId, { front: "Q1" });
    await updateTestCard(userId, cardId, { front: "Q2" });
    const final = await updateTestCard(userId, cardId, { front: "Q3" });

    expect(final?.id).toBe(cardId);
    expect(final?.created_at).toBe(createdAt);
    expect(final?.front).toBe("Q3");
  });

  it("should handle rapid succession of edits and deletes", async () => {
    const cards = await createTestCards(userId, [
      { front: "Card 1", back: "Back 1" },
      { front: "Card 2", back: "Back 2" },
    ]);

    const [card1, card2] = cards;

    await updateTestCard(userId, card1.id, { front: "Edit 1" });
    await updateTestCard(userId, card1.id, { front: "Edit 2" });
    await deleteTestCard(userId, card2.id);

    const remaining = await queryUserCards(userId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(card1.id);
    expect(remaining[0].front).toBe("Edit 2");
  });
});
