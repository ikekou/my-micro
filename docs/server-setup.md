# Server setup and operations

The implementation uses Cloudflare Workers, native D1 bindings, and Better Auth 1.7.4 with GitHub, Device Authorization, and Bearer. The Wrangler `production` environment identifies the production account and D1 database. The ikekou-lab deployment was verified with a real GitHub OAuth login on 2026-09-13.

## Local setup

From the repository root, install the locked dependencies with `npm ci`. Copy `apps/web/.dev.vars.example` to `apps/web/.dev.vars` and fill in local secrets. Never commit `.dev.vars`.

- `BETTER_AUTH_URL`: the exact origin, `http://localhost:5173` in the top-level Wrangler configuration. Keep this local value when editing the production environment.
- `BETTER_AUTH_SECRET`: a fresh random secret of at least 32 characters; generate it with `openssl rand -base64 32`.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: a GitHub OAuth App for this environment.
- GitHub callback: `http://localhost:5173/api/auth/callback/github` for local development. Set the production OAuth App's callback to the final HTTPS origin plus `/api/auth/callback/github`.

Run `npm run db:migrate` and `npm run dev` from the repository root. For a local production-mode preview, run `npm run preview --workspace=@my-micro/web`. Development and preview both use port 5173 and fail if the port is occupied, keeping the configured authentication origin exact. Missing authentication secrets leave public browsing available, while login and writes return `AUTH_NOT_CONFIGURED`. No development authentication bypass exists.

## Production environment

`apps/web/wrangler.jsonc` keeps the local configuration at the top level and production settings under `env.production`. Production explicitly defines the Worker name `my-micro`, account ID, complete `vars`, and D1 binding because variables and bindings are not inherited between environments. The local placeholder database ID is intentional: local migration and development commands use local D1 storage.

The production origin is `https://my-micro.ikekou-lab.workers.dev`. Register `https://my-micro.ikekou-lab.workers.dev/api/auth/callback/github` as the GitHub OAuth callback and use that App's credentials in production. Keep the local callback registered too, or use a separate App for local development. This application's device authorization is handled by Better Auth; GitHub's Device Flow setting is not required. Keep the plugin's service origin in sync with the production origin. The operator selected `https://github.com/ikekou/my-micro/issues` for production `SUPPORT_URL`.

Run the following from `apps/web`, after checking the intended account and database:

```sh
npm run secret:production -- BETTER_AUTH_SECRET
npm run secret:production -- GITHUB_CLIENT_ID
npm run secret:production -- GITHUB_CLIENT_SECRET
npm run db:migrate:remote
npm run deploy
```

The secret and remote migration scripts explicitly select the source configuration and `production` environment; they do not depend on whichever build was generated last. Local secrets stay in `.dev.vars`. Do not put production secrets there.

`build:production` selects `CLOUDFLARE_ENV=production` before the React Router / Cloudflare Vite build. `deploy` then uses the generated `build/server/wrangler.json`, including its built entry point and asset directory. Do not replace this with a deployment using `--config wrangler.jsonc`, or set the environment only after building. Before publication, inspect the generated Worker name, origin, account ID, and D1 ID.

The ordinary `build`, `dev`, and `preview` scripts explicitly clear `CLOUDFLARE_ENV` for local use. Both build modes write to the same output directory, so `preview` always rebuilds the local configuration first. Do not run bare `vite preview` against a production build or reuse the HTTPS production origin for a localhost session: cookie and Origin checks require the browser and configured origins to match. Environment selection happens during development or build, not during preview. See [Cloudflare environments](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/) and [GitHub OAuth App callbacks](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).

The local test suite does not contact GitHub. The ikekou-lab production browser login was separately verified on 2026-09-13.

## HTTP contract

All `/api/v1` errors are `{ "error": { "code": "...", "message": "..." } }`. Better Auth device endpoints retain the standard `error` and `error_description` response fields so the CLI can handle `authorization_pending`, `slow_down`, `access_denied`, and `expired_token`.

| Endpoint | Contract |
| --- | --- |
| `GET /api/v1/posts` | `{items, page:{seed,cutoff,cursor}}`; queries `q`, `author`, `limit` (1–48), `seed`, `cutoff`, `cursor` |
| `GET /api/v1/posts/:id` | `{post}`; hidden/deleted posts return 404 |
| `GET /api/v1/authors/:id` | `{author:{id,username,avatarUrl}}` |
| `POST /api/v1/posts` | `{title,description,settings}` and unique `Idempotency-Key` (16–128 letters, digits, `_`, `-`); 201 on first creation, 200 on replay |
| `PATCH /api/v1/posts/:id` | Complete post input plus reviewed integer `version`; stale versions return 409 |
| `DELETE /api/v1/posts/:id` | `If-Match: "<reviewed-version>"`; 204 on success, 409 on a version change, 428 if omitted |
| `GET /api/v1/me` | `{user:null}` or `{user:{id,username,avatarUrl}}` |
| `GET /api/v1/me/posts` | The same page structure, restricted to the current owner; includes the owner's hidden posts for deletion |
| `GET /api/v1/me/sessions` | `{sessions:[{id,createdAt,expiresAt,userAgent,current}]}` |
| `DELETE /api/v1/me/sessions/:id` | Revoke one of the current user's sessions; 204 |
| `POST /api/v1/me/sign-out` | Revoke the calling session and clear browser session cookies; 204 |

Public author data contains GitHub login and the GitHub avatar URL. Full names, email, IP addresses, session tokens, provider tokens, and arbitrary user-record fields never enter public post DTOs. Session management likewise excludes tokens and IP addresses. Auth endpoints that return raw user/session records, including `/get-session`, `/list-sessions`, and `/update-user`, are not exposed. Browser UI uses the `/api/v1/me` wrappers. GitHub OAuth still requires Better Auth to retain provider account and email data privately for authentication.

