---
project: 10xCards
researched_at: 2026-06-28T19:00:00+01:00
recommended_platform: Cloudflare Workers + Pages
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (SSR)
  runtime: Cloudflare Workers (workerd)
  database: Supabase (external)
---

## Recommendation

**Deploy on Cloudflare Workers + Pages.**

The project is already fully wired for Cloudflare: `@astrojs/cloudflare@^13.5.0`, `wrangler@^4.90.0`, `wrangler.jsonc` with `nodejs_compat`, `compatibility_date: 2026-05-08`, and `observability` enabled. No adapter swap, no new build tooling, no configuration rewrite — deploy is one command. The Paid plan ($5/month) is mandatory for real SSR workloads because the Free plan's 10ms CPU limit is insufficient for Astro page rendering with React and Supabase auth; the interview constraints (no strong cost preference, external Supabase + OpenRouter) align with paying $5/month to unlock the 30s CPU limit. Cloudflare scored highest across all five agent-friendly criteria: wrangler CLI covers deploy, secrets, log tailing, and version management; workerd is fully managed serverless; docs are markdown-accessible via `llms.txt`; `wrangler deploy` is deterministic and scriptable; Cloudflare's Agents SDK and MCP server provide structured tool-use for agents.

## Platform Comparison

| Platform | CLI-first | Managed | Agent Docs | Stable Deploy API | MCP | **Total** |
|---|---|---|---|---|---|---|
| **Cloudflare Workers + Pages** | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | **10** |
| **Vercel** | ✅ Pass | ✅ Pass | ⚡ Partial | ✅ Pass | ✅ Pass | **9** |
| **Railway** | ⚡ Partial | ✅ Pass | ✅ Pass | ⚡ Partial | ✅ Pass | **8** |
| **Netlify** | ⚡ Partial | ✅ Pass | ✅ Pass | ⚡ Partial | ✅ Pass | **8** |
| **Render** | ⚡ Partial | ✅ Pass | ✅ Pass | ⚡ Partial | ✅ Pass | **8** |
| **Fly.io** | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ❌ Fail | **8** |

**Scoring notes:**
- *Vercel Agent Docs (Partial)*: No `llms.txt` found at vercel.com; gap partially covered by `mcp.vercel.com` and `vercel agent init`.
- *Railway/Netlify/Render Deploy API (Partial)*: No CLI rollback command — dashboard or API only.
- *Netlify CLI-first (Partial)*: No CLI rollback; `netlify logs` function-streaming CLI status uncertain in recent versions.
- *Fly.io MCP (Fail)*: No native MCP server found; `fly.io/llms.txt` exists but no structured tool-use integration.

**Hard filters applied:** No platform was filtered — Q1 (no persistent connections needed) means serverless-only platforms (Vercel, Netlify) remain eligible. Tech stack runtime (Cloudflare Workers) is a strong soft preference; platforms requiring an adapter swap (Vercel, Netlify, Railway, Render, Fly.io) carry real migration friction.

**Interview weights applied:**
- Q2 (no strong cost/DX preference): neutral
- Q3 (AWS/GCP/Azure familiarity): none of the 6 candidates match → no tie-breaking effect
- Q4 (single region): no preference for edge-native → neutral
- Q5 (external Supabase + OpenRouter): co-location not a requirement → neutral

### Shortlisted Platforms

#### 1. Cloudflare Workers + Pages (Recommended)

The project is already fully configured for Cloudflare deployment — no adapter swap, no tooling change. `wrangler deploy` is deterministic and exits with success/failure; `wrangler tail` streams real-time logs with rich filtering; `wrangler versions list` + `wrangler versions deploy` provide version-pinned rollback. Cloudflare's `llms.txt` at `developers.cloudflare.com/workers/llms.txt` and Accept: text/markdown docs make it agent-readable. The Agents SDK hosts MCP servers on Workers, giving structured tool-use beyond CLI output parsing. Hyperdrive accelerates external Supabase connections by pooling and caching at the edge. The primary trade-off is the mandatory $5/month Paid plan for SSR (Free plan's 10ms CPU limit is insufficient) and the workerd ≠ Node.js local dev divergence.

