# Sidekick architecture

## Product shape

Sidekick is a personal AI workspace for software development, research, learning, planning, and controlled execution. The first release is a single assistant with focused tools, not a network of autonomous agents.

## Current implementation

- Next.js App Router and TypeScript provide the web application and server routes.
- The chat route calls the OpenAI Responses API from the server.
- The browser currently holds the active conversation in React state only.
- The initial navigation and project cards are UI scaffolding.
- Supabase schema is defined in `supabase/migrations/0001_initial_schema.sql`; the application is not yet connected to it.

## Target architecture

1. **Web client**: chat, project workspace, conversation history, task list, and approval inbox.
2. **Application API**: authenticated routes, input validation, per-user quotas, and orchestration.
3. **Agent core**: model instructions, context assembly, tool selection, and response formatting.
4. **Tool adapters**: read-only GitHub, web research, and document parsing first. Write-capable adapters are added only behind approval checks.
5. **Data layer**: Supabase Auth and Postgres with row-level security.
6. **Execution boundary**: isolated, short-lived workers for code or file operations. Never execute model-generated commands directly on the web server.

## Data ownership

Every user-owned record carries a `user_id` linked to Supabase Auth. RLS policies restrict browser access to rows owned by the authenticated user. Messages are additionally tied to a conversation and the same user. Project tasks use a composite foreign key so a task cannot be attached to another user's project.

Approval records are readable by their owner, but browser clients cannot directly approve, reject, or execute actions. The trusted server validates the current user, verifies the pending approval, checks the action's allowed scope, records the decision, and writes an audit event.

Audit history is intentionally read-only to browser clients. Server-side writes must use a service-role key kept only in server environment variables.

## Autonomy model

- **Read**: low-risk retrieval such as listing project metadata or reading repository files.
- **Prepare**: create a plan, draft a change, or produce a proposed patch without applying it.
- **Approve**: present the exact action, target, and relevant diff or payload to the user.
- **Execute**: perform only the approved action, with an allowlisted adapter and scoped credentials.
- **Verify**: inspect the result and record success or failure.

Approval must be specific to an action and payload. A broad instruction such as "do everything" does not authorize unrelated purchases, public communications, destructive operations, secret disclosure, or changes to external accounts.

## Security requirements before public deployment

- Add Supabase Auth and enforce authentication on every private route.
- Keep OpenAI and Supabase service-role credentials server-side.
- Add persistent per-user rate limiting and usage limits.
- Validate request schemas and impose request/body size limits.
- Add CSRF/origin protections where cookie-based auth is used.
- Keep tool permissions deny-by-default.
- Never expose raw provider errors, secrets, or internal stack traces to clients.
- Add audit records for approvals and all write-capable tool actions.
- Add tests for RLS ownership boundaries and approval transitions.
- Do not deploy as a multi-user service until these controls are implemented and tested.

## Delivery sequence

1. Foundation and basic chat.
2. Supabase Auth, profiles, and persistent conversations.
3. Project and task management with owner isolation.
4. Read-only GitHub and web research.
5. Approval queue and audited action execution.
6. Isolated execution, observability, tests, and deployment hardening.
