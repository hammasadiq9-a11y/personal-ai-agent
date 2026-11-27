# Personal AI Workspace

A private AI workspace for software development, research, learning, and project planning.

## Current status

The application foundation and Supabase integration are implemented. The repository includes account authentication, private conversations, saved memories, projects, tasks, an approval inbox, audit events, and a central OpenAI Responses API assistant.

The Supabase project has been created, all three SQL migrations have been applied, and the database schema and row-level security policies have been inspected. Table-level RLS is enabled throughout the public application schema; cross-account integration tests are still outstanding. The application is **not yet production-ready**: end-to-end authentication and data-isolation tests, a dependency lockfile, deployment configuration, and final operational verification remain outstanding.

The Research navigation item is currently a placeholder. Research questions can be sent through Assistant; the dedicated Research workspace has not been implemented.

## Stack

- Next.js App Router, React, and TypeScript
- Tailwind CSS v4
- OpenAI Responses API
- Supabase Auth and Postgres
- Optional hosted web search through the Responses API
- Optional read-only GitHub API integration
- Approval-gated GitHub writes

## Getting started

Requirements: Node.js 22 and npm.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env.local
   ```

3. Configure the Supabase project values:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

   Keep the service-role key server-side only. Never use a `NEXT_PUBLIC_` prefix for it.

4. Configure `OPENAI_API_KEY` for AI chat. Optionally set `OPENAI_MODEL` and `ENABLE_WEB_SEARCH`. Hosted web search may add API usage costs.

5. In Supabase Auth, enable the sign-in method you intend to use and configure the application origin and callback URL. The local callback URL is `http://localhost:3000/auth/callback`.

6. Start the development server:

   ```bash
   npm run dev
   ```

7. Open `http://localhost:3000`.

Optional GitHub integration:
- `GITHUB_TOKEN`: read-only access to repositories the assistant may inspect.
- `GITHUB_WRITE_TOKEN`: separate least-privilege token for the explicitly approval-gated operations. Limit it to selected repositories and only the required Contents, Issues, and Pull requests permissions.

Do not paste secrets into chat, commit them, or place them in client-side variables.

## Database

Migrations are in `supabase/migrations/`:

- `0001_initial_schema.sql`
- `0002_harden_schema.sql`
- `0003_lock_down_rate_limit_storage.sql`

They define the user-owned application tables, row-level security policies, and server-side rate-limit function. The `api_rate_limits` table intentionally has no authenticated-user policy; it is accessed by the server using the service-role client.

## Available scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript validation
- `npm run test` — Vitest unit tests

## Security boundaries

- API routes verify the signed-in user and scope user-owned records to that account.
- Request JSON is read with a streaming byte limit before it is buffered and parsed.
- Chat usage is limited to 20 requests per user per minute through a database-backed function.
- OpenAI requests use `store: false`, bounded timeouts, and output limits.
- GitHub writes are limited to creating `agent/*` branches, committing files on `agent/*` branches, creating issues, and creating pull requests from `agent/*` branches.
- GitHub write proposals are payload-hashed, expire after 24 hours, and require an explicit user decision. No deployment, merge, delete, permission-change, or messaging actions are enabled.
- Saved memory is only written when the user explicitly requests it.

These controls reduce risk but do not replace independent security testing. Do not expose the application as a public multi-user service until the remaining tests and deployment hardening are complete.

## Roadmap

1. Application foundation and AI chat
2. Supabase integration and RLS verification
3. Functional and security test coverage
4. Dedicated research and document workflows
5. Dependency reproducibility, observability, and deployment hardening

See [docs/architecture.md](docs/architecture.md) and [docs/security-model.md](docs/security-model.md) for additional design details.
