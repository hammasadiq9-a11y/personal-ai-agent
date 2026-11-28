import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

describe("GET /api/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-only-test-secret");
    vi.stubEnv("OPENAI_API_KEY", "server-only-openai-secret");
    vi.stubEnv("ENABLE_WEB_SEARCH", "true");
    vi.stubEnv("GITHUB_TOKEN", "server-only-github-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires an authenticated user", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never);

    const response = await GET();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Sign in to view workspace status.",
    });
  });

  it("returns integration flags without exposing secret values", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    } as never);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      databaseConfigured: true,
      aiConfigured: true,
      webSearchEnabled: true,
      githubReadEnabled: true,
    });
    expect(JSON.stringify(body)).not.toContain("server-only-test-secret");
    expect(JSON.stringify(body)).not.toContain("server-only-openai-secret");
    expect(JSON.stringify(body)).not.toContain("server-only-github-secret");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns a safe error when the status check fails", async () => {
    mockedCreateClient.mockRejectedValue(new Error("private configuration detail"));

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Workspace status is unavailable.",
    });
  });
});
