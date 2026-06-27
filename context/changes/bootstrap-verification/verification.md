---
bootstrapped_at: 2026-06-21T20:30:14Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: 10x-cards
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10x-cards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

A solo team shipping a 3-week web MVP with auth and AI generation needs a starter that is opinionated, typed, and easy for an agent to reason about without extra setup. 10x Astro Starter is the recommended default for `(web-app, js)` and covers auth, database, and edge deployment in one cohesive stack, which keeps scaffolding and early iteration straightforward. Cloudflare Pages matches the starter's default deployment target, GitHub Actions fits the default CI path, and the confidence level is strong enough to expect mostly smooth bootstrapper output with only light manual follow-up.

## Pre-scaffold verification

| Signal | Value | Severity | Notes |
| --- | --- | --- | --- |
| npm package | not run | n/a | `cmd_template` starts with `git clone`, so no npm package was derived |
| GitHub repo | not run | n/a | `gh api repos/przeprogramowani/10x-astro-starter` failed because `gh` is not installed |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`  
**Strategy**: git-clone  
**Exit code**: 0  
**Files moved**: 20 top-level items  
**Conflicts (.scaffold siblings)**: `.github -> .github.scaffold`  
**.gitignore handling**: moved silently  
**.bootstrap-scaffold cleanup**: deleted

**Move log**
- conflict `.github` -> `.github.scaffold`
- moved `.husky`
- moved `.vscode`
- moved `node_modules`
- moved `public`
- moved `src`
- moved `supabase`
- moved `.env.example`
- moved `.gitignore`
- moved `.nvmrc`
- moved `.prettierrc.json`
- moved `astro.config.mjs`
- moved `CLAUDE.md`
- moved `components.json`
- moved `eslint.config.js`
- moved `package-lock.json`
- moved `package.json`
- moved `README.md`
- moved `tsconfig.json`
- moved `wrangler.jsonc`

## Post-scaffold audit

**Tool**: `npm audit --json`  
**Exit code**: 1  
**Raw output**: captured in `audit.json` (JSON) and `audit.stderr.txt` (warnings)  
**Summary**: 0 CRITICAL, 6 HIGH, 10 MODERATE, 2 LOW  
**Direct vs transitive**: 0/1/3/0 direct of total 0/6/10/2 (computed from `package.json` membership; npm audit does not emit a direct-total field)

#### CRITICAL findings

none

#### HIGH findings

- `astro` v`<=7.0.0-alpha.1` — advisory `1120912` — direct — reflected XSS, unescaped attribute names, and host-header SSRF; fix available.
- `devalue` v`5.6.3 - 5.8.0` — advisory `1120448` — transitive — DoS via sparse array deserialization; fix available.
- `miniflare` v`<=0.0.0-fff677e35 || 3.20250204.0 - 4.20260616.0` — transitive — `undici > ws`; fix available.
- `undici` v`7.0.0 - 7.27.2` — advisory `1121187` — transitive — TLS validation bypass, cross-user disclosure, and header injection; fix available.
- `vite` v`7.0.0 - 7.3.3` — advisory `1120785` — transitive — Windows UNC path handling and `server.fs.deny` bypass; fix available.
- `ws` v`8.0.0 - 8.20.1` — advisory `1119108` — transitive — uninitialized memory disclosure and memory-exhaustion DoS; fix available.

#### MODERATE findings

- `@astrojs/check` v`>=0.9.3` — direct — `via @astrojs/language-server`; fix available (`0.9.2`).
- `@astrojs/language-server` v`>=2.14.0` — transitive — `via volar-service-yaml`; fix available (`0.9.2`).
- `@cloudflare/vite-plugin` v`<=0.0.0-fff677e35 || 0.0.7 - 1.41.0` — transitive — `miniflare > wrangler > ws`; fix available.
- `js-yaml` v`<=4.1.1` — transitive — advisory `1120792` — quadratic-complexity DoS in merge key handling; fix available.
- `supabase` v`1.1.6 - 2.98.2` — direct — `via tar`; fix available.
- `tar` v`<=7.5.15` — transitive — advisory `1120782` — tar parser interpretation differential / file smuggling; fix available.
- `volar-service-yaml` v`<=0.0.70` — transitive — `via yaml-language-server`; fix available (`0.9.2`).
- `wrangler` v`<=0.0.0-kickoff-demo || 3.108.0 - 4.101.0` — direct — `via esbuild > miniflare`; fix available.
- `yaml` v`2.0.0 - 2.8.2` — transitive — advisory `1115556` — stack overflow via deeply nested YAML collections; fix available (`0.9.2`).
- `yaml-language-server` v`1.11.1-08d5f7b.0 - 1.21.1-f1f5a94.0 || 1.22.1-0ae5603.0 - 1.22.1-fc5f874.0` — transitive — `via yaml`; fix available (`0.9.2`).

#### LOW / INFO findings

- `@babel/core` v`<=7.29.0` — transitive — advisory `1120793` — arbitrary file read via `sourceMappingURL` comments; fix available.
- `esbuild` v`0.27.3 - 0.28.0` — transitive — advisory `1120680` — arbitrary file read on Windows dev servers; fix available.

## Hints recorded but not acted on

| Hint | Value |
| --- | --- |
| bootstrapper_confidence | first-class |
| quality_override | false |
| path_taken | standard |
| self_check_answers | null |
| team_size | solo |
| deployment_target | cloudflare-pages |
| ci_provider | github-actions |
| ci_default_flow | auto-deploy-on-merge |
| has_auth | true |
| has_payments | false |
| has_realtime | false |
| has_ai | true |
| has_background_jobs | false |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
