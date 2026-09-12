import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApiClient } from "../../../../packages/collector/src/api";
import { CredentialStore } from "../../../../packages/collector/src/storage";
import { createDraft, publishDraft } from "../../../../packages/collector/src/draft";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { getMigrations } from "better-auth/db/migration";
import { createFixturePostInput } from "@my-micro/shared/fixtures";
import type { PostPage, PublicPost } from "@my-micro/shared";
import { handleApi } from "../../app/server/api";
import { createAuth } from "../../app/server/auth";
import { serializeSignedCookie } from "better-call";
import { consumeRate } from "../../app/server/rate-limit";

const origin = "http://localhost:5173";
const aliceId = "test-alice";
const bobId = "test-bob";
const aliceToken = "test-alice-session-token-with-no-real-access";
const bobToken = "test-bob-session-token-with-no-real-access";
let mf: Miniflare;
let env: Env;

before(async () => {
  const options = convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('test')}}", compatibilityDate: "2026-09-12", d1Databases: ["DB"] });
  options.telemetry = { enabled: false };
  mf = new Miniflare(options);
  env = {
    DB: await mf.getD1Database("DB"), BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: "synthetic-test-secret-with-at-least-32-characters-52917",
    GITHUB_CLIENT_ID: "synthetic-test-client", GITHUB_CLIENT_SECRET: "synthetic-test-client-secret",
    SUPPORT_URL: "",
  };
  for (const file of ["0001_auth.sql", "0002_posts.sql"]) {
    const sql = await readFile(new URL(`../../migrations/${file}`, import.meta.url), "utf8");
    await env.DB.batch(sql.split(";").map((part) => part.trim()).filter(Boolean).map((part) => env.DB.prepare(part)));
  }
});
after(async () => { if (mf) await mf.dispose(); });
beforeEach(async () => {
  await env.DB.batch(["posts", "blocked_users", "session", "account", "deviceCode", "verification", "user", "api_rate_limits"].map((table) => env.DB.prepare(`DELETE FROM ${table}`)));
  const now = new Date().toISOString();
  for (const [id, token, username] of [[aliceId, aliceToken, "test-alice"], [bobId, bobToken, "test-bob"]]) {
    await env.DB.prepare('INSERT INTO user (id, name, username, email, emailVerified, image, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, ?, ?, ?)')
      .bind(id, "Private Real Name", username, `${id}@example.invalid`, "https://avatars.githubusercontent.com/u/0", now, now).run();
    await env.DB.prepare('INSERT INTO session (id, token, userId, createdAt, updatedAt, expiresAt, userAgent, ipAddress) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(`${id}-session`, token, id, now, now, new Date(Date.now() + 86_400_000).toISOString(), "Synthetic test client", "192.0.2.1").run();
  }
});

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await handleApi(new Request(`${origin}${path}`, init), env);
  assert(response);
  return response;
}
function headers(token = aliceToken, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra };
}
async function publish(title = "One Micro", token = aliceToken, key = crypto.randomUUID()): Promise<PublicPost> {
  const response = await call("/api/v1/posts", { method: "POST", headers: headers(token, { "Idempotency-Key": key }), body: JSON.stringify({ ...createFixturePostInput(), title }) });
  assert.equal(response.status, 201, await response.clone().text());
  return ((await response.json()) as { post: PublicPost }).post;
}
async function deviceCode() {
  const response = await call("/api/auth/device/code", { method: "POST", headers: { "Content-Type": "application/json", "cf-connecting-ip": "192.0.2.22" }, body: JSON.stringify({ client_id: "my-micro" }) });
  assert.equal(response.status, 200, await response.clone().text());
  return await response.json() as { device_code: string; user_code: string; verification_uri: string; interval: number };
}
function pollBody(code: string) { return JSON.stringify({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: code, client_id: "my-micro" }); }

test("D1 migration matches the installed Better Auth configuration", async () => {
  const migration = await getMigrations(createAuth(env).options);
  assert.deepEqual(migration.toBeCreated, []);
  assert.deepEqual(migration.toBeAdded, []);
  assert.deepEqual(migration.toBeAddedIndexes, []);
  assert.deepEqual(migration.schemaProblems, []);
});

