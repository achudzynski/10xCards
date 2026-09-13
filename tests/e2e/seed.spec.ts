// Seed test — the exemplar every E2E test in this project is modeled on.
// Risk: A user-created entity (deck) is correctly persisted in Supabase and survives SSR page reload.
// This test demonstrates:
//   • Role-based locators (getByRole, never CSS selectors or XPath)
//   • Unique test data (timestamp suffix prevents collision under parallel runs)
//   • Robust waits for state, never waitForTimeout()
//   • Clean, isolated setup/action/assertion/cleanup
//   • Real browser-level concerns (SSR persistence across reload)
//
// Reference: https://playwright.dev/docs/best-practices
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { test, expect } from "@playwright/test";

test("created deck persists after page reload", async ({ page }) => {
  // Unique test data to support parallel/repeated test runs
  const deckName = `Test Deck ${Date.now()}`;

  // Setup: Navigate to the app home
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Action: Create a new deck
  // User clicks "New deck" button
  const newDeckButton = page.getByRole("button", { name: /new deck/i });
  await newDeckButton.click();

  // User fills in the deck name via the text input
  const deckNameInput = page.getByRole("textbox", { name: /deck name/i });
  await deckNameInput.fill(deckName);

  // User submits the form
  const createButton = page.getByRole("button", { name: /create/i });
  await createButton.click();

  // Assertion 1: Deck appears in the UI
  // Wait for the deck heading to become visible (confirms SSR rendered the created entity)
  const deckHeading = page.getByRole("heading", { name: deckName });
  await expect(deckHeading).toBeVisible();

  // Assertion 2: Deck persists after full page reload (real SSR + DB round-trip)
  // This is the risk the test protects: DB persistence + SSR render recovery
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(deckHeading).toBeVisible();

  // Cleanup: Delete the test deck to prevent test data accumulation
  const deleteButton = page.getByRole("button", { name: /delete deck/i });
  await deleteButton.click();

  // Confirm the delete action (wait for confirmation button to be actionable)
  const confirmDeleteButton = page.getByRole("button", { name: /confirm/i });
  await confirmDeleteButton.click();

  // Wait for the deck to disappear (confirmation the delete succeeded)
  await expect(deckHeading).not.toBeVisible();
});
