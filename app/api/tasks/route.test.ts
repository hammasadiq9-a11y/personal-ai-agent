import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { GET, POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

describe("/api/tasks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated task reads", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never);

    const response = await GET(new Request("https://local.test/api/tasks"));

    expect(response.status).toBe(401);
  });

  it("derives task ownership from the authenticated session", async () => {
    const insert = vi.fn().mockReturnThis();
    const select = vi.fn().mockReturnThis();
    const single = vi.fn().mockResolvedValue({
      data: { id: "task-1", title: "Private task", status: "todo" },
      error: null,
    });
    const from = vi.fn().mockReturnValue({ insert, select, single });

    mockedCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "authenticated-user" } }, error: null }) },
      from,
    } as never);

    const response = await POST(new Request("https://local.test/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Private task",
        user_id: "attacker-controlled-user",
        priority: "high",
      }),
    }));

    expect(response.status).toBe(201);
    expect(from).toHaveBeenCalledWith("tasks");
    expect(insert).toHaveBeenCalledWith({
      user_id: "authenticated-user",
      title: "Private task",
      description: "",
      priority: "high",
      project_id: null,
      due_at: null,
    });
  });
});