test("GitHub OAuth callback creates a session with the provider login, never browser-supplied names", async (t) => {
  const githubLogin = "synthetic-oauth-user";
  const githubEmail = "synthetic-oauth-user@example.invalid";
  const githubToken = "synthetic-provider-token-with-no-real-access";
  const providerRequests: string[] = [];
  const originalFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return originalFetch(input, init);
    providerRequests.push(url.href);
    if (url.href === "https://github.com/login/oauth/access_token") {
      return Response.json({ access_token: githubToken, token_type: "bearer", scope: "read:user,user:email" });
    }
    const requestHeaders = new Headers(input instanceof Request ? input.headers : init?.headers);
    assert.equal(requestHeaders.get("authorization"), `Bearer ${githubToken}`);
    if (url.href === "https://api.github.com/user") {
      return Response.json({ id: 9990001, login: githubLogin, name: "Private OAuth Full Name", email: null, avatar_url: "https://avatars.githubusercontent.com/u/9990001" });
    }
    if (url.href === "https://api.github.com/user/emails") {
      return Response.json([{ email: githubEmail, primary: true, verified: true }]);
    }
    throw new Error(`Unexpected outbound OAuth request: ${url.origin}${url.pathname}`);
  });
  const signIn = await call("/api/auth/sign-in/social", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "github", callbackURL: `${origin}/account`, errorCallbackURL: `${origin}/login`, disableRedirect: true,
      username: "forged-browser-login", name: "Forged browser name", additionalData: { username: "forged-state-login" } }),
  });
  assert.equal(signIn.status, 200, await signIn.clone().text());
  const authorize = new URL((await signIn.json() as { url: string }).url);
  assert.equal(authorize.origin, "https://github.com");
  assert.equal(authorize.searchParams.get("redirect_uri"), `${origin}/api/auth/callback/github`);
  const state = authorize.searchParams.get("state");
  assert(state);
  const stateCookie = signIn.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
  assert(stateCookie);
  const callback = await call(`/api/auth/callback/github?code=synthetic-code&state=${encodeURIComponent(state)}`, {
    headers: { Cookie: stateCookie, "Sec-Fetch-Site": "cross-site" },
  });
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("location"), `${origin}/account`);
  assert.deepEqual(providerRequests, ["https://github.com/login/oauth/access_token", "https://api.github.com/user", "https://api.github.com/user/emails"]);
  const sessionCookie = callback.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
  const me = await call("/api/v1/me", { headers: { Cookie: sessionCookie } });
  const publicUser = (await me.json() as { user: { id: string; username: string; avatarUrl: string } }).user;
  assert(publicUser);
  assert.equal(publicUser.username, githubLogin);
  assert.deepEqual(Object.keys(publicUser).sort(), ["avatarUrl", "id", "username"]);
  const stored = await env.DB.prepare("SELECT name, username FROM user WHERE id = ?").bind(publicUser.id).first();
  assert.deepEqual(stored, { name: githubLogin, username: githubLogin });
  assert.equal((await call("/api/auth/update-user", { method: "POST", headers: { Cookie: sessionCookie, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ username: "forged-browser-login" }) })).status, 404);
  assert.equal((await env.DB.prepare("SELECT username FROM user WHERE id = ?").bind(publicUser.id).first<{ username: string }>())?.username, githubLogin);
});

test("public replies contain only public author fields and reject unknown settings", async () => {
  const post = await publish();
  assert.deepEqual(Object.keys(post.author).sort(), ["avatarUrl", "id", "username"]);
  const response = await call(`/api/v1/posts/${post.id}`);
  const text = await response.text();
  for (const privateValue of ["Private Real Name", "example.invalid", aliceToken, "192.0.2.1"]) assert(!text.includes(privateValue));
  const malicious = { ...createFixturePostInput(), settings: { ...createFixturePostInput().settings, localPath: "/private/should-not-publish" } };
  const rejected = await call("/api/v1/posts", { method: "POST", headers: headers(aliceToken, { "Idempotency-Key": crypto.randomUUID() }), body: JSON.stringify(malicious) });
  assert.equal(rejected.status, 400);
  assert.equal((await call("/api/auth/get-session", { headers: headers() })).status, 404);
});

