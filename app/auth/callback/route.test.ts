import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

function request(url: string) {
  return new NextRequest(url);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exchanges a valid code and redirects to the workspace", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    mockedCreateClient.mockResolvedValue({
      auth: { exchangeCodeForSession },
    } as never);

    const response = await GET(request("https://workspace.example/auth/callback?code=valid-code"));

    expect(exchangeCodeForSession).toHaveBeenCalledWith("valid-code");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://workspace.example/");
  });

  it("redirects to login when the callback has no code", async () => {
    const response = await GET(request("https://workspace.example/auth/callback"));

    expect(mockedCreateClient).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://workspace.example/login?error=confirmation");
  });

  it("redirects to login when code exchange fails", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      error: new Error("Invalid or expired code"),
    });
    mockedCreateClient.mockResolvedValue({
      auth: { exchangeCodeForSession },
    } as never);

    const response = await GET(request("https://workspace.example/auth/callback?code=expired-code"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://workspace.example/login?error=confirmation");
  });

  it("handles Supabase configuration failures without exposing internals", async () => {
    mockedCreateClient.mockRejectedValue(new Error("private configuration detail"));

    const response = await GET(request("https://workspace.example/auth/callback?code=valid-code"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://workspace.example/login?error=configuration");
  });
});
