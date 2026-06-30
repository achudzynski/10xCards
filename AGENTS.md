# Repository Guidelines

10xCards is an Astro 6 SSR application with React 19 islands, Tailwind 4, Supabase cookie-based auth, and shadcn/ui components, deployed to Cloudflare Workers.

## Hard Rules

- **API routes must export `const prerender = false`** — the app runs in full SSR mode (`output: "server"`); omitting this export causes build failures.
- **Use `cn()` from `@/lib/utils` for all Tailwind class merging** — never concatenate class strings manually.
- **No Next.js directives** — do not add `"use client"` or `"use server"` to any file.
- **Use Astro components for layout and static content; React components only when the section requires interactivity.**
- **Every new Supabase table must enable RLS** with per-operation, per-role policies defined in the same migration file.
- **API errors must use `{ error: { code, message, context } }`**, never `{ error: string }`; keep the envelope consistent across routes and callers.

## Security & Configuration

- Local dev: copy `.env.example` → `.dev.vars` (Cloudflare workerd) or `.env` (Node). Both files are gitignored.
- `SUPABASE_URL` and `SUPABASE_KEY` are server-only secrets declared via `astro:env` in `astro.config.mjs` — they are never available on the client.
- Add protected routes by appending their paths to `PROTECTED_ROUTES` in `src/middleware.ts`.

## Project Structure

- `src/layouts/` — Astro layouts
- `src/pages/` — SSR pages; `api/` for API endpoints, `auth/` for auth pages
- `src/components/` — Astro and React components; `ui/` for shadcn/ui; `hooks/` for React hooks
- `src/lib/` — Supabase client (`supabase.ts`), utilities (`utils.ts`), `services/` for extracted business logic
- `src/middleware.ts` — resolves auth user on every request, guards `PROTECTED_ROUTES`
- `src/types.ts` — shared entities and DTOs
- `supabase/migrations/` — SQL migrations named `YYYYMMDDHHmmss_description.sql`

Path alias `@/*` resolves to `./src/*` — see `@tsconfig.json`.

## Build, Dev, and Lint Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build; requires `SUPABASE_URL` and `SUPABASE_KEY` in environment
- `npm run lint` — ESLint with type-checked rules (CI gate)

See @package.json scripts for the full list.

CI (`@.github/workflows/ci.yml`) runs `astro sync → lint → build` on every push and PR to `master`.

## Coding Conventions

- shadcn/ui components live in `src/components/ui/` ("new-york" variant). Install new ones with `npx shadcn@latest add [name]`; do not hand-craft them.
- API route handlers export uppercase method names (`GET`, `POST`) and validate input with zod.
- React hooks go in `src/components/hooks/`; services and helpers go in `src/lib/` or `src/lib/services/`.
- Shared types (entities, DTOs) belong in `src/types.ts`.

## Commit & Pull Request Guidelines

No commit history yet — convention to be established. CI requires `lint` and `build` to pass before merging to `master`.
