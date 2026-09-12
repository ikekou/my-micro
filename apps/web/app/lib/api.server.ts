import { env } from "cloudflare:workers";
import { handleApi } from "../server/api";

/** Use the same API handler in SSR without a network request back to this Worker. */
export async function apiResponse(request: Request, path: string): Promise<Response> {
  const target = new URL(path, request.url);
  const response = await handleApi(new Request(target, { headers: request.headers, signal: request.signal }), env);
  if (!response) throw new Response(null, { status: 404 });
  return response;
}

export async function apiData<T>(request: Request, path: string): Promise<T> {
  const response = await apiResponse(request, path);
  if (!response.ok) throw new Response(null, { status: response.status, statusText: response.status === 404 ? "Not found" : "Request failed" });
  return response.json() as Promise<T>;
}
