# Sidekick — Personal AI Workspace

Sidekick is a personal AI workspace for software development, research, learning, and project planning.

## Current status

**Foundation milestone in progress.** The repository contains the initial Next.js application, a central OpenAI Responses API service, a chat interface, request validation, and a Supabase SQL migration defining user-owned conversations, messages, projects, tasks, approvals, and audit history. Supabase authentication screens, cookie-based sessions, and server-side chat authentication are implemented in code. The app includes conversation persistence routes and a recent-conversation interface. It is not connected to a live Supabase project yet, so database-backed features cannot run until the project is configured and the migration is applied. Research/GitHub integrations and action execution remain unimplemented.

## Stack

- Next.js App Router and TypeScript
- Tailwind CSS v4
- OpenAI Responses API
- Supabase Auth and Postgres (integration code and initial migration drafted; live project setup pending)
- GitHub integration (planned)

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

3. Create a Supabase project, then run `supabase/migrations/0001_initial_schema.sql` in its SQL editor. In Supabase Auth settings, enable email/password sign-in and set the Site URL to your app origin. Add the project URL and publishable key to `.env.local`. Set `SUPABASE_SERVICE_ROLE_KEY` to the project's service-role secret in the server environment only. Never expose that key with a `NEXT_PUBLIC_` prefix. For local development, allow `http://localhost:3000/auth/callback` as an auth redirect URL.

4. Add an OpenAI API key to `.env.local`:

   ```env
   OPENAI_API_KEY=your_key_here
   OPENAI_MODEL=gpt-4.1-mini
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open http://localhost:3000.

## Available scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript validation

## Security notes

- Keep API keys in server-side environment variables. Never commit `.env.local`.
- The chat endpoint verifies the signed-in user and validates message shape, count, total content, and request size.
- Chat turns are stored in owner-scoped conversations. Assistant messages are inserted through a server-only service-role client; browser clients cannot create assistant messages. OpenAI requests use `store: false`.
- The migration has not been applied to a live database or tested against real users. The rate-limit function and memory storage are included in the migration but still need live-database testing. Research/GitHub integrations and action execution remain unimplemented. Do not expose this as a public multi-user service until these controls are added and tested.

## Roadmap

1. Application foundation and AI chat
2. Connect Supabase and verify account creation, sign-in, and RLS isolation
3. Add project/task CRUD and document retrieval
4. Read-only GitHub and web research tools
5. Approval queue and controlled action execution
6. Tests, observability, and deployment hardening

## Architecture and security notes

See [`docs/architecture.md`](docs/architecture.md) for the system design and [`docs/security-model.md`](docs/security-model.md) for tool risk classes, approval lifecycle, and execution boundaries.

## Project principles

- One central assistant before adding specialist agents.
- Read and prepare before executing.
- Ask for explicit approval before consequential actions.
- Verify outcomes; never report unperformed work as complete.
