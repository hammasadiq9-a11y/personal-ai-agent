import { describe, expect, it } from "vitest";
import { containsCredentialLikeField, hashPayload } from "./payload-hash";

describe("approval payload security", () => {
  it("creates the same hash regardless of object key order", () => {
    expect(hashPayload({ target: "main", repo: "example" }))
      .toBe(hashPayload({ repo: "example", target: "main" }));
  });

  it("changes the hash when the payload changes", () => {
    expect(hashPayload({ branch: "main" }))
      .not.toBe(hashPayload({ branch: "release" }));
  });

  it("detects credential-like fields at any depth", () => {
    expect(containsCredentialLikeField({ settings: { access_token: "hidden" } })).toBe(true);
    expect(containsCredentialLikeField({ authorization: "Bearer value" })).toBe(true);
  });

  it("accepts ordinary action details", () => {
    expect(containsCredentialLikeField({
      repository: "owner/project",
      branch: "feature/update",
      title: "Update the readme",
    })).toBe(false);
  });
});
