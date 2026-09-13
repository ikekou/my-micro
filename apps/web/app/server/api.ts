import { postInputSchema, postUpdateSchema } from "@my-micro/shared";
import { authenticationHeaders, createAuth, getSession, requireSession } from "./auth";
import { ApiError, boundedBody, checkWriteOrigin, errorResponse, json, readJson } from "./http";
import { assertCanWrite, createPost, deletePost, getOwnedPost, getPost, listPosts, publicAuthor, updatePost } from "./posts";
import { enforceRate } from "./rate-limit";
import { listSessions } from "./sessions";

const authRoutes = new Map([
  ["/sign-in/social", "POST"], ["/callback/github", "GET"],
  ["/device/code", "POST"], ["/device/token", "POST"], ["/device", "GET"],
  ["/device/approve", "POST"], ["/device/deny", "POST"], ["/sign-out", "POST"],
]);

async function authRoute(request: Request, env: Env, path: string): Promise<Response> {
  if (authRoutes.get(path) !== request.method) throw new ApiError(404, "NOT_FOUND", "This authentication endpoint is not available.");
  const clientFlow = path === "/device/code" || path === "/device/token";
  if (request.method === "POST" && !clientFlow) checkWriteOrigin(request, env.BETTER_AUTH_URL);
  if (clientFlow && request.headers.has("origin") && request.headers.get("origin") !== new URL(env.BETTER_AUTH_URL).origin) {
    throw new ApiError(403, "ORIGIN_REJECTED", "Cross-site device requests are not allowed.");
  }
  // Verification claims a device code, so this GET must originate from a same-origin UI fetch.
  if (path === "/device" && request.headers.get("sec-fetch-site") === "cross-site") throw new ApiError(403, "ORIGIN_REJECTED", "Cross-site verification is not allowed.");
  if (path === "/device") await requireSession(request, env);
  let bounded = request;
  if (request.method === "POST") {
    const bytes = await boundedBody(request, 16 * 1024);
    bounded = new Request(request.url, { method: request.method, headers: authenticationHeaders(request), body: bytes });
  }
  const response = await createAuth(env).handler(bounded);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  // Only /device/token intentionally hands a session token to the first-party CLI.
  headers.delete("set-auth-token");
  return new Response(response.body, { status: response.status, headers });
}

function idFromPath(path: string, prefix: string): string | null {
  const id = path.slice(prefix.length);
  return id && !id.includes("/") && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
}

async function dispatch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path.startsWith("/api/auth/")) return authRoute(request, env, path.slice("/api/auth".length));
  const postsPath = "/api/v1/posts";
  const postId = path.startsWith(`${postsPath}/`) ? idFromPath(path, `${postsPath}/`) : null;

  if (request.method === "GET") {
    if (path === postsPath) return json(await listPosts(env.DB, url));
    if (postId) return json({ post: await getPost(env.DB, postId) });
    const authorId = path.startsWith("/api/v1/authors/") ? idFromPath(path, "/api/v1/authors/") : null;
    if (authorId) {
      const author = await env.DB.prepare("SELECT id, username, image FROM user WHERE id = ?").bind(authorId).first<{ id: string; username: string; image: string | null }>();
      if (!author) throw new ApiError(404, "AUTHOR_NOT_FOUND", "This author could not be found.");
      return json({ author: publicAuthor(author) });
    }
    if (path === "/api/v1/me") {
      const session = await getSession(request, env);
      return json({ user: session ? publicAuthor(session.user) : null });
    }
    if (path === "/api/v1/me/posts") {
      const session = await requireSession(request, env);
      return json(await listPosts(env.DB, url, session.user.id));
    }
    const ownedPostId = path.startsWith("/api/v1/me/posts/") ? idFromPath(path, "/api/v1/me/posts/") : null;
    if (ownedPostId) {
      const session = await requireSession(request, env);
      return json({ post: await getOwnedPost(env.DB, session.user.id, ownedPostId) });
    }
    if (path === "/api/v1/me/sessions") {
      const session = await requireSession(request, env);
      return json(await listSessions(env.DB, url, session.user.id, session.session.id));
    }
  }

  if (!["POST", "PATCH", "DELETE"].includes(request.method)) throw new ApiError(404, "NOT_FOUND", "This API endpoint could not be found.");
  checkWriteOrigin(request, env.BETTER_AUTH_URL);
  const session = await requireSession(request, env);
  await enforceRate(env.DB, `writes:${session.user.id}`);
  if (request.method === "POST" && path === "/api/v1/me/sign-out") {
    const response = await createAuth(env).api.signOut({ headers: authenticationHeaders(request), asResponse: true });
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.delete("set-auth-token");
    return new Response(null, { status: 204, headers });
  }
  const sessionId = path.startsWith("/api/v1/me/sessions/") ? idFromPath(path, "/api/v1/me/sessions/") : null;
  if (request.method === "DELETE" && sessionId) {
    await env.DB.prepare("DELETE FROM session WHERE id = ? AND userId = ?").bind(sessionId, session.user.id).run();
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  if (request.method === "DELETE" && postId) {
    const match = /^(?:"([1-9]\d*)"|([1-9]\d*))$/.exec(request.headers.get("if-match") ?? "");
    const version = Number(match?.[1] ?? match?.[2]);
    if (!match || !Number.isSafeInteger(version)) throw new ApiError(428, "VERSION_REQUIRED", "Send the reviewed post version in If-Match.");
    await deletePost(env.DB, session.user.id, postId, version);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  await assertCanWrite(env.DB, session.user.id);
  if (request.method === "POST" && path === postsPath) {
    const parsed = postInputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, "INVALID_POST", "The post does not match the public Micro schema.");
    const result = await createPost(env.DB, session.user.id, parsed.data, request.headers.get("idempotency-key") ?? "");
    return json({ post: result.post }, result.created ? 201 : 200, { Location: `/api/v1/posts/${result.post.id}` });
  }
  if (request.method === "PATCH" && postId) {
    const parsed = postUpdateSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, "INVALID_POST", "The update requires a valid post and its reviewed version.");
    return json({ post: await updatePost(env.DB, session.user.id, postId, parsed.data) });
  }
  throw new ApiError(404, "NOT_FOUND", "This API endpoint could not be found.");
}

/** Called by the Worker and by SSR loaders; no internal HTTP fetch is necessary. */
export async function handleApi(request: Request, env: Env): Promise<Response | null> {
  if (!new URL(request.url).pathname.startsWith("/api/")) return null;
  try { return await dispatch(request, env); }
  catch (error) {
    if (error instanceof ApiError) return errorResponse(error);
    // Avoid logging request bodies, settings, provider replies, or credentials.
    console.error(JSON.stringify({ event: "api_error", code: "INTERNAL_ERROR" }));
    return errorResponse(new ApiError(500, "INTERNAL_ERROR", "The request could not be completed. Please try again."));
  }
}
