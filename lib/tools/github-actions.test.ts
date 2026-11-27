import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { executeApprovedGitHubAction } from "./github-actions";

describe("GitHub write response limits", () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_WRITE_TOKEN", "test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rejects an oversized declared response before reading its body", async () => {
    let bodyWasRead = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        bodyWasRead = true;
        controller.enqueue(new Uint8Array([123]));
        controller.close();
      },
    });
    const response = new Response(body, {
      headers: { "content-length": "256001" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(
      executeApprovedGitHubAction("github.create_issue", {
        owner: "example",
        repo: "demo",
        title: "Test issue",
      }),
    ).rejects.toThrow("GitHub returned an unexpectedly large response.");

    expect(bodyWasRead).toBe(false);
  });

  it("enforces the response limit when content length is missing", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(200_000));
        controller.enqueue(new Uint8Array(70_000));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));

    await expect(
      executeApprovedGitHubAction("github.create_issue", {
        owner: "example",
        repo: "demo",
        title: "Test issue",
      }),
    ).rejects.toThrow("GitHub returned an unexpectedly large response.");

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