test("concurrent creates are idempotent; changed content cannot reuse a key", async () => {
  const key = crypto.randomUUID();
  const input = createFixturePostInput();
  const responses = await Promise.all(Array.from({ length: 6 }, () => call("/api/v1/posts", { method: "POST", headers: headers(aliceToken, { "Idempotency-Key": key }), body: JSON.stringify(input) })));
  assert.equal(responses.filter((response) => response.status === 201).length, 1);
  assert.equal(responses.filter((response) => response.status === 200).length, 5);
  const posts = await Promise.all(responses.map(async (response) => (await response.json() as { post: PublicPost }).post));
  assert.equal(new Set(posts.map((post) => post.id)).size, 1);
  const conflict = await call("/api/v1/posts", { method: "POST", headers: headers(aliceToken, { "Idempotency-Key": key }), body: JSON.stringify({ ...input, title: "Changed" }) });
  assert.equal(conflict.status, 409);
});

test("ownership and reviewed versions guard update/delete; a deleted key cannot recreate", async () => {
  const key = crypto.randomUUID();
  const post = await publish("Original", aliceToken, key);
  const input = { ...createFixturePostInput(), title: "Edited", version: post.version };
  const bob = await call(`/api/v1/posts/${post.id}`, { method: "PATCH", headers: headers(bobToken), body: JSON.stringify(input) });
  assert.equal(bob.status, 404);
  const results = await Promise.all([1, 2].map(() => call(`/api/v1/posts/${post.id}`, { method: "PATCH", headers: headers(), body: JSON.stringify(input) })));
  assert.deepEqual(results.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await call(`/api/v1/posts/${post.id}`, { method: "DELETE", headers: headers(aliceToken, { "If-Match": '"1"' }) })).status, 409);
  assert.equal((await call(`/api/v1/posts/${post.id}`, { method: "DELETE", headers: headers(bobToken, { "If-Match": '"2"' }) })).status, 404);
  assert.equal((await call(`/api/v1/posts/${post.id}`, { method: "DELETE", headers: headers(aliceToken, { "If-Match": '"2"' }) })).status, 204);
  assert.equal((await call(`/api/v1/posts/${post.id}`)).status, 404);
  const replay = await call("/api/v1/posts", { method: "POST", headers: headers(aliceToken, { "Idempotency-Key": key }), body: JSON.stringify({ ...createFixturePostInput(), title: "Original" }) });
  assert.equal(replay.status, 410);
  const row = await env.DB.prepare("SELECT settings, title FROM posts WHERE id = ?").bind(post.id).first();
  assert.deepEqual(row, { settings: null, title: "" });
});

test("seed/cursor/cutoff pages exclude later inserts, skip deletions, and bind the search", async () => {
  const posts = [];
  for (let index = 0; index < 7; index++) posts.push(await publish(`Gallery ${index}`));
  const first = await (await call("/api/v1/posts?seed=1234567&limit=2&q=スクロール")).json() as PostPage;
  assert.equal(first.items.length, 2);
  assert(first.page.cursor);
  const repeat = await (await call(`/api/v1/posts?seed=${first.page.seed}&cutoff=${first.page.cutoff}&limit=2&q=スクロール`)).json() as PostPage;
  assert.deepEqual(repeat.items.map((post) => post.id), first.items.map((post) => post.id));
  const later = await publish("Later insert");
  const unseen = posts.find((post) => !first.items.some((item) => item.id === post.id))!;
  await call(`/api/v1/posts/${unseen.id}`, { method: "DELETE", headers: headers(aliceToken, { "If-Match": '"1"' }) });
  const seen = [...first.items];
  let cursor = first.page.cursor;
  while (cursor) {
    const page = await (await call(`/api/v1/posts?cursor=${cursor}&seed=${first.page.seed}&cutoff=${first.page.cutoff}&limit=2&q=スクロール`)).json() as PostPage;
    seen.push(...page.items); cursor = page.page.cursor;
  }
  assert.equal(seen.length, 6);
  assert.equal(new Set(seen.map((post) => post.id)).size, seen.length);
  assert(!seen.some((post) => post.id === later.id || post.id === unseen.id));
  assert.equal((await call(`/api/v1/posts?cursor=${first.page.cursor}&q=changed`)).status, 400);
  const wildcard = await (await call("/api/v1/posts?q=%25")).json() as PostPage;
  assert.equal(wildcard.items.length, 0);
});

