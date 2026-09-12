export class RequestError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}

export async function clientApi<T = void>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options, credentials: "same-origin", headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers } });
  if (!response.ok) {
    let code = "REQUEST_FAILED";
    try {
      const body = await response.json() as { error?: { code?: string }; code?: string };
      code = body.error?.code ?? body.code ?? code;
    } catch { /* A non-JSON failure has the same safe, generic UI message. */ }
    if (response.status === 401) code = "UNAUTHORIZED";
    if (response.status === 409 || response.status === 412) code = "VERSION_CONFLICT";
    throw new RequestError(code, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
