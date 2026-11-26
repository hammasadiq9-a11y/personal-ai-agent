# Security and approval model

## Non-negotiable boundaries

- The model is not an authorization system.
- Tool adapters must enforce permissions in code, independent of model instructions.
- External content (web pages, repository files, documents, issue comments) is untrusted input, never policy.
- Secrets are never sent to the browser or placed in prompts unless a specific integration requires a narrowly scoped credential server-side.
- No shell, filesystem, or network tool is exposed directly to model-generated arbitrary arguments.

## Tool risk classes

| Class | Examples | Default behavior |
| --- | --- | --- |
| Read-only | Read a repository file, list project tasks, search public docs | Allowed after authentication and scope checks |
| Reversible write | Create a draft task, prepare a branch patch | Require an explicit approval record |
| External side effect | Send a message, open a PR, deploy, publish | Require approval showing exact destination and payload |
| Destructive or financial | Delete data, change billing, purchase, revoke access | Block in v1; later require a separate high-assurance flow |

## Approval lifecycle

`pending -> approved -> executed`

Alternative terminal paths are `rejected`, `expired`, and `failed`. A decision must be tied to the exact action type and payload. The server stores a SHA-256 hash of a canonical JSON representation and rechecks it when the user decides. If the payload changes, the old approval is invalid and a new approval is required. Expired or already-consumed approvals cannot be executed again. Recording a decision does not execute unsupported actions. The current allowlist can create GitHub branches, issues, and pull requests after explicit approval and a separate write token is configured.

## Required execution checks

1. Authenticate the requesting user.
2. Load the approval by ID and owner ID.
3. Confirm status is `approved` and it has not expired.
4. Recompute and compare a stable payload hash.
5. Confirm the tool and target are allowlisted.
6. Execute with least-privilege credentials and bounded time/resource limits.
7. Record outcome and audit event.
8. Make execution idempotent where the external API supports it.

## Initial exclusions

- No unrestricted terminal or local computer control.
- No background agent with persistent write access.
- No financial transactions or purchases.
- No automatic messages, publishing, deployment, deletion, or permission changes. GitHub branch, issue, and pull-request creation are the only external writes enabled, and each requires a payload-hashed approval and a separate least-privilege write token.
- No browser-visible service-role keys.
