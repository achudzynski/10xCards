// Setup project: authenticate once and capture storageState for all E2E tests
// This runs before any test, logs in, and saves the session to .auth/user.json
// All test files then inherit this auth state via playwright.config.ts
//
// Usage: Set environment variables before running tests:
//   export E2E_TEST_EMAIL="test@example.com"
//   export E2E_TEST_PASSWORD="password123"
//
// First-time setup:
//   1. Create the test user manually at /auth/signup, OR
//   2. Create via Supabase dashboard, OR
//   3. Use Supabase test helpers (commented out below)

import { test } from "@playwright/test";

test("authenticate and save storage state", async ({ page }) => {
  // For testing, we need a valid user account in Supabase.
  // Set these environment variables to use existing credentials:
  const testEmail = process.env.E2E_TEST_EMAIL;
  const testPassword = process.env.E2E_TEST_PASSWORD;

  if (!testEmail || !testPassword) {
    console.error("❌ E2E authentication requires environment variables:");
    console.error("   E2E_TEST_EMAIL=your@email.com");
    console.error("   E2E_TEST_PASSWORD=your_password");
    console.error("");
    console.error("Setup steps:");
    console.error("   1. Sign up at http://localhost:4321/auth/signup");
    console.error("   2. Set the env vars above");
    console.error("   3. Run: npx playwright test");
    throw new Error("E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars required");
  }

  // Navigate to the signin page
  await page.goto("/auth/signin");
  await page.waitForLoadState("networkidle");

  // Fill in email and password using the form field IDs
  const emailInput = page.locator("#email");
  const passwordInput = page.locator("#password");

  await emailInput.fill(testEmail);
  await passwordInput.fill(testPassword);

  // Click the "Sign in" button
  const signInButton = page.getByRole("button", { name: /sign in/i });
  await signInButton.click();

  // Wait for redirect to /dashboard after successful login
  await page.waitForURL("**/dashboard");
  await page.waitForLoadState("networkidle");

  // Save the authenticated state (cookies, localStorage, sessionStorage)
  // This will be loaded by all subsequent tests via storageState in playwright.config.ts
  await page.context().storageState({ path: "tests/e2e/.auth/user.json" });

  console.log("✅ Auth state saved to tests/e2e/.auth/user.json");
});