The CLI requests `POST /api/auth/device/code` with `client_id: "my-micro"`, displays both the returned code and verification URL, then polls `/api/auth/device/token` at the returned interval. The access token is a first-party Better Auth session token. It grants access to the same account; it is not a scoped third-party OAuth token. Tokens expire after 30 days and remain revocable at the server. The device code expires in 10 minutes. Polling must back off on `slow_down`.

The authenticated browser calls `GET /api/auth/device?user_code=...`, then the UI requires an explicit code-match confirmation and approval or denial. The request must concern a device the user possesses. `POST /api/auth/device/approve` and `/deny` take `{userCode}`. Approval authorizes the device connection; the plugin still separately previews and obtains approval for the exact post snapshot before sending it.

Browser writes require the exact configured Origin; CLI writes use `Authorization: Bearer ...` and can omit Origin. A provided invalid bearer never falls back to a cookie. Cookies are HttpOnly, SameSite=Lax, and Secure on HTTPS; Better Auth's own CSRF protections remain enabled. Cookie session caching is disabled, and each authenticated API request checks D1 so revocation takes effect on the next request.

Post bodies are read with a streaming 64 KiB limit; authentication bodies have a 16 KiB limit. The shared strict schema rejects unknown payload fields. Auth rates use an atomic D1 counter per trusted Cloudflare client IP and endpoint; writes allow 30 operations per minute per account. The local fallback rate bucket is shared when Cloudflare's IP header is unavailable.

## Gallery consistency and deletion

Each post receives a fixed cryptographic random integer. SQL combines it with the browsing seed, orders by the resulting rank and stable post ID, and uses keyset pagination. The cursor binds the seed, cutoff, search, author, and initial sequence high-water mark. Later creations are excluded, removed posts are skipped, and repeated pages keep their order. Searches cover normalized titles, descriptions, and English/Japanese action labels, with SQL wildcard characters escaped. A changed search requires a fresh cursor.

The initial query scans eligible posts to sort them; this is suitable for the initial small gallery. Large galleries should be measured and given an indexed ranking strategy before growth makes these scans costly. Search changes made by an author during browsing may affect whether an unseen post matches, but stable rank/ID pagination still prevents duplicate post IDs.

Creation stores an owner-scoped idempotency key and the hash of the validated canonical input. A matching replay returns the existing post; a changed input returns 409. A replay after another successful update returns that post's current version, so the CLI must read back and compare the reviewed snapshot. Deletion clears the title, description, settings, and search text while retaining only the idempotency tombstone and operational identifiers. Reusing that deleted key returns 410 and never recreates the post. D1 backups may retain historical content for their configured retention period.

## Operator commands

Operations use the existing Wrangler account credentials. No web admin API, admin bearer token, or additional service is introduced. Run from `apps/web`. The `admin` script selects the local environment and prints a SQL plan by default. Inspect it, then add `--apply` to execute locally.

```sh
npm run admin -- hide-post <post-uuid>
npm run admin -- show-post <post-uuid>
npm run admin -- block-user <numeric-github-user-id> --reason "Reason"
npm run admin -- unblock-user <numeric-github-user-id>
npm run admin -- cleanup
```

For production, use `npm run admin:production -- cleanup --remote` (or another reviewed action) to print the SQL, then append `--apply` to execute. The production script passes `CLOUDFLARE_ENV=production` through to Wrangler, and the CLI explicitly selects `wrangler.jsonc` so the previous build cannot redirect the database target; `--remote` and `--apply` remain explicit requirements. Do not use the local `admin` script with `--remote`, or invoke `admin.ts --remote --apply` without selecting the production environment. Targets are validated and reasons are SQL-escaped; execution uses a private temporary SQL file and an argument array, never a shell-interpolated command. Check the returned status row: an empty row means no matching post or GitHub account existed. Find the immutable GitHub ID in the private `account` table (`providerId = 'github'`) rather than relying on a renameable username.

Hiding keeps the record available to its owner for deletion but removes it from public pages. Blocking prevents creation and updates, revokes all current sessions and pending device requests, and still allows the person to sign in again to delete their own content. It does not automatically hide prior posts. Unblocking allows new writes; revoked sessions remain revoked. `cleanup` removes expired authentication records and old rate-limit counters. Run cleanup as part of routine maintenance; no scheduled job has been created.

## Verification and recovery

`npm test --workspace=@my-micro/web` uses the actual Miniflare D1 implementation, production `handleApi`, generated authentication schema, and synthetic users. Test users/sessions are inserted only by the test fixture; production has no bypass. The suite verifies schema compatibility, public-field allowlists, parallel idempotency, ownership, optimistic versions, deletion, stable paging with insert/delete, search escaping, Origin/body limits, session revocation, device approval/denial/expiry/polling, and atomic rate limiting. It does not contact GitHub or seed the public gallery.

Before changing the production schema, inspect the migration and use D1 Time Travel/bookmarks or an export appropriate to the active database. Rehearse restoration on a separate database so a restore does not overwrite valid later writes. Keep the previous Worker version available with Wrangler deployments/rollback. A Worker rollback does not roll back D1 schema; additive migrations should remain compatible with the preceding Worker. Recovery commands and retention must be checked against the actual account before first publication.

Sources checked for this implementation: [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [Better Auth GitHub](https://better-auth.com/docs/authentication/github), [Device Authorization](https://better-auth.com/docs/plugins/device-authorization), [Bearer](https://better-auth.com/docs/plugins/bearer), [session management](https://better-auth.com/docs/concepts/session-management), [rate limits](https://better-auth.com/docs/concepts/rate-limit), and [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/). The authentication migration is generated from the pinned package's configuration and checked against that package in the D1 tests.
