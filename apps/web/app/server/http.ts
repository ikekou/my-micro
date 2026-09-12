export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public headers?: HeadersInit) {
    super(message);
  }
}

export function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  const result = new Response(JSON.stringify(value), { status, headers });
  result.headers.set("Content-Type", "application/json; charset=utf-8");
  result.headers.set("Cache-Control", "no-store");
  result.headers.set("X-Content-Type-Options", "nosniff");
  return result;
}

export function errorResponse(error: ApiError): Response {
  return json({ error: { code: error.code, message: error.message } }, error.status, error.headers);
}

export async function boundedBody(request: Request, limit = 64 * 1024): Promise<Uint8Array<ArrayBuffer>> {
  const advertised = request.headers.get("content-length");
  if (advertised && (!/^\d+$/.test(advertised) || Number(advertised) > limit)) {
    throw new ApiError(413, "BODY_TOO_LARGE", "Request body exceeds the allowed size.");
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ApiError(413, "BODY_TOO_LARGE", "Request body exceeds the allowed size.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "JSON_REQUIRED", "Use Content-Type: application/json.");
  }
  const bytes = await boundedBody(request);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new ApiError(400, "INVALID_JSON", "Request body must be valid UTF-8 JSON."); }
}

/** Cookie writes require the application's exact origin. CLI bearer writes may omit Origin. */
export function checkWriteOrigin(request: Request, appUrl: string): void {
  const expected = new URL(appUrl).origin;
  const origin = request.headers.get("origin");
  const bearer = /^Bearer [^\s]+$/i.test(request.headers.get("authorization") ?? "");
  if ((origin !== null && origin !== expected) || (!bearer && origin !== expected)) {
    throw new ApiError(403, "ORIGIN_REJECTED", "This request must originate from My Micro.");
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "ORIGIN_REJECTED", "Cross-site requests are not allowed.");
  }
}

export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
}
