import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPayload } from "@/lib/security/payload-hash";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  executeApprovedGitHubAction: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/tools/github-actions", () => ({
  executeApprovedGitHubAction: mocks.executeApprovedGitHubAction,
  isSupportedGitHubAction: vi.fn(() => true),
}));

import { PATCH } from "./route";

const approvalId = "d4e8a3b1-8c2f-4f9a-9b2d-2c6e4f7a1b90";
const signedInUser = { id: "11111111-2222-4333-8444-555555555555" };
const payload = { owner: "example", repo: "demo", branch: "agent/test" };
const pendingApproval = {
  id: approvalId,
  action_type: "github.create_branch",
  summary: "Create a branch",
  payload,
  payload_hash: hashPayload(payload),
  status: "pending",
  expires_at: new Date(Date.now() + 60_000).toISOString(),
};

function makeRequest() {
  return new Request("https://local.test/api/approvals/" + approvalId, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "approve" }),
  });
}

function makeContext() {
  return { params: Promise.resolve({ approvalId }) };
}

function makeQuery(data: unknown) {
  const calls: Array<[string, unknown]> = [];
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "update"]) {
    query[method] = vi.fn((...args: unknown[]) => {
      calls.push([method, args]);
      return query;
    });
  }
  query.maybeSingle = vi.fn(async () => ({ data, error: null }));
  return { query, calls };
}

function configureSignedInUser() {
  mocks.createClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: signedInUser }, error: null }) },
  });
}

describe("PATCH /api/approvals/[approvalId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GITHUB_WRITE_TOKEN;
  });

  it("rejects an unauthenticated approval decision", async () => {
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    });

    const response = await PATCH(makeRequest(), makeContext());

    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.executeApprovedGitHubAction).not.toHaveBeenCalled();
  });

  it("does not execute an approval owned by another user", async () => {
    configureSignedInUser();
    const { query, calls } = makeQuery(null);
    mocks.createAdminClient.mockReturnValue({ from: vi.fn(() => query) });

    const response = await PATCH(makeRequest(), makeContext());

    expect(response.status).toBe(404);
    expect(calls).toContainEqual(["eq", ["user_id", signedInUser.id]]);
    expect(mocks.executeApprovedGitHubAction).not.toHaveBeenCalled();
  });

  it("executes a concurrently approved proposal at most once", async () => {
    configureSignedInUser();
    process.env.GITHUB_WRITE_TOKEN = "test-token";

    let status = "pending";
    let reads = 0;
    let releaseReads!: () => void;
    const bothReadsStarted = new Promise<void>((resolve) => { releaseReads = resolve; });

    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => {
        let operation: "select" | "update" = "select";
        let updateValues: Record<string, unknown> = {};
        const filters: Record<string, unknown> = {};
        const query: Record<string, unknown> = {};
        query.select = vi.fn(() => { return query; });
        query.eq = vi.fn((key: string, value: unknown) => {
          filters[key] = value;
          return query;
        });
        query.update = vi.fn((values: Record<string, unknown>) => {
          operation = "update";
          updateValues = values;
          return query;
        });
        query.insert = vi.fn(async () => ({ data: null, error: null }));
        const resolveQuery = vi.fn(async () => {
          if (operation === "select") {
            reads += 1;
            if (reads === 2) releaseReads();
            await bothReadsStarted;
            if (filters.user_id !== signedInUser.id) return { data: null, error: null };
            return { data: { ...pendingApproval, status: "pending" }, error: null };
          }

          if (
            filters.id !== approvalId ||
            filters.user_id !== signedInUser.id ||
            filters.status !== status ||
            (filters.payload_hash && filters.payload_hash !== pendingApproval.payload_hash)
          ) {
            return { data: null, error: null };
          }

          status = String(updateValues.status);
          return { data: { id: approvalId, ...updateValues }, error: null };
        });
        query.maybeSingle = resolveQuery;
        return query;
      }),
    });

    mocks.executeApprovedGitHubAction.mockResolvedValue({ message: "Branch created" });

    const responses = await Promise.all([
      PATCH(makeRequest(), makeContext()),
      PATCH(makeRequest(), makeContext()),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(mocks.executeApprovedGitHubAction).toHaveBeenCalledTimes(1);
    expect(status).toBe("executed");
  });
});
