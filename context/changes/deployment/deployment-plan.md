# Cloudflare Integration & Deployment Plan — 10xCards

## Problem Statement

The project is already wired for Cloudflare (`@astrojs/cloudflare`, `wrangler.jsonc`, `nodejs_compat`), but
several gaps exist before a production deploy is safe:
- `wrangler` and `@astrojs/cloudflare` are pinned below the versions recommended by the infra doc
- `OPENROUTER_API_KEY` is missing from `astro:env` schema and `.env.example`
- No production deploy step exists in CI/CD
- No rollback runbook, no workerd smoke test, no access-protected preview environments
- Worker name in `wrangler.jsonc` is still the scaffold default (`10x-astro-starter`)

The plan below follows the infrastructure.md's recommendations and folds in every risk-register
mitigation as concrete steps.

---

## Phase 0 — Prerequisites
> Goal: Authenticate both CLIs and wire the local project to the remote Supabase project before
> any code or deployment work begins. Nothing in Phase 1+ can be verified without this.

### 0-A — Wrangler CLI

Both `wrangler` and the `supabase` CLI are already in `devDependencies` — no global install needed.
Always invoke them via `npx`.

- [ ] **0-A.1** ⚙️ MANUAL — Authenticate wrangler with your Cloudflare account:
  ```bash
  npx wrangler login
  ```
  This opens a browser OAuth flow. After completing it, verify:
  ```bash
  npx wrangler whoami
  ```
  Expected output: your Cloudflare account email and account ID.

- [ ] **0-A.2** ⚠️ Note your **Cloudflare Account ID** from `wrangler whoami` output — you will
  need it when connecting the repo to Cloudflare Pages (Phase 5.1).

### 0-B — Supabase Project Setup

