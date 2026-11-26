# Sidekick — Personal AI Workspace

Sidekick is a personal AI workspace for software development, research, learning, and project planning.

## Current status

**Foundation milestone in progress.** The repository contains the initial Next.js application, a central OpenAI Responses API service, a chat interface, request validation, and a Supabase SQL migration defining user-owned conversations, messages, projects, tasks, approvals, and audit history. Supabase authentication screens, cookie-based sessions, and server-side chat authentication are implemented in code. The app includes conversation persistence, saved-memory management, and an approval inbox with payload-hash checks. It is not connected to a live Supabase project yet, so database-backed features cannot run until the project is configured and the migration is applied. Hosted web search can be enabled with a supported model. Read-only GitHub repository inspection is available when a server-side token is configured. GitHub writes and actual action execution remain unimplemented. Approving a proposal only records the decision.

## Stack

- Next.js App Router and TypeScript
- Tailwind CSS v4
- OpenAI Responses API
- Supabase Auth and Postgres (integration code and initial migration drafted; live project setup pending)
- Optional hosted web search through the Responses API
- Optional read-only GitHub API integration

## Getting started

Requirements: Node.js 20.9+ and npm.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Create a Supabase project, then run `supabase/migrations/0001_initial_schema.sql` in its SQL editor. In Supabase Auth settings, enable email/password sign-in and set the Site URL to your app origin. Add the project URL and publishable key to `.env.local`. Set `SUPABASE_SERVICE_ROLE_KEY` to the project's service-role secret in the server environment only. Optionally add a fine-grained `GITHUB_TOKEN` with read-only access to the repositories you want Sidekick to inspect. Never expose that key with a `NEXT_PUBLIC_` prefix. For local development, allow `http://localhost:3000/auth/callback` as an auth redirect URL.

4. Add an OpenAI API key to `.env.local`. The default model below keeps hosted web search disabled:

   ```env
   OPENAI_API_KEY=your_key_here
   OPENAI_MODEL=gpt-4.1-mini
   ENABLE_WEB_SEARCH=false
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open http://localhost:3000.

For hosted web search, switch to a supported model such as `gpt-6.2-astra` and set `ENABLE_WEB_SEARCH=true`. This uses hosted web search and may add API usage costs.

## Available scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript validation
- `npm run test` — unit tests

## Security notes

- Keep API keys in server-side environment variables. Never commit `.env.local`.
- The chat endpoint verifies the signed-in user, validates request size, and applies a database-backed limit of 20 chat requests per user per minute.
- Chat turns are stored in owner-scoped conversations. The server loads prior history from the database rather than trusting browser-supplied assistant messages. OpenAI requests use `store: false` and a bounded timeout/output size.
- Saved memory is loaded as background context. The assistant only writes a memory when the user explicitly asks.
- External actions can be proposed through function calling. Proposals are payload-hashed, audited, and require a user decision. Approval does not execute them.
- The migration has not been applied to a live database or tested against real users. GitHub write operations, project/task CRUD, and actual action execution remain unimplemented. Do not expose this as a public multi-user service until database setup, tests, and security checks are complete.

## Roadmap

1. Application foundation and AI chat
2. Connect Supabase and verify account creation, sign-in, and RLS isolation
3. Add project/task CRUD and document retrieval
4. GitHub write operations behind verified approvals and better research workflows
5. Controlled action execution behind verified approvals
6. Tests, observability, and deployment hardening

## Architecture and security notes

See [`docs/architecture.md`](docs/architecture.md) for the system design and [`docs/security-model.md`](docs/security-model.md) for tool risk classes, approval lifecycle, and execution boundaries.

## Project principles

- One central assistant before adding specialist agents.
- Read and prepare before executing.
- Ask for explicit approval before consequential actions.
- Verify outcomes; never report unperformed work as complete.
