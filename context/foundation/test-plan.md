# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-11

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not layer
   an AI-native tool on top of a deterministic diff that already catches
   the regression.

2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X" carry the same weight as PRD lines or hot-spot data.

3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from the PRD,
   interview, and codebase _signal_ (git churn, structure, architecture).
   It does NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the ground
   truth.

Hot-spot scope used for likelihood weighting: `src`, `supabase` (git history:
last 30 days).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by risk
= impact × likelihood. Risks are failure scenarios in user / business terms,
not test names. The Source column cites the _evidence that surfaced this
risk_ — never a specific file as "where the failure lives."

| #   | Risk (failure scenario)                                                                            | Impact   | Likelihood | Source (evidence — not anchor)                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------- | -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | AI-generated cards are off-topic or nonsensical; user loses confidence, 75% acceptance rate missed | High     | High       | User Q1 + PRD success criterion (75% acceptance)                                                                                         |
| 2   | AI provider misconfigured (wrong model, missing credentials); feature silently broken at runtime   | High     | High       | User Q2 (past incident: "incorrect model used") + recent git history (S-03 revert/fix/revert 2026-09-11)                                 |
| 3   | Deck management (edit/delete) corrupts card state or loses data                                    | High     | Medium     | User Q3 ("deck management feels fragile") + hot-spot churn (src/components/deck: 5 commits/30d)                                          |
| 4   | Review session loses progress mid-session; user must restart (violates NFR: session durability)    | High     | Medium     | PRD §Non-Functional Requirements (session durability) + hot-spot churn (src/lib/services/review: 4 commits/3d; recent revert 2026-09-11) |
| 5   | SRS algorithm produces incorrect next-due dates; schedule regresses                                | High     | Medium     | PRD US-02 + recent git revert/fix cycle (2026-09-11)                                                                                     |
| 6   | RLS policies fail; user can access another user's deck (IDOR)                                      | Critical | Low        | Security lens: multi-user access control must be enforced from DB layer; PRD §Access Control                                             |

### Risk Response Guidance

| Risk | What would prove protection                                                                                       | Must challenge                                                                                                            | Context `/10x-research` must ground                                                                                                                   | Likely cheapest layer                                                                                                           | Anti-pattern to avoid                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| #1   | Each generated card's front is answerable from source text; back is factually grounded in source                  | "AI response is valid because it returns 200" — many APIs 200 with garbled or off-topic content                           | AI provider API contract, example valid/invalid responses, quality bar for "on-topic"                                                                 | Contract test (mock provider, verify response schema + semantic markers) + integration test (real API, sample text)             | Assert content matches implementation (tautology); not validating semantic link between front/back/source      |
| #2   | AI provider endpoint is reachable, credentials valid, response matches expected schema                            | "Build-time config is correct" — runtime mistakes (env vars unset, wrong key, stale token) slip through                   | How creds are loaded (env vars, Cloudflare secrets), endpoint URL, response schema, error/fallback path                                               | Smoke test (call real AI provider with minimal payload, verify schema + latency within SLA)                                     | Mocking the entire provider; relying on build-time checks only; not detecting stale credentials                |
| #3   | Card can be edited, saved, retrieved, deleted without affecting other cards or SRS schedule                       | "Happy-path works in dev" — edge cases like concurrent edits, deletion of reviewed cards, schedule orphaning slip through | Card table schema (esp. SRS fields: ease_factor, interval, repetitions), RLS policies, how delete cascades                                            | Integration test (create → edit → retrieve → delete; verify DB state and other cards unaffected; RLS boundary)                  | Testing only React state, not DB round-trip; not verifying other user's cards are unaffected                   |
| #4   | Session state survives browser refresh; card_order and due dates unchanged after reopen                           | "Answered cards are persisted to DB" — but if session state is in-memory, closing the browser loses it                    | Session state storage (DB vs. local storage), review API contract, card_order JSONB structure, fetching order                                         | Integration test (start → answer N cards → close → reopen; verify card_order, due dates, next card identity)                    | Testing only API response; not verifying round-trip persistence; not testing browser refresh                   |
| #5   | SM-2 formula produces correct interval given a sequence of answers (e.g., [pass, pass, fail] → specific interval) | "Formula looks right in code" — off-by-one errors, timezone, leap-year math, edge cases with extreme inputs               | SM-2 formula implementation, card schema (ease_factor, interval, repetitions, quality rating scale), test vectors with known correct outputs          | Unit test on SM-2 formula directly (call with known inputs, assert correct interval output; compare vs. reference test vectors) | Snapshot test of sequences; not validating formula independently; copying production calculation as the oracle |
| #6   | User A cannot query, edit, or delete User B's cards (RLS enforced at DB layer)                                    | "Auth middleware prevents access" — but if RLS policy is misconfigured, DB returns rows anyway                            | RLS policy definitions (per-operation: select/insert/update/delete, per-role), how Supabase SSR client uses policies, what fails if policy is missing | Integration test (auth as User A → try to query/edit/delete User B's deck → expect empty result or 403) + RLS policy audit      | Testing only middleware; not testing the DB boundary; mocking the Supabase client                              |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right as artifacts appear on disk; the
orchestrator updates Status and Change-folder cells.