#### 2. Vercel

Vercel is the cleanest non-Cloudflare option for Astro SSR. `@astrojs/vercel@10.x` supports Astro 6 (must pin `^10.0.0` — npm latest is v11/Astro 7). The CLI has a native `vercel rollback` command (unique among the candidates) and `vercel logs --follow` with JSON output. Fluid Compute (GA, April 2025) reduces cold starts. Hobby tier is free and covers 10k–100k requests/month comfortably. The Vercel MCP server at `mcp.vercel.com` is GA. The gap vs. Cloudflare: adapter swap required, no WebSocket support, no `llms.txt`, and Hobby rollback is limited to one step back. External Supabase integrates cleanly via `vercel env`.

#### 3. Railway

Railway is the strongest persistent-process option. Astro 6 SSR with `@astrojs/node` is explicitly documented in Railway's own Astro guide. `railway up` deploys; `railway logs` tails. The MCP story is the best of any platform outside Cloudflare: both local (`railway mcp install`) and remote (`mcp.railway.com`) MCP servers are GA, plus `railway agent` CLI for conversational infra help, `docs.railway.com/llms-full.txt` for full-doc ingestion, and `railway.com/agents.md`. Cost is ~$8–12/month (Hobby $5 + resources). The gaps: adapter swap to `@astrojs/node` required (including `host: 0.0.0.0`, updated start script), no CLI rollback (dashboard only), and always-on billing regardless of traffic.

## Anti-Bias Cross-Check: Cloudflare Workers + Pages

### Devil's Advocate — Weaknesses

1. **The Free plan is a trap for SSR.** The 10ms CPU time limit per invocation is not sufficient for Astro SSR with React hydration and Supabase auth. The $5/month Paid plan is effectively mandatory from day one — a hidden cost that Cloudflare's marketing doesn't front-load.

2. **No `wrangler rollback` command exists.** Rollback requires `wrangler versions list` (returns UUID-based version IDs), then `wrangler versions deploy <ID>@100% -y`. Under incident pressure, this multi-step lookup adds material time compared to Vercel's single `vercel rollback` command.

3. **Environment variable access is non-standard and error-prone.** `process.env` is unavailable for Cloudflare bindings at runtime. `SUPABASE_URL` / `SUPABASE_KEY` must use `astro:env/server`; Cloudflare-native bindings (KV, R2, D1) must use `Astro.locals.cfContext.env.*`. Mixing these two access patterns across files creates a class of runtime errors that only appear in production, not in local `astro dev`.

4. **`wrangler dev` and `astro dev` diverge at runtime.** `astro dev` runs Node.js; `wrangler dev` runs workerd. Node.js APIs that work in `astro dev` may silently fail in production. Accurate local testing requires `wrangler dev`, which is slower, less hot-reload-friendly, and more opaque than standard Astro development.

5. **Wrangler version gaps exist in the project today.** `wrangler deploy --temporary` (AI-agent-friendly deploy without credentials) requires `>=4.102.0`; the project pins `^4.90.0`. `@astrojs/cloudflare@^13.6.0` companion handlers are missed by the `^13.5.0` constraint. Small dependency drift creates a gap between what current docs describe and what the project can actually do.

### Pre-Mortem — How This Could Fail

The team deploys 10xCards to Cloudflare Workers on the Free plan, assuming the generous 100k daily request limit makes it effectively free. Within the first week, every second API call to the flashcard generation endpoint times out in production. Investigation reveals the Free plan's 10ms CPU limit is being hit — OpenRouter streaming response handling alone consumes 15ms of CPU before any template rendering.

They upgrade to Paid ($5/month) and timeouts stop. Two months later, a Supabase auth session bug in production cannot be reproduced locally because `astro dev` uses Node.js while production runs workerd. The developer spends two days bisecting the bug to discover that `@supabase/ssr@0.10.3` reads a cookie header differently under the workerd runtime — a documented quirk that never appeared in Node.js. The fix requires rewriting cookie handling to use `Astro.cookies` rather than the SSR helper directly.

