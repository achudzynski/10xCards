---
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
---

## Why this stack

A solo team shipping a 3-week web MVP with auth and AI generation needs a starter that is opinionated, typed, and easy for an agent to reason about without extra setup. 10x Astro Starter is the recommended default for `(web-app, js)` and covers auth, database, and edge deployment in one cohesive stack, which keeps scaffolding and early iteration straightforward. Cloudflare Pages matches the starter's default deployment target, GitHub Actions fits the default CI path, and the confidence level is strong enough to expect mostly smooth bootstrapper output with only light manual follow-up.