test("browser writes enforce origin, invalid bearer cannot use cookies, and bodies are bounded", async () => {
  const post = await publish();
  const path = `/api/v1/posts/${post.id}`;
  assert.equal((await call(path, { method: "DELETE", headers: headers(aliceToken, { Origin: "https://attacker.invalid", "If-Match": '"1"' }) })).status, 403);
  assert.equal((await call(path, { method: "DELETE", headers: { Cookie: `better-auth.session_token=${aliceToken}`, "If-Match": '"1"' } })).status, 403);
  assert.equal((await call(path, { method: "DELETE", headers: { Authorization: "Bearer invalid", Cookie: `better-auth.session_token=${aliceToken}`, "If-Match": '"1"' } })).status, 401);
  const large = await call("/api/v1/posts", { method: "POST", headers: headers(aliceToken, { "Idempotency-Key": crypto.randomUUID() }), body: JSON.stringify({ text: "x".repeat(65_536) }) });
  assert.equal(large.status, 413);
});

test("session listing omits tokens/IP, owner revocation is immediate, and sign-out removes credentials", async () => {
  const listed = await call("/api/v1/me/sessions", { headers: headers() });
  const text = await listed.text();
  assert(!text.includes(aliceToken)); assert(!text.includes("192.0.2.1"));
  assert(text.includes('"current":true'));
  await call(`/api/v1/me/sessions/${aliceId}-session`, { method: "DELETE", headers: headers(bobToken) });
  assert.equal((await call("/api/v1/me/posts", { headers: headers() })).status, 200);
  await call(`/api/v1/me/sessions/${aliceId}-session`, { method: "DELETE", headers: headers() });
  assert.equal((await call("/api/v1/me/posts", { headers: headers() })).status, 401);
  const signOut = await call("/api/v1/me/sign-out", { method: "POST", headers: headers(bobToken) });
  assert.equal(signOut.status, 204);
  assert.equal((await call("/api/v1/me/posts", { headers: headers(bobToken) })).status, 401);
});

