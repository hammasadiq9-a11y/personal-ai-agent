import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { GET, POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

describe("/api/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated project reads", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    } as never);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Sign in to view projects.",
    });
  });

  it("derives project ownership from the authenticated session", async () => {
    const insert = vi.fn().mockReturnThis();
    const select = vi.fn().mockReturnThis();
    const single = vi.fn().mockResolvedValue({
      data: {
        id: "project-1",
        name: "Private project",
        description: "A test",
        status: "active",
      },
      error: null,
    });
    const from = vi.fn().mockReturnValue({ insert, select, single });

    mockedCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "authenticated-user" } },
          error: null,
        }),
      },
      from,
    } as never);

    const response = await POST(new Request("https://local.test/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Private project",
        description: "A test",
        user_id: "attacker-controlled-user",
      }),
    }));

    expect(response.status).toBe(201);
    expect(from).toHaveBeenCalledWith("projects");
    expect(insert).toHaveBeenCalledWith({
      user_id: "authenticated-user",
      name: "Private project",
      description: "A test",
    });
  });

  it("rejects invalid project input before writing", async () => {
    const insert = vi.fn();
    const from = vi.fn().mockReturnValue({ insert });

    mockedCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "authenticated-user" } },
          error: null,
        }),
      },
      from,
    } as never);

    const response = await POST(new Request("https://local.test/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "   ", description: "invalid" }),
    }));

    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
});
