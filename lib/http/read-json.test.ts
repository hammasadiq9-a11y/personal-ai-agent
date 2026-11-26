import { describe, expect, it } from "vitest";
import { readJsonBody } from "./read-json";

describe("readJsonBody", () => {
  it("parses a valid JSON request", async () => {
    const request = new Request("https://local.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });

    await expect(readJsonBody(request, 100)).resolves.toEqual({
      ok: true,
      value: { message: "hello" },
    });
  });

  it("rejects a declared oversized body before reading it", async () => {
    const request = new Request("https://local.test/api", {
      method: "POST",
      headers: { "content-length": "101" },
      body: "{}",
    });

    await expect(readJsonBody(request, 100)).resolves.toEqual({
      ok: false,
      status: 413,
      error: "The request is too large.",
    });
  });

  it("rejects a streamed body that exceeds the limit even without content-length", async () => {
    const request = new Request("https://local.test/api", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"payload":"'));
          controller.enqueue(new TextEncoder().encode("x".repeat(128)));
          controller.close();
        },
      }),
    });

    const result = await readJsonBody(request, 32);
    expect(result).toMatchObject({ ok: false, status: 413 });
  });

  it("rejects malformed JSON", async () => {
    const request = new Request("https://local.test/api", { method: "POST", body: "{" });
    await expect(readJsonBody(request, 100)).resolves.toMatchObject({
      ok: false,
      status: 400,
    });
  });
});