test("device authorization needs login, explicit approval and matching client; bearer revokes normally", async () => {
  const code = await deviceCode();
  assert.equal(code.verification_uri, `${origin}/device`);
  const anonymous = await call(`/api/auth/device?user_code=${code.user_code}`);
  assert.equal(anonymous.status, 401);
  const pending = await call("/api/auth/device/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: pollBody(code.device_code) });
  assert.equal((await pending.json() as { error: string }).error, "authorization_pending");
  const verify = await call(`/api/auth/device?user_code=${code.user_code}`, { headers: headers() });
  assert.equal(verify.status, 200, await verify.clone().text());
  const wrongOwner = await call("/api/auth/device/approve", { method: "POST", headers: headers(bobToken), body: JSON.stringify({ userCode: code.user_code }) });
  assert.equal(wrongOwner.status, 403);
  const approved = await call("/api/auth/device/approve", { method: "POST", headers: headers(), body: JSON.stringify({ userCode: code.user_code }) });
  assert.equal(approved.status, 200, await approved.clone().text());
  await env.DB.prepare("UPDATE deviceCode SET lastPolledAt = ?").bind(new Date(Date.now() - 60_000).toISOString()).run();
  const tokenResponse = await call("/api/auth/device/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: pollBody(code.device_code) });
  assert.equal(tokenResponse.status, 200, await tokenResponse.clone().text());
  const token = await tokenResponse.json() as { access_token: string };
  assert.equal((await call("/api/v1/me/posts", { headers: headers(token.access_token) })).status, 200);
  await call("/api/v1/me/sign-out", { method: "POST", headers: headers(token.access_token) });
  assert.equal((await call("/api/v1/me/posts", { headers: headers(token.access_token) })).status, 401);
  const consumed = await call("/api/auth/device/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: pollBody(code.device_code) });
  assert.notEqual(consumed.status, 200);
});

test("device denial, expiry, polling intervals, and client allowlist return actionable failures", async () => {
  const invalidClient = await call("/api/auth/device/code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: "foreign-client" }) });
  assert.equal(invalidClient.status, 400);
  const deniedCode = await deviceCode();
  await call(`/api/auth/device?user_code=${deniedCode.user_code}`, { headers: headers() });
  assert.equal((await call("/api/auth/device/deny", { method: "POST", headers: headers(), body: JSON.stringify({ userCode: deniedCode.user_code }) })).status, 200);
  const denied = await call("/api/auth/device/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: pollBody(deniedCode.device_code) });
  assert.equal((await denied.json() as { error: string }).error, "access_denied");
  const expiredCode = await deviceCode();
  await env.DB.prepare("UPDATE deviceCode SET expiresAt = ? WHERE deviceCode = ?").bind(new Date(Date.now() - 1_000).toISOString(), expiredCode.device_code).run();
  const expired = await call("/api/auth/device/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: pollBody(expiredCode.device_code) });
  assert.equal((await expired.json() as { error: string }).error, "expired_token");
  const fastCode = await deviceCode();
  await call("/api/auth/device/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: pollBody(fastCode.device_code) });
  const fast = await call("/api/auth/device/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: pollBody(fastCode.device_code) });
  assert.equal((await fast.json() as { error: string }).error, "slow_down");
});

test("atomic rate limits cap simultaneous writes; moderation prevents posts while preserving deletion", async () => {
  const results = await Promise.all(Array.from({ length: 12 }, () => consumeRate(env.DB, "parallel-test", 60, 5)));
  assert.equal(results.filter((result) => result.allowed).length, 5);
  const post = await publish();
  await env.DB.prepare("UPDATE posts SET hidden_at = ? WHERE id = ?").bind(Date.now(), post.id).run();
  assert.equal((await call(`/api/v1/posts/${post.id}`)).status, 404);
  await env.DB.prepare("INSERT INTO blocked_users VALUES (?, ?, ?)").bind(aliceId, Date.now(), "Synthetic moderation test").run();
  const rejected = await call("/api/v1/posts", { method: "POST", headers: headers(aliceToken, { "Idempotency-Key": crypto.randomUUID() }), body: JSON.stringify(createFixturePostInput()) });
  assert.equal(rejected.status, 403);
  assert.equal((await call(`/api/v1/posts/${post.id}`, { method: "DELETE", headers: headers(aliceToken, { "If-Match": '"1"' }) })).status, 204);
});


test("bundled collector contracts compose with real D1: create/retry/update/delete/retry/revocation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "my-micro-d1-client-"));
  try {
    const store = new CredentialStore(directory);
    await store.save({ origin, token: aliceToken, expiresAt: Date.now() + 86_400_000 });
    const client = new ApiClient(origin, store, async (url, init) => {
      const response = await handleApi(new Request(String(url), init), env);
      assert(response);
      return response;
    });
    const draft = await createDraft(createFixturePostInput(), origin);
    const created = await publishDraft(draft, draft.approvalHash, client);
    assert("published" in created && created.published);
    const repeated = await publishDraft(draft, draft.approvalHash, client);
    assert.equal(repeated.id, created.id);
    const update = await createDraft({ ...createFixturePostInput(), title: "Collector update" }, origin,
      { kind: "update", id: created.id, version: 1, ownerId: aliceId });
    const updated = await publishDraft(update, update.approvalHash, client);
    assert("version" in updated && updated.version === 2);
    const updateAgain = await publishDraft(update, update.approvalHash, client);
    assert("alreadyApplied" in updateAgain && updateAgain.alreadyApplied);
    const deletion = await createDraft(update.input, origin,
      { kind: "delete", id: created.id, version: 2, ownerId: aliceId });
    assert.deepEqual(await publishDraft(deletion, deletion.approvalHash, client), { deleted: true, id: created.id });
    assert.deepEqual(await publishDraft(deletion, deletion.approvalHash, client), { deleted: true, id: created.id, alreadyApplied: true });
    await client.logout();
    const later = await createDraft(createFixturePostInput(), origin);
    await assert.rejects(() => publishDraft(later, later.approvalHash, client), /Sign in/);
    assert.equal(await store.load(origin), null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test("a valid signed browser cookie works; an invalid bearer never falls back to that cookie", async () => {
  const authContext = await createAuth(env).$context;
  const cookie = (await serializeSignedCookie(authContext.authCookies.sessionToken.name, aliceToken, env.BETTER_AUTH_SECRET!)).split(";")[0];
  const browserMe = await call("/api/v1/me", { headers: { Cookie: cookie } });
  assert.equal((await browserMe.json() as { user: { id: string } }).user.id, aliceId);
  const input = createFixturePostInput();
  const created = await call("/api/v1/posts", { method: "POST", headers: {
    Cookie: cookie, Origin: origin, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(),
  }, body: JSON.stringify(input) });
  assert.equal(created.status, 201, await created.clone().text());
  const post = (await created.json() as { post: PublicPost }).post;
  const invalidBearer = await call(`/api/v1/posts/${post.id}`, { method: "DELETE", headers: {
    Cookie: cookie, Authorization: "Bearer invalid", Origin: origin, "If-Match": '"1"',
  } });
  assert.equal(invalidBearer.status, 401);
  assert.equal((await call(`/api/v1/posts/${post.id}`)).status, 200);
});