At month three, a deploy introduces a regression. The developer reaches for `wrangler rollback` and finds it doesn't exist. They spend 20 minutes correlating `wrangler versions list` output (cryptic version UUIDs, no timestamps by default) to the broken deploy before managing to redeploy an older version. Meanwhile, the app serves a broken experience.

The cumulative lesson: workerd is a powerful runtime, but it is not Node.js, and the surface area of "works locally but fails in production" is meaningfully larger here than on a Node.js-based platform.

### Unknown Unknowns

- **Supabase JS client compatibility with workerd is not officially guaranteed.** `@supabase/supabase-js` uses `node:` APIs internally. The `nodejs_compat` flag (already set) covers most cases, but auth cookie handling and JWT validation touch APIs with subtle workerd vs Node.js behavioral differences that only surface under specific request patterns.

- **`wrangler.jsonc` and `astro.config.mjs` must stay in sync across three independent update tracks.** Cloudflare changes `compatibility_date` requirements, the adapter changes entrypoint paths, and wrangler changes which config keys are valid. Any of the three updating independently can break the build silently with no error message pointing to the version delta.

- **Workers bundling validates edge runtime compatibility at deploy time, not build time.** Some npm packages use Node.js-only constructs (`fs.readFileSync`, `os.cpus()`, `child_process`) that the bundler flags during `wrangler deploy`, not during `astro build`. Adding a library at implementation time may cause a silent build success followed by a cryptic deploy failure.

- **The Sessions KV namespace (`SESSION`) is auto-provisioned by the adapter on first deploy, but only the first deploy.** Renaming the project, rotating the KV binding name, or changing environments can cause sessions to stop persisting silently. The auto-provision behavior is adapter-version-specific and not prominently documented.

- **Cloudflare's free tier per-day request cap (100k/day) is not equivalent to 3M/month.** Traffic spikes — a social media mention, a brief viral moment — can exhaust the daily cap in minutes, causing rate-limiting for the remainder of that calendar day. This is structurally different from Vercel and Netlify, which cap monthly totals.

## Operational Story

- **Preview deploys**: Git-integrated via Cloudflare Pages. Every branch push creates a preview URL at `<branch>.<project>.pages.dev`. Preview deployments are public by default — protect with Cloudflare Access (Zero Trust, free tier) to prevent indexed or shared previews. Fork PRs from external contributors do not get preview deployments by default (requires explicit trust in Pages settings).

- **Secrets**: Environment variables are set per-environment (Preview / Production) in the Cloudflare Pages dashboard or via `wrangler secret put <KEY>` for Workers. `SUPABASE_URL` and `SUPABASE_KEY` are stored as encrypted secrets in the Cloudflare platform vault, injected at runtime via the `astro:env/server` interface. Rotation: update the secret in the dashboard, then trigger a redeploy. Secrets are never exposed in logs or dashboard outputs. Cloudflare-native bindings (KV, R2, D1) are configured in `wrangler.jsonc` as binding declarations, not as secret strings.

- **Rollback**: `npx wrangler versions list` → find the target version UUID → `npx wrangler versions deploy <VERSION-UUID>@100% -y`. Typical time-to-revert: 30–60 seconds once the correct version UUID is identified. **Important caveat**: Supabase database migrations do not roll back automatically — a code rollback that reverts schema-dependent logic while leaving a migration applied will cause silent data errors. Always maintain backward-compatible migrations during the rollback window.

- **Approval**: An agent may perform unattended: `wrangler deploy` (code deploy), `wrangler tail` (read-only log access), `wrangler versions list` (read-only), `wrangler secret put` (secret rotation with a known key). A human must perform: `wrangler secret delete` (destructive), D1 database destructive operations (`DROP TABLE`, data deletes), KV namespace deletion, rotating primary Supabase credentials, billing tier changes, and domain/DNS changes.

