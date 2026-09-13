---
name: share-micro
description: Create a private local preview of supported macOS Codex Micro settings, then publish or manage My Micro posts after the user confirms the exact content or target.
---

# Share My Micro

Use the installed collector to share the user's Micro configuration with My Micro. The source config is read-only. Scope: macOS Codex app 26.908.40834, build 8881. Other builds stop instead of inferring compatibility.

## Runtime and installation

The plugin root is two directories above this skill folder. Use its `scripts/run.sh` launcher. It finds Node.js 22+ on PATH or in standard Codex / ChatGPT application locations. A custom app directory can be set with `MY_MICRO_CODEX_APP`; `--app` tells the collector which app to inspect. If no runtime is available, call Codex's `load_workspace_dependencies` and set `MY_MICRO_NODE` to its returned Node executable. Do not require npm or another plugin from the end user.

After first installation, explicitly read the `SKILL.md` at the CLI's returned `installedPath` and execute the launcher from that same plugin. This direct-script route works in the same conversation. A new task is needed only for automatic discovery of newly installed skills; it is not a prerequisite for this route. Reuse an existing installation from the requested repository. See [installation and release procedure](../../INSTALL.md) when installation or update is needed.

## Local preview

Use the My Micro service origin explicitly supplied by the site's sharing prompt, passing it as `--service` when creating the draft or signing in. A published release may also provide it in `service.json`. Never guess a production hostname. Development accepts only HTTP loopback origins; other services require HTTPS.

1. Run `scripts/run.sh doctor` and then `scripts/run.sh collect --out <new-local-settings-file>`. Use an untracked temporary directory and a new filename. The collector reads only the supported Micro settings from the Codex config, filters them, and writes a private local snapshot. It does not authenticate or send the configuration.
2. Use the user's requested title and description. If none was supplied, propose a short factual title and leave the description empty; do not invent the user's intent. Run `scripts/run.sh draft --settings <settings-file> --title <title> --description <description> --service <origin> --out <new-draft-file>`.
3. Read the draft preview in full. Show its title, description, every visible key's keycap and action, knob gestures, stick directions, options, app version, capture time, and any unsupported items. Values listed in `source.defaultedFields` were resolved from the supported app's defaults. Render a readable table in the conversation; do not show only a hash or a subset of the settings. Explain that custom skill names are public, while paths, skill contents, text shortcut bodies, conversation names/IDs, and credentials are excluded.
4. This first preview is local and is not yet tied to a publishing account. When the user wants to publish, continue with account binding below before requesting final publication approval.

Never read or print the raw config yourself to bypass a collection error. Do not inspect Codex / ChatGPT credentials or conversation files. Unknown fields are reported by a fixed field category without their values. Custom agent-key targets remain private and are marked unavailable. A parsing or compatibility error stops publication; explain the collector's fixed error message.

## Authenticate and publish

If authentication is needed, run `scripts/run.sh login --service <origin>`. It prints a verification URL and user code, then polls. Show those to the user or open that exact URL in the browser. The user must verify that the browser's code matches and explicitly permit the connection. That connection approval is separate from publication approval. Keep the polling process available while the user signs in; do not repeat login while one request is pending. Denial or expiry ends that attempt.

After login, run `scripts/run.sh bind-account --draft <draft-file> --out <new-final-draft-file>`. This retains the snapshot and retry key and binds the publishing account into a new approval hash. Show the account username/ID, service, and complete final preview. Ask for explicit approval of that exact draft. Installation, sign-in, and approval of the earlier unbound preview do not approve this final draft. Older saved create drafts also need this step.

Only after this account-bound draft has been approved, run `scripts/run.sh publish --draft <final-draft-file> --confirm <approvalHash-from-final-preview>`. The CLI sends the saved snapshot and verifies the stored result by reading it back. Return its public page URL after verification succeeds.

- Never recollect settings, edit the saved draft, or change its title, destination, account, or target between preview and submission. Changes require a new draft, a complete preview, and approval again.
- For an uncertain network result, retry the same draft and confirmation hash. It carries a stable idempotency key. Do not create a replacement draft to retry.
- A conflict requires reading the latest post and making a new preview. A read-back mismatch means a write may already have happened; inspect that post before taking another action.
- Never put tokens on the command line, print credential files, or send them through chat. The CLI stores its own My Micro token per service origin with owner-only access and never reads Codex authentication data.

## Update, delete, and disconnect

Use `scripts/run.sh posts --service <origin>` to identify the user's post. If `page.cursor` is present and the target is not on that page, pass it in the next call as `--cursor <cursor>`; continue until the target is found or the cursor is null. For updates, collect a fresh local snapshot and create a draft with `--post <id>`; it records the target's current version and checks ownership. Show the target URL and full resulting public content, obtain confirmation, and publish that saved draft. Update and deletion drafts also bind the owner account; if the signed-in account changes, switch back or create a new preview.

For deletion, run `scripts/run.sh delete-draft --post <id> --service <origin> --out <new-draft-file>`. Show the target URL, title, and version, explicitly ask to delete that post, then use the same `publish --draft ... --confirm ...` command. The server requires the confirmed version so a changed post is not silently deleted.

Use `scripts/run.sh logout --service <origin>` to revoke this connection and remove local credentials. A network failure retains them so revocation can be retried; do not claim a successful disconnect. The site also exposes the user's posts and connected sessions for browser management.
