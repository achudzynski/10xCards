# 10xCards — Operational Runbook

## Rollback Procedure

List versions with timestamps:
```bash
npx wrangler versions list --json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); d.forEach(v=>console.log(v.id, v.metadata?.created_on, v.annotations?.['workers/message']))"
```

Deploy a specific previous version:
```bash
npx wrangler versions deploy <PREV-UUID>@100% -y
```

Restore after drill:
```bash
npx wrangler deploy --message "rollback-drill-restore"
```

## Log Tailing

Tail errors only (production):
```bash
npx wrangler tail 10xcards --format pretty --status error
```

Tail all logs as JSON (pipe to jq for filtering):
```bash
npx wrangler tail 10xcards --format json | jq '.exceptions[], .logs[] | select(.level == "error")'
```

## Secret Rotation

Secrets are set per-environment. After rotating a key:

1. Update the secret in Cloudflare Workers:
   ```bash
   npx wrangler secret put <SECRET_NAME>
   ```
2. If using Cloudflare Pages, also update in:
   Pages → Settings → Environment variables (separate secret store from Workers).
3. Redeploy to pick up the new value:
   ```bash
   npx wrangler deploy --message "secret-rotation-<KEY_NAME>"
   ```

## KV / Session Binding Note

The Workers KV binding is named **`SESSION`** in `wrangler.jsonc`. **Do not rename it.**
Renaming the binding name deletes the association to the existing namespace — all live sessions will
be invalidated and users will be signed out. If a rename is unavoidable, add the new binding
alongside the old one and migrate data first.

## Supabase Migration Compatibility Window

Never deploy a schema change that is incompatible with the **previous** app version.
The safe window is **2 deploys**:

1. Deploy migration (schema change) — old app still works
2. Deploy app (code change consuming new schema) — migration already applied

Rollback is only safe within this window. Destructive migrations (column drops, type changes)
cannot be rolled back via `wrangler versions deploy` because the database change persists.
For destructive changes: add a new column, migrate data, deploy app, then drop old column.

## Daily Request Cap Warning

Cloudflare Workers **Free plan** allows **100,000 requests/day**, not 3 million/month.
Bursts above 100k/day are throttled, not billed.

Upgrade to the **Paid plan ($5/month)** before public launch:
Cloudflare Dashboard → Workers & Pages → Plan → Upgrade.

The Paid plan also raises the CPU limit from 10ms to 30s, which is required for OpenRouter
streaming responses under real load.

## wrangler.jsonc / astro.config.mjs / @astrojs/cloudflare Lock Policy

These three are tightly coupled and **must always be updated together**:

| File | Field |
|------|-------|
| `package.json` | `wrangler` and `@astrojs/cloudflare` version pins |
| `wrangler.jsonc` | `compatibility_date`, `compatibility_flags` |
| `astro.config.mjs` | `adapter: cloudflare()` options |

**Never update one in isolation.** A `wrangler` version bump without an `@astrojs/cloudflare`
bump (or vice versa) can cause silent runtime mismatches between the local workerd version used
by `wrangler dev` and the adapter's bundling assumptions.

After any update: run `npm run build && npx wrangler deploy --dry-run --outdir dist` before merging.