- **Logs**: `npx wrangler tail [WORKER_NAME] --format pretty` for live streaming with human-readable output. `npx wrangler tail --status error --search "TypeError"` to filter to errors. `npx wrangler tail --json | jq .event.request.url` for structured pipeline processing. Persistent log storage requires enabling Logpush (GA) in the Cloudflare dashboard → configured to R2, S3, or a SIEM.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Free plan 10ms CPU limit blocks SSR | Research finding | H | H | Deploy to Paid plan ($5/mo) from day one; do not use Free plan for SSR workloads |
| workerd ≠ Node.js causes production-only bugs | Devil's advocate | M | H | Run `wrangler dev` (not `astro dev`) for all auth and cookie-related testing; add workerd smoke test to CI |
| Supabase JS compatibility issues under workerd | Unknown unknowns | M | H | Test all auth flows (`login`, `logout`, `session refresh`) explicitly against `wrangler dev` before first production deploy; watch @supabase/ssr changelogs for workerd-specific fixes |
| No `wrangler rollback` command under incident pressure | Devil's advocate | M | M | Document the rollback procedure (`wrangler versions list` + `wrangler versions deploy`) in a runbook before go-live; pin version tags with `--message` at deploy time for easier identification |
| Wrangler version gap (^4.90.0 < 4.102.0) | Devil's advocate | M | L | Run `npm update wrangler` before first production deploy to resolve `^4.90.0` to latest; adds `--temporary` deploy and other AI-agent-friendly features |
| `wrangler.jsonc` / adapter / Cloudflare compat drift | Unknown unknowns | M | M | Lock `@astrojs/cloudflare` and `wrangler` in CI; add a compatibility smoke test that exercises the `nodejs_compat` flag on `wrangler dev` |
| Workers bundling fails on npm package with Node.js-only APIs | Unknown unknowns | L | M | Run `wrangler deploy --dry-run` in CI before merging new dependencies; review `node:` usage in any new library before adoption |
| Session KV namespace lost after project rename or binding rotation | Unknown unknowns | L | M | Document the `SESSION` binding name; include it in the deployment checklist; test session persistence after any wrangler.jsonc change |
| Free-tier daily request cap hit by traffic spike | Unknown unknowns | L | M | Upgrade to Paid plan ($5/mo) before any public launch or marketing event; set Cloudflare rate limiting rules to protect against bots consuming the free cap |
| Supabase migrations don't roll back with code rollback | Pre-mortem | M | H | Always write backward-compatible migrations (never `DROP COLUMN` without a code-driven migration window); maintain a 2-deploy compatibility window between schema change and code change |
| `@astrojs/cloudflare@^13.5.0` misses companion handlers (13.6.0+) | Research finding | M | L | Run `npm update @astrojs/cloudflare` to resolve to 13.6.0+; companion handlers improve routing pipeline middleware integration |

## Getting Started

1. **Upgrade wrangler and adapter** before deploying:
   ```bash
   npm update wrangler @astrojs/cloudflare
   ```
   Ensures wrangler resolves to ≥4.102.0 (enables `--temporary` deploy) and the adapter resolves to ≥13.6.0 (companion handlers).

2. **Set secrets in the Cloudflare dashboard** (Pages → Settings → Environment variables → Production):
   - `SUPABASE_URL` — your Supabase project URL
   - `SUPABASE_KEY` — your Supabase service role or anon key (server-only)
   - `OPENROUTER_API_KEY` — your OpenRouter API key
   Set the same values for Preview if you want preview environments to be functional.

3. **Build and deploy**:
   ```bash
   npm run build
   npx wrangler deploy
   ```
   The `astro build` step compiles to the Workers entrypoint defined in `wrangler.jsonc`. `wrangler deploy` uploads the bundle and returns a production URL.

4. **Verify the deploy and tail logs**:
   ```bash
   npx wrangler tail --format pretty --status error
   ```
   Open the production URL, perform a login → generation → review flow, and confirm no errors appear in the tail. A clean run with no error-level log lines indicates a healthy first deploy.

5. **Connect the Git repository to Cloudflare Pages** for automatic CI/CD: Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git → select `10xCards` → set build command `npm run build` and output directory `dist`. This wires every push to `master` into an automatic production deploy via the existing GitHub Actions pipeline (which already gates on lint + build).

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup beyond what Cloudflare Pages Git integration provides
- Production-scale architecture (multi-region, HA, DR)
- Cloudflare Workers for Platforms (multi-tenant isolation)
- Cost modeling beyond MVP scale (>1M requests/month)
