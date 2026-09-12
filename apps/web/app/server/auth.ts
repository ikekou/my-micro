import { betterAuth } from "better-auth";
import { bearer, deviceAuthorization } from "better-auth/plugins";
import { DEVICE_CLIENT_ID } from "@my-micro/shared";
import { ApiError } from "./http";
import { consumeRate } from "./rate-limit";

export function authConfigured(env: Env): boolean {
  return Boolean(env.BETTER_AUTH_SECRET && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}

export function createAuth(env: Env) {
  if (!authConfigured(env)) throw new ApiError(503, "AUTH_NOT_CONFIGURED", "GitHub sign-in has not been configured yet.");
  const baseURL = new URL(env.BETTER_AUTH_URL);
  if (baseURL.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(baseURL.hostname)) {
    throw new ApiError(503, "AUTH_NOT_CONFIGURED", "The authentication URL requires HTTPS.");
  }
  return betterAuth({
    appName: "My Micro",
    baseURL: baseURL.origin,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    logger: {
      level: "warn",
      // Provider/database errors may contain private records; log only the event category.
      log: (level) => { console.error(JSON.stringify({ event: "auth_event", level })); },
    },
    database: env.DB,
    trustedOrigins: [baseURL.origin],
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        mapProfileToUser: (profile) => ({ username: profile.login, name: profile.login }),
      },
    },
    // Better Auth also filters provider mappings through `input`; false drops GitHub login.
    // The API allowlist excludes user signup/update endpoints, so browsers cannot set it.
    user: { additionalFields: { username: { type: "string", required: true, input: true } } },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: baseURL.protocol === "https:" },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      customStorage: { consume: (key, rule) => consumeRate(env.DB, `auth:${key}`, rule.window, rule.max) },
      customRules: {
        "/sign-in/social": { window: 60, max: 10 },
        "/device/code": { window: 60, max: 5 },
        "/device/approve": { window: 60, max: 10 },
        "/device/deny": { window: 60, max: 10 },
      },
    },
    plugins: [
      deviceAuthorization({ verificationUri: `${baseURL.origin}/device`, expiresIn: "10m", interval: "5s", validateClient: (clientId) => clientId === DEVICE_CLIENT_ID }),
      bearer(),
    ],
  });
}

/** A supplied bearer never falls back to a browser cookie if the bearer is invalid. */
export function authenticationHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  if (headers.has("authorization")) headers.delete("cookie");
  return headers;
}

export async function getSession(request: Request, env: Env) {
  if (!authConfigured(env)) return null;
  return createAuth(env).api.getSession({ headers: authenticationHeaders(request), query: { disableCookieCache: true } });
}

export async function requireSession(request: Request, env: Env) {
  if (!authConfigured(env)) throw new ApiError(503, "AUTH_NOT_CONFIGURED", "GitHub sign-in has not been configured yet.");
  const session = await getSession(request, env);
  if (!session) throw new ApiError(401, "AUTH_REQUIRED", "Sign in to manage your Micro posts.");
  return session;
}