- [ ] **0-B.1** ⚙️ MANUAL — Create a Supabase project at [supabase.com/dashboard](https://supabase.com/dashboard):
  - Choose a project name (e.g. `10xcards`)
  - Choose a region close to your target users
  - Set a strong database password and **save it** — it cannot be recovered

- [ ] **0-B.2** ⚙️ MANUAL — Retrieve your project credentials from the Supabase dashboard:
  Project → Settings → API:
  - **Project URL** → this is `SUPABASE_URL`
  - **Project API keys → `anon` `public`** → this is `SUPABASE_KEY`
  ⚠️ Use the **anon key**, not the service role key. The app uses `@supabase/ssr` with RLS — the
  anon key is correct for SSR cookie-based auth. The service role key bypasses RLS entirely.

- [ ] **0-B.3** Authenticate the Supabase CLI:
  ```bash
  npx supabase login
  ```
  This opens a browser flow and stores a token locally.

- [ ] **0-B.4** Link the local project to your remote Supabase project:
  ```bash
  npx supabase link --project-ref <your-project-ref>
  ```
  The `project-ref` is the ID in your Supabase dashboard URL:
  `https://supabase.com/dashboard/project/<project-ref>`
  ⚠️ This also updates the local `supabase/config.toml` implicit link. The `project_id` field in
  `config.toml` is currently `"10x-astro-starter"` (scaffold default) — update it to match your
  real project name for clarity:
  ```toml
  project_id = "10xcards"
  ```

- [ ] **0-B.5** If the remote project already has schema applied, pull it to sync local state:
  ```bash
  npx supabase db pull
  ```
  If the remote is empty (fresh project), skip — migrations will be pushed in the next step.

- [ ] **0-B.6** Push any existing local migrations to the remote database:
  ```bash
  npx supabase db push
  ```
  ⚠️ No migration files exist yet in `supabase/migrations/` — if schema is managed directly in
  the Supabase dashboard (SQL editor), run `supabase db pull` instead to capture it as a
  migration file before the first `db push`.

### 0-C — Supabase Auth Configuration (Production URL)

- [ ] **0-C.1** ⚙️ MANUAL — After the first Cloudflare deploy (Phase 4.2), update the Supabase
  auth redirect settings with the production URL:
  Supabase Dashboard → Authentication → URL Configuration:
  - **Site URL**: `https://<your-worker>.workers.dev` (or custom domain)
  - **Additional redirect URLs**: add `https://<your-worker>.workers.dev/**`
  ⚠️ Without this, sign-in and magic link emails will redirect back to `http://127.0.0.1:3000`
  (the local dev URL in `supabase/config.toml`), breaking auth in production.

- [ ] **0-C.2** Update `supabase/config.toml` `[auth]` section for local dev accuracy:
  ```toml
  site_url = "http://127.0.0.1:4321"
  additional_redirect_urls = ["http://127.0.0.1:4321", "https://127.0.0.1:4321"]
  ```
  The Astro dev server defaults to port **4321**, not 3000. This only affects local `supabase start`.

### 0-D — Local Environment File

- [ ] **0-D.1** Create `.dev.vars` in the repo root (gitignored) with values from step 0-B.2:
  ```
  SUPABASE_URL=https://<project-ref>.supabase.co
  SUPABASE_KEY=<anon-public-key>
  OPENROUTER_API_KEY=<your-openrouter-key>
  ```
  This file is read by `wrangler dev` (workerd runtime). The standard `astro dev` reads `.env`
  instead — create a matching `.env` file if you use `npm run dev` for daily development.

---

## Phase 1 — Dependency & Config Hygiene
> Goal: Resolve the version gaps that block agent-friendly features and companion handlers.

- [ ] **1.1** Update `wrangler` (→ ≥4.102.0) and `@astrojs/cloudflare` (→ ≥13.6.0):
  ```bash
  npm update wrangler @astrojs/cloudflare
  ```
  Verify resolved versions in `package-lock.json`.

- [ ] **1.2** Rename the worker in `wrangler.jsonc`:
  ```json
  "name": "10xcards"
  ```
  ⚠️ Edge case: renaming after a first deploy creates a new worker — the old one must be deleted
  manually in the Cloudflare dashboard to avoid orphaned billing. If already deployed under the
  old name, skip rename or do it in a coordinated cutover.

- [ ] **1.3** Add `OPENROUTER_API_KEY` to `astro:env` schema in `astro.config.mjs`:
  ```ts
  OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
  ```
  Keep `optional: true` so build passes without the key (consistent with existing `SUPABASE_*` pattern).

- [ ] **1.4** Update `.env.example` to include `OPENROUTER_API_KEY=###`.

- [ ] **1.5** Run `npm run lint && npm run build` locally (with secrets in `.dev.vars`) to confirm
  nothing broke after the updates.

---

## Phase 2 — Workerd Local Verification
> Goal: Catch Node.js vs workerd divergence locally before production.

- [ ] **2.1** Add a `dev:worker` script to `package.json`:
  ```json
  "dev:worker": "wrangler dev"
  ```
  This runs the same workerd runtime as production — essential for testing auth and cookie flows.

- [ ] **2.2** Confirm `.dev.vars` exists with all three keys (created in Phase 0-D.1).
  Used exclusively by `wrangler dev`; standard `astro dev` reads `.env`.

- [ ] **2.3** Run `npm run dev:worker` and execute the auth smoke test:
  - Sign up with a new account
  - Sign in → confirm session cookie is set correctly via `Astro.cookies`
  - Access a protected route (`/dashboard`) — confirm middleware redirect works
  - Sign out → confirm session cookie is cleared
  ⚠️ Edge case: If `@supabase/ssr` cookie handling fails under workerd, the fallback is to read
  `requestHeaders.get("Cookie")` directly (already done in `src/lib/supabase.ts`) — check the
  `parseCookieHeader` call works correctly with workerd's Header implementation.

- [ ] **2.4** Run a Workers bundling dry-run to catch any Node.js-only package imports:
  ```bash
  npx wrangler deploy --dry-run --outdir dist
  ```
  ⚠️ Edge case: If the dry-run flags a `node:` API from an npm package (e.g. `fs`, `os`, `child_process`),
  resolve it before deploying — these only surface at deploy time, not during `astro build`.

---

## Phase 3 — Cloudflare Account Setup & Secrets (Manual Steps)
> Goal: Provision the Cloudflare account and inject production secrets.

- [ ] **3.1** ⚙️ MANUAL — Start on the **Free plan**; upgrade to Paid ($5/month) only if CPU
  timeouts appear in production.
  The Free plan's 10ms CPU limit *may* cause SSR timeouts under real load (especially during
  OpenRouter streaming and Supabase auth). Watch for `Worker exceeded CPU time limit` errors in
  `wrangler tail` during the Phase 4 smoke test. If they appear, upgrade:
  Cloudflare Dashboard → Workers & Pages → Plan → Upgrade to Paid ($5/month).

- [ ] **3.2** Confirm wrangler is authenticated (completed in Phase 0-A.1):
  ```bash
  npx wrangler whoami
  ```

- [ ] **3.3** Set production secrets (one command per secret):
  ```bash
  npx wrangler secret put SUPABASE_URL
  npx wrangler secret put SUPABASE_KEY
  npx wrangler secret put OPENROUTER_API_KEY
  ```
  ⚠️ Edge case: Secrets set via `wrangler secret put` apply to the **Workers** deployment.
  If using Pages Git integration (Phase 5), you must ALSO set them in the Pages dashboard
  (Pages → Settings → Environment variables) — they are separate secret stores.

- [ ] **3.4** Verify secrets are registered:
  ```bash
  npx wrangler secret list
  ```
  Expected output: `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY` all listed.

---

## Phase 4 — First Production Deploy & Verification
> Goal: Confirm the worker deploys and the full auth+generation flow works in production.

