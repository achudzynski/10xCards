/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateTestUserId,
  createTestCards,
  updateTestCard,
  deleteTestCard,
  queryUserCards,
  cleanupUserData,
  canRunIntegrationTests,
} from "@/__tests__/db-setup";

describe("RLS policies (integration)", () => {
  let userA: string;
  let userB: string;

  if (!canRunIntegrationTests()) {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    it.skip("tests require SUPABASE_SERVICE_ROLE_KEY", () => {});
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    it.skip("placeholder", () => {});
    return;
  }

  beforeEach(() => {
    userA = generateTestUserId();
    userB = generateTestUserId();
  });

  afterEach(async () => {
    await cleanupUserData(userA);
    await cleanupUserData(userB);
  });

  it("should prevent User A from querying User B's cards", async () => {
    const userBCards = await createTestCards(userB, [{ front: "User B's Question", back: "User B's Answer" }]);

    expect(userBCards).toHaveLength(1);

    const userAView = await queryUserCards(userA);
    expect(userAView).toHaveLength(0);

    const userBView = await queryUserCards(userB);
    expect(userBView).toHaveLength(1);
    expect(userBView[0].front).toBe("User B's Question");
  });

  it("should prevent User A from editing User B's card", async () => {
    const userBCards = await createTestCards(userB, [{ front: "User B's Question", back: "User B's Answer" }]);

    const cardId = userBCards[0].id;

    const result = await updateTestCard(userA, cardId, {
      front: "Hacked by User A",
    });

    expect(result).toBeNull();

    const userBView = await queryUserCards(userB);
    expect(userBView[0].front).toBe("User B's Question");
  });

  it("should prevent User A from deleting User B's card", async () => {
    const userBCards = await createTestCards(userB, [{ front: "User B's Question", back: "User B's Answer" }]);

    const cardId = userBCards[0].id;

    const result = await deleteTestCard(userA, cardId);

    expect(result).toBe(false);

    const userBView = await queryUserCards(userB);
    expect(userBView).toHaveLength(1);
    expect(userBView[0].id).toBe(cardId);
  });

  it("should allow each user to see only their own cards", async () => {
    await createTestCards(userA, [
      { front: "User A Card 1", back: "A1" },
      { front: "User A Card 2", back: "A2" },
    ]);

    await createTestCards(userB, [
      { front: "User B Card 1", back: "B1" },
      { front: "User B Card 2", back: "B2" },
      { front: "User B Card 3", back: "B3" },
    ]);

    const userAView = await queryUserCards(userA);
    expect(userAView).toHaveLength(2);
    expect(userAView.every((c) => c.front.startsWith("User A"))).toBe(true);

    const userBView = await queryUserCards(userB);
    expect(userBView).toHaveLength(3);
    expect(userBView.every((c) => c.front.startsWith("User B"))).toBe(true);
  });

  it("should enforce RLS on concurrent access patterns", async () => {
    const userBCards = await createTestCards(userB, [{ front: "Shared Deck Card", back: "Original" }]);

    const cardId = userBCards[0].id;

    const [userAEdit, userBEdit, userADelete] = await Promise.all([
      updateTestCard(userA, cardId, { front: "User A Edit" }),
      updateTestCard(userB, cardId, { front: "User B Edit" }),
      deleteTestCard(userA, cardId),
    ]);

    expect(userAEdit).toBeNull();
    expect(userADelete).toBe(false);

    expect(userBEdit).not.toBeNull();
    expect(userBEdit?.front).toBe("User B Edit");

    const userBFinal = await queryUserCards(userB);
    expect(userBFinal).toHaveLength(1);
    expect(userBFinal[0].front).toBe("User B Edit");
  });

  it("should maintain RLS isolation across rapid changes", async () => {
    const userACards = await createTestCards(userA, [{ front: "User A Q", back: "User A A" }]);

    const userBCards = await createTestCards(userB, [{ front: "User B Q", back: "User B A" }]);

    const userACardId = userACards[0].id;
    const userBCardId = userBCards[0].id;

    await Promise.all([
      updateTestCard(userA, userACardId, { front: "User A Edit 1" }),
      updateTestCard(userB, userBCardId, { front: "User B Edit 1" }),
      updateTestCard(userA, userBCardId, { front: "Hacking attempt" }),
      updateTestCard(userB, userACardId, { front: "Hacking attempt" }),
      deleteTestCard(userA, userBCardId),
      deleteTestCard(userB, userACardId),
    ]);

    const userAFinal = await queryUserCards(userA);
    const userBFinal = await queryUserCards(userB);

    expect(userAFinal).toHaveLength(1);
    expect(userBFinal).toHaveLength(1);

    expect(userAFinal[0].front).toBe("User A Edit 1");
    expect(userBFinal[0].front).toBe("User B Edit 1");

    expect(userAFinal[0].front).not.toContain("Hacking");
    expect(userBFinal[0].front).not.toContain("Hacking");
  });
});
