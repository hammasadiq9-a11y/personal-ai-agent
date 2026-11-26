import { createHash } from "node:crypto";

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function hashPayload(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function containsCredentialLikeField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCredentialLikeField);
  if (!value || typeof value !== "object") return false;

  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
    if (/(password|secret|token|api[_-]?key|authorization|cookie)/i.test(key)) return true;
    return containsCredentialLikeField(nested);
  });
}
