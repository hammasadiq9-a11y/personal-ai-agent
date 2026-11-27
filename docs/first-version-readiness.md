# First Version: Scope and Readiness

## Intended first release

The first version is a private personal AI workspace, not a public multi-tenant SaaS product.

### Included

- Supabase account authentication and a protected workspace.
- Private assistant conversations and saved message history.
- User-owned projects and tasks.
- A Knowledge area for saved memories.
- An approval inbox for supported GitHub write proposals.
- Read-only GitHub lookups when a read token is configured.
- Approval-gated GitHub operations limited to the allowlisted actions in the security model.
- A Research prompt workspace that routes questions through the assistant. Live web search is optional and must be configured.
- A signed-in integration-status view that reports whether core services are configured without returning secret values.

### Verified so far

- All nine public application tables have row-level security enabled.
- Structural and behavioral database tests pass: 53 pgTAP checks, including two-account isolation.
- CI uses the committed npm lockfile with `npm ci`.
- Dependency audit, lint, unit tests, TypeScript checks, and the production build pass in CI.
- A local Supabase integration smoke test passes for signup, sign-in, sign-out, protected workspace access, status, projects, tasks, and memories.
- Approval-route unit tests cover ownership, expiry, payload integrity, and concurrent decisions.

## Still required before a private production deployment

1. Browser-level testing of email confirmation, session refresh, sign-in/sign-out, and protected navigation.
2. End-to-end checks for chat, research, approval creation/decision, and GitHub integration using dedicated test credentials.
3. Production Supabase URL and keys configured in the hosting provider, with exact Auth redirect URLs.
4. OpenAI key and optional GitHub tokens configured server-side with least privilege.
5. Production deployment, HTTPS/header verification, monitoring, backup/recovery settings, usage limits, and rollback check.
6. A final human review and explicit release approval.

## Boundaries

- The first release does not run autonomous background tasks.
- GitHub writes remain approval-gated and limited to the supported actions.
- It does not deploy repositories, merge pull requests, delete repositories, change permissions, or send messages.
- The Research workspace does not claim live research when web search is disabled.
- No production deployment or PR merge is performed as part of this checklist.

A green CI run is strong evidence that the tested code and database controls work. It is not, by itself, proof that production configuration, monitoring, backups, or real-user browser flows are ready.
