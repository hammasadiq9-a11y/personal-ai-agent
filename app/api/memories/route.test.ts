import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { GET, POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

describe("/api/memories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated memory reads", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never);

    const response = await GET(new Request("https://local.test/api/memories"));

    expect(response.status).toBe(401);
  });

  it("derives memory ownership from the authenticated session", async () => {
    const insert = vi.fn().mockReturnThis();
    const select = vi.fn().mockReturnThis();
    const single = vi.fn().mockResolvedValue({
      data: { id: "memory-1", title: "Private note", content: "Private content" },
      error: null,
    });
    const from = vi.fn().mockReturnValue({ insert, select, single });

    mockedCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "authenticated-user" } }, error: null }) },
      from,
    } as never);

    const response = await POST(new Request("https://local.test/api/memories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Private note",
        content: "Private content",
        user_id: "attacker-controlled-user",
      }),
    }));

    expect(response.status).toBe(201);
    expect(from).toHaveBeenCalledWith("memories");
    expect(insert).toHaveBeenCalledWith({
      user_id: "authenticated-user",
      title: "Private note",
      content: "Private content",
      category: "other",
      project_id: null,
      source: "user",
    });
  });
});
