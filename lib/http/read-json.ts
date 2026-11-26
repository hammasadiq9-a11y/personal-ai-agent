export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: string };

/**
 * Reads a request body with a hard byte limit before buffering it in memory.
 * Content-Length is only an early rejection hint; the streamed byte count is authoritative.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, status: 413, error: "The request is too large." };
  }

  if (!request.body) return { ok: false, status: 400, error: "The request body is empty." };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, status: 413, error: "The request is too large." };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "The request body could not be read." };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: false, status: 400, error: "The request must contain valid JSON." };
  }
}
