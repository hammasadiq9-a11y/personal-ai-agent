import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("PATCH /api/approvals/[approvalId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unauthenticated approval decision", async () => {
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    });

    const response = await PATCH(
      new Request("https://local.test/api/approvals/" + approvalId, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      }),
      { params: Promise.resolve({ approvalId }) },
    );

    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.executeApprovedGitHubAction).not.toHaveBeenCalled();
  });

  it("does not execute an approval owned by another user", async () => {
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: signedInUser }, error: null }) },
    });

    const { query, calls } = makeQuery(null);
    mocks.createAdminClient.mockReturnValue({ from: vi.fn(() => query) });

    const response = await PATCH(
      new Request("https://local.test/api/approvals/" + approvalId, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      }),
      { params: Promise.resolve({ approvalId }) },
    );

    expect(response.status).toBe(404);
    expect(calls).toContainEqual(["eq", ["user_id", signedInUser.id]]);
    expect(mocks.executeApprovedGitHubAction).not.toHaveBeenCalled();
  });
});
