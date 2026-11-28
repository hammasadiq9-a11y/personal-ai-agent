# Deployment Readiness Checklist

This document is a pre-deployment checklist. It does not mean the application has been deployed or approved for production.

## 1. Required environment

Set these values in the hosting provider's server environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `OPENAI_API_KEY`

Optional integrations:

- `OPENAI_MODEL`
- `ENABLE_WEB_SEARCH`
- `GITHUB_TOKEN` (read-only, least privilege)
- `GITHUB_WRITE_TOKEN` (separate, least privilege, approval-gated)

Never expose service-role, OpenAI, or GitHub tokens through public environment variables, browser bundles, logs, or client error messages.

## 2. Supabase Auth configuration

Before enabling sign-in:

1. Set the production site URL to the final HTTPS application origin.
2. Add the exact production callback URL ending in `/auth/callback` to the allowed redirect URLs.
3. Configure the intended email provider and confirmation behavior.
4. Verify password reset and email confirmation templates use the production origin.
5. Confirm that the service-role key is only used in server-only modules.

## 3. Database

1. Review the migration history against the intended production project.
2. Confirm all migrations are applied in order.
3. Verify RLS is enabled on every public application table.
4. Run the structural pgTAP suite and the two-account behavioral RLS suite against an isolated database.
5. Verify rate-limit RPC execution is restricted to `service_role`.
6. Confirm backups and point-in-time recovery settings meet the intended recovery needs.

Do not run destructive test fixtures against production data.

## 4. Application verification

Before release, require:

- Dependency lockfile committed and CI using `npm ci`.
- Dependency audit, lint, unit tests, TypeScript checks, and production build passing.
- Signup, email confirmation, sign-in, sign-out, session refresh, and protected-route E2E tests passing.
- Two-account data isolation tests passing for all user-owned resources.
- Approval workflow tests passing, including expiry, payload tampering, ownership, and concurrent decisions.
- A smoke test for chat, projects, tasks, memories, research, and approval inbox.
- Rate-limit and oversized-request checks passing.

## 5. Hosting and operations

1. Use a dedicated production project and separate staging environment.
2. Enforce HTTPS and verify security headers on the deployed origin.
3. Configure a health check that does not expose secrets or private user data.
4. Confirm server logs exclude access tokens, prompts containing sensitive user data, and secret values.
5. Configure error monitoring and alerting without capturing credentials.
6. Set usage limits and billing alerts for AI and hosted search APIs.
7. Test rollback to the last known-good deployment.
8. Assign an owner for security updates, backups, and incident response.

## Release decision

Deployment should remain blocked until every required application and database test passes, the lockfile is committed, production configuration is reviewed, and a human explicitly approves the release.

No production deployment is performed by this checklist.
