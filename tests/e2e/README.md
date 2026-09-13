# Playwright E2E Tests

This directory contains browser-level E2E tests for 10xCards using Playwright.

## Setup

### 1. Install Playwright (one-time)

```bash
npx playwright install
```

### 2. Create a test user (one-time)

Before running tests, you need a Supabase user account for testing:

**Option A: Sign up via the app**

```bash
npm run dev
# Navigate to http://localhost:4321/auth/signup
# Create a test account with:
#   Email: test@example.com (or any email)
#   Password: your-test-password
```

**Option B: Create via Supabase dashboard**

- Go to https://supabase.com
- Navigate to your project → Authentication → Users
- Create a new user with email/password

### 3. Set environment variables

Create a `.env.local` or export for your shell:

```bash
export E2E_TEST_EMAIL="test@example.com"
export E2E_TEST_PASSWORD="your-test-password"
```

## Running Tests

### All tests (headless)

```bash
npx playwright test
```

### Single test file (watch mode)

```bash
npx playwright test tests/e2e/session-persistence.spec.ts
```

### With browser visible (--headed)

```bash
npx playwright test --headed
```

### Debug mode (opens inspector)

```bash
npx playwright test --debug
```

### View HTML test report

```bash
npx playwright show-report
```

## Test Structure

- `setup.spec.ts` — Authenticates once and saves session state
- `session-persistence.spec.ts` — Verifies review session survives page reload
- `seed.spec.ts` — Example test (model for new tests)
- `.auth/` — Playwright-managed auth state (gitignored)

Each test in `session-persistence.spec.ts`, `*.spec.ts` etc. automatically loads the auth state from `setup.spec.ts` and runs authenticated.

## Rules for New E2E Tests

See `AGENTS.md` for the E2E Testing Rules section. Key principles:

- Use `getByRole`, `getByLabel`, `getByText` — never CSS selectors
- No `waitForTimeout()` — wait for state instead (`toBeVisible()`, `waitForResponse()`)
- Each test is independent (own setup/action/assertion/cleanup)
- Name the test after the risk it protects
- Use unique data (timestamp suffix) for test data

## Troubleshooting

**"element(s) not found"**

- Ensure the test user is logged in
- Check that E2E_TEST_EMAIL and E2E_TEST_PASSWORD are set correctly
- Run with `--headed` to see what's happening in the browser

**"Auth state not loading"**

- Delete `.auth/user.json` and re-run `npx playwright test` to regenerate
- Check that the setup project ran successfully first

**Flaky tests**

- Ensure you're waiting for state, not using `waitForTimeout()`
- Check that test data is unique (use Date.now() suffix)
- Verify cleanup runs after each test