| #   | Phase name                  | Goal                                                  | Risks covered | Test types             | Status        | Change folder                  |
| --- | --------------------------- | ----------------------------------------------------- | ------------- | ---------------------- | ------------- | ------------------------------ |
| 1   | Critical-path coverage      | Defend AI quality + provider config at cheapest layer | #1, #2        | contract + integration | change opened | testing-critical-path-coverage |
| 2   | Durability + access control | Protect deck mutations, session recovery, RLS         | #3, #4, #6    | integration            | completed     | durability-acces-control       |
| 3   | Algorithm correctness       | Prove SM-2 formula produces correct schedules         | #5            | unit                   | not started   | —                              |
| 4   | Quality gates               | Wire unit + integration tests into CI; lock floor     | cross-cutting | gates                  | not started   | —                              |

## 4. Stack

The test infrastructure available for this project. AI-native tools (if any)
carry a `checked:` date so future readers can verify which lines need
re-evaluation.

| Layer              | Tool / Status          | Version | Notes                                                         |
| ------------------ | ---------------------- | ------- | ------------------------------------------------------------- |
| unit + integration | None yet — see Phase 1 | —       | Will select and configure during Phase 1                      |
| contract mocking   | None yet — see Phase 1 | —       | Will evaluate MSW or equivalent for Phase 1                   |
| e2e                | None yet — deferred    | —       | Not in scope for MVP; add if critical flows fail to stabilize |
| API client mocking | None yet — see Phase 1 | —       | Needed for AI provider contract tests                         |

**Stack grounding tools (current session):**

- Docs: AGENTS.md present (hard rules, folder structure) — checked: 2026-09-11
- Search: Not used (Astro + Supabase stacks are well-documented; no bleeding-edge decisions)
- Runtime/browser: Not needed for business-logic tests
- Provider: Supabase (RLS policies will be verified during Phase 2)

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase <N>" means the gate is enforced once that rollout
phase lands.

| Gate                        | Where              | Required?                 | Catches                                  |
| --------------------------- | ------------------ | ------------------------- | ---------------------------------------- |
| lint + typecheck            | local + CI         | required (existing)       | syntactic / type drift                   |
| build                       | local + CI         | required (existing)       | compilation errors                       |
| unit + integration          | local + CI         | required after Phase 1    | logic regressions in AI + deck + session |
| contract test (AI provider) | local + CI         | required after Phase 1    | AI provider integration regressions      |
| e2e on critical flows       | CI on PR           | optional (post-MVP)       | broken critical user paths               |
| post-edit hook              | local (agent loop) | recommended after Phase 3 | regressions at edit time                 |

## 6. Cookbook Patterns

How to add new tests for this project. Each sub-section fills in as the
relevant rollout phase ships.

### 6.1 Adding a unit test

TBD — see §3 Phase 3.

### 6.2 Adding an integration test

TBD — see §3 Phase 1.

### 6.3 Adding a contract test (for AI provider or external APIs)

TBD — see §3 Phase 1.

### 6.4 Testing a new API endpoint

TBD — see §3 Phase 1.

### 6.5 Testing a new card operation (create, edit, delete, query)

TBD — see §3 Phase 2.

### 6.6 Per-rollout-phase notes

(Phase notes will accumulate here as each phase ships.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **UI visuals / styling** — visual QA is manual; snapshot tests are too
  brittle and catch nothing important. Re-evaluate if rendering logic
  starts to affect card content or session state. (Source: User Q5.)
- **Astro SSR rendering** — the framework is trusted; our code doesn't
  modify the rendering pipeline. Unit test the component logic, not the
  framework. (Source: Strategy §1 — cost × signal.)
- **Supabase client library itself** — shipped, stable, tested upstream.
  Test only our schema and RLS policies, not the SDK. (Source: Strategy §1.)

## 8. Freshness Ledger

- **Strategy (§1–§5) last reviewed: 2026-09-11
- **Stack versions last verified: 2026-09-11
- **Phase 2 completed: 2026-09-13** (durability-acces-control archived)
- **AI-native tool references last verified: N/A (not in scope for Phase 1)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or completed slices,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
