// E2E Test: Session persists after browser refresh
// Risk (test-plan.md #4): Review session loses progress mid-session; user must restart.
// Observable outcome: User answers cards 1–2, refreshes the page, and session resumes at card 3 (not 1).
//
// This test logs in directly (doesn't rely on setup project storageState).

import { test, expect } from "@playwright/test";

test("session persists after page reload", async ({ page }) => {
  const testEmail = process.env.E2E_TEST_EMAIL;
  const testPassword = process.env.E2E_TEST_PASSWORD;

  if (!testEmail || !testPassword) {
    throw new Error("E2E_TEST_EMAIL and E2E_TEST_PASSWORD environment variables required. Set them before running.");
  }

  // === SETUP: Authenticate ===
  await page.goto("/auth/signin");
  await page.waitForLoadState("networkidle");

  const emailInput = page.getByLabel(/^email/i);
  const passwordInput = page.getByLabel(/^password/i);

  // In WebKit / SSR React islands, ensure inputs are hydrated before submitting
  await emailInput.click();
  await emailInput.fill(testEmail);
  await expect(emailInput).toHaveValue(testEmail);

  await passwordInput.click();
  await passwordInput.fill(testPassword);
  await expect(passwordInput).toHaveValue(testPassword);

  const signInButton = page.getByRole("button", { name: /sign in/i });
  await signInButton.click();

  // Wait for redirect after login
  await page.waitForURL(/\/(dashboard|review|deck|generate)?$/, { timeout: 15000 }); // Should NOT be on /auth/*
  await page.waitForLoadState("networkidle");

  console.log(`✅ Logged in. Current URL: ${page.url()}`);

  // Navigate to review page
  await page.goto("/review");
  await page.waitForLoadState("networkidle");

  console.log(`Navigated to /review. URL: ${page.url()}`);

  // Wait for React hydration
  await page.waitForLoadState("domcontentloaded");

  // Check if there's an active session or if we need to start one
  const startReviewButton = page.getByRole("button", { name: /start review/i });
  const startReviewVisible = await startReviewButton.isVisible().catch(() => false);

  if (startReviewVisible) {
    console.log("No active session. Clicking 'Start review' button...");
    await startReviewButton.click();
    await page.waitForLoadState("networkidle");
  }

  // If session is already completed or nothing is due, skip or handle gracefully
  const sessionComplete = page.getByText(/Session complete/i);
  const nothingDue = page.getByText(/Nothing due right now/i);

  if ((await sessionComplete.isVisible().catch(() => false)) || (await nothingDue.isVisible().catch(() => false))) {
    console.log("⚠️ All due cards were already answered. Creating new cards for test...");
    // Create 3 fresh cards via API so a new review session can be started
    for (let i = 1; i <= 3; i++) {
      await page.request.post("/api/cards", {
        data: {
          front: `E2E Test Card ${i} [${Date.now()}]`,
          back: `E2E Test Answer ${i}`,
        },
      });
    }
    await page.goto("/review");
    await page.waitForLoadState("networkidle");
    const newStartBtn = page.getByRole("button", { name: /start review/i });
    if (await newStartBtn.isVisible().catch(() => false)) {
      await newStartBtn.click();
      await page.waitForLoadState("networkidle");
    }
  }

  // === ACTION: Answer 2 cards ===

  // The card component has this structure:
  //   <Card>
  //     <CardHeader><CardTitle>Front</CardTitle></CardHeader>
  //     <CardContent>
  //       <p>{card.front}</p>  ← This is what we want
  //       <button>Show answer</button>
  //       <div>Back section (hidden until revealed)</div>
  //     </CardContent>
  //   </Card>

  // Helper to get the front text of the card currently in view
  const getFrontText = async () => {
    // CardTitle is a <div> (not role="heading"), so locate by text "Front"
    const frontLabel = page.getByText("Front", { exact: true });
    await expect(frontLabel).toBeVisible();
    // The front text is the paragraph in card content
    const frontParagraph = page.locator('[data-slot="card-content"] > p').first();
    return (await frontParagraph.textContent())?.trim() ?? "";
  };

  const card1Front = await getFrontText();
  console.log(`Card 1 front: "${card1Front}"`);
  expect(card1Front).toBeTruthy();

  // Reveal card 1
  const showAnswerButton = page.getByRole("button", { name: /show answer/i });
  await showAnswerButton.click();

  // Rate card 1 as "Good" (rating 4)
  const goodButton = page.getByRole("button", { name: /4 · good/i });
  await goodButton.click();

  // Wait for API response
  await page.waitForResponse((response) => response.url().includes("/api/review/answer") && response.status() === 200);

  // Card 2 should now be displayed (different front text)
  await page.waitForTimeout(300);
  const card2Front = await getFrontText();
  console.log(`Card 2 front: "${card2Front}"`);
  expect(card2Front).not.toEqual(card1Front);

  // Reveal and rate card 2
  await showAnswerButton.click();
  await goodButton.click();

  // Wait for API response
  await page.waitForResponse((response) => response.url().includes("/api/review/answer") && response.status() === 200);

  // Card 3 should now be displayed
  await page.waitForTimeout(300);
  const card3Front = await getFrontText();
  console.log(`Card 3 front: "${card3Front}"`);
  expect(card3Front).not.toEqual(card2Front);

  // === CRITICAL ACTION: Refresh the page ===
  // This is the risk: session state must persist in the database and restore correctly
  const sessionRestoreResponse = page.waitForResponse(
    (response) => response.url().includes("/api/review/current") && response.status() === 200,
  );

  await page.reload();
  await sessionRestoreResponse;
  await page.waitForLoadState("networkidle");

  // === ASSERTION: Session resumed at card 3, not reset to card 1 ===
  const resumedFront = await getFrontText();
  console.log(`Resumed at card: "${resumedFront}"`);
  expect(resumedFront).toEqual(card3Front);

  // No error state
  const errorAlert = page.getByText("Something went wrong");
  await expect(errorAlert).not.toBeVisible();

  // Component is still interactive
  await showAnswerButton.click();
  const backLabel = page.getByText("Back", { exact: true });
  await expect(backLabel).toBeVisible();

  console.log("✅ Session persisted across page reload!");
});