- [ ] **4.1** Build and deploy:
  ```bash
  npm run build
  npx wrangler deploy --message "initial-production-deploy"
  ```
  The `--message` flag tags the version for easy identification during rollback.

- [ ] **4.2** Note the deployed production URL from wrangler output.

- [ ] **4.3** Tail logs in a separate terminal while testing:
  ```bash
  npx wrangler tail 10xcards --format pretty --status error
  ```

- [ ] **4.4** Execute production smoke test (same flow as Phase 2.3):
  sign up → sign in → protected route → generate flashcards → sign out.
  Confirm zero error-level log lines.
  ⚠️ Free plan CPU check: if `wrangler tail` shows `Worker exceeded CPU time limit`, upgrade to
  Paid (see Phase 3.1). Simple page loads are unlikely to hit 10ms; flashcard generation with
  OpenRouter is the most likely trigger.

- [ ] **4.5** Run the rollback drill once to validate the procedure works:
  ```bash
  npx wrangler versions list
  # Identify the previous version UUID
  npx wrangler versions deploy <PREV-UUID>@100% -y
  # Then redeploy the current version to restore
  npx wrangler deploy --message "rollback-drill-restore"
  ```
  ⚠️ Edge case: `wrangler versions list` output has no timestamps by default — use `--json`
  and pipe through `jq '.[] | {id, message, created_on}'` to identify versions reliably.

---

## Phase 5 — Git-Integrated CI/CD via Cloudflare Pages
> Goal: Wire every `master` push to an automatic production deploy with protected previews.

- [ ] **5.1** ⚙️ MANUAL — Connect repo to Cloudflare Pages:
  Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git →
  select `10xCards` → configure:
  - Build command: `npm run build`
  - Output directory: `dist`
  - Root directory: `/` (default)

- [ ] **5.2** ⚙️ MANUAL — Set environment variables in Pages (for both Preview and Production):
  Pages → Settings → Environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_KEY`
  - `OPENROUTER_API_KEY`
  Mark all as **Encrypted** (secret).

- [ ] **5.3** ⚙️ MANUAL — Protect preview deployments with Cloudflare Access (Zero Trust):
  Cloudflare Dashboard → Zero Trust → Access → Applications → Add application →
  type: Self-hosted → hostname: `*.10xcards.pages.dev` → policy: require GitHub org membership
  or specific email. (Free tier covers this.)
  ⚠️ Edge case: Without Access, preview URLs are public and indexable. Branch names containing
  sensitive info (e.g. `fix/supabase-key-rotation`) could expose context in the preview URL.

- [ ] **5.4** Add a `wrangler deploy --dry-run` step to the CI pipeline to catch bundling failures
  before merging new dependencies:
  ```yaml
  - name: Wrangler bundling dry-run
    run: npx wrangler deploy --dry-run --outdir dist
    env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
      OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
  ```
  Add this step AFTER `npm run build` in `.github/workflows/ci.yml`.

- [ ] **5.5** Add `OPENROUTER_API_KEY` to the existing CI `build` step env block in `ci.yml`.

---

## Phase 6 — Rollback Runbook & Operational Docs
> Goal: Ensure the team can recover from a bad deploy under pressure without scrambling.

- [ ] **6.1** Create `context/foundation/runbook.md` with:
  - Rollback procedure (versions list → deploy UUID)
  - Log tailing commands (error filter, JSON pipeline)
  - Secret rotation procedure
  - Session KV namespace note (binding name `SESSION`, don't rename)
  - Supabase migration compatibility window rule (2-deploy window)
  - Daily request cap warning (100k/day ≠ 3M/month — upgrade before public launch)

- [ ] **6.2** Document the `wrangler.jsonc` / `astro.config.mjs` / `@astrojs/cloudflare` lock
  policy: always update all three together; never update one independently.

---

## Edge Case Summary

| Risk | Mitigation Step |
|---|---|
| Free plan 10ms CPU limit | Phase 3.1 — start Free; upgrade to Paid only on confirmed CPU timeout |
| workerd ≠ Node.js cookie bugs | Phase 2.3 — auth smoke test under `wrangler dev` |
| No `wrangler rollback` command | Phase 4.5 — rollback drill; Phase 6.1 — runbook |
| Workers bundling fails on npm package | Phase 2.4 + 5.4 — dry-run in local and CI |
| Worker rename creates orphaned resource | Phase 1.2 — warning + cutover note |
| Workers vs Pages secret stores diverge | Phase 3.3 + 5.2 — set secrets in BOTH |
| Preview URLs are public | Phase 5.3 — Cloudflare Access on `*.pages.dev` |
| Supabase migration doesn't roll back | Phase 6.1 — 2-deploy compatibility window rule |
| Session KV namespace lost on rename | Phase 6.1 — binding name documented in runbook |
| Wrangler version gap < 4.102.0 | Phase 1.1 — `npm update wrangler` |
