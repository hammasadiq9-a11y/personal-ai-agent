# Sidekick — Personal AI Workspace

Sidekick is a personal AI workspace for software development, research, learning, and project planning.

## Current status

**Foundation milestone in progress.** The repository currently contains the initial Next.js application, a central OpenAI Responses API service, and a chat interface. Project navigation is an early UI scaffold; persistent memory, integrations, and action approvals are planned work, not implemented features yet.

## Stack

- Next.js App Router and TypeScript
- Tailwind CSS v4
- OpenAI Responses API
- Supabase (planned for persistent data and authentication)
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

3. Add an OpenAI API key to `.env.local`:

   ```env
   OPENAI_API_KEY=your_key_here
   OPENAI_MODEL=gpt-4.1-mini
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open http://localhost:3000.

## Available scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript validation

## Security notes

- Keep API keys in server-side environment variables. Never commit `.env.local`.
- The chat endpoint validates message shape and length.
- API responses are not stored by the OpenAI request (`store: false`).
- Authentication, per-user rate limits, durable memory, tool permission checks, and audit logs are not implemented yet. Do not expose this initial scaffold as a public multi-user service until those controls are added.

## Roadmap

1. Application foundation and AI chat
2. User authentication and persistent conversations
3. Project memory and document retrieval
4. Read-only GitHub and web research tools
5. Approval queue and controlled action execution
6. Tests, observability, and deployment hardening

## Project principles

- One central assistant before adding specialist agents.
- Read and prepare before executing.
- Ask for explicit approval before consequential actions.
- Verify outcomes; never report unperformed work as complete.
