/// <reference types="node" />
/** Operator-only CLI. Uses existing Wrangler credentials; never imported by the Worker. */
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const usage = `Usage: node --import tsx app/server/admin.ts <action> [target] [--reason text] [--remote] [--apply]
Actions: hide-post <post-id>, show-post <post-id>, block-user <numeric-github-id>, unblock-user <numeric-github-id>, cleanup
Default: print SQL for the local database. --apply executes it; --remote selects the production database.`;

function sqlText(value: string): string { return `'${value.replace(/'/g, "''")}'`; }

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.length === 0) { console.log(usage); return; }
  const action = args.shift();
  const target = args[0]?.startsWith("--") ? "" : args.shift() ?? "";
  let apply = false;
  let remote = false;
  let reason = "Operator moderation";
  while (args.length) {
    const option = args.shift();
    if (option === "--apply") apply = true;
    else if (option === "--remote") remote = true;
    else if (option === "--reason" && args[0] && !args[0].startsWith("--")) reason = args.shift()!;
    else throw new Error(`Unsupported or incomplete option: ${option}`);
  }
  if (reason.length > 500 || reason.includes("\0")) throw new Error("Reason must be at most 500 characters and contain no NUL.");
  let sql: string;
  const now = Date.now();
  if (action === "hide-post" || action === "show-post") {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target)) throw new Error("Expected a post UUID.");
    sql = `UPDATE posts SET hidden_at = ${action === "hide-post" ? now : "NULL"} WHERE id = ${sqlText(target)} AND deleted_at IS NULL;\nSELECT id, hidden_at FROM posts WHERE id = ${sqlText(target)};`;
  } else if (action === "block-user" || action === "unblock-user") {
    if (!/^[1-9]\d{0,19}$/.test(target)) throw new Error("Expected the immutable numeric GitHub user ID, not a username.");
    const owner = `SELECT userId FROM account WHERE providerId = 'github' AND accountId = ${sqlText(target)}`;
    sql = action === "block-user"
      ? `INSERT INTO blocked_users(user_id, blocked_at, reason) SELECT userId, ${now}, ${sqlText(reason)} FROM account WHERE providerId = 'github' AND accountId = ${sqlText(target)} ON CONFLICT(user_id) DO UPDATE SET blocked_at = excluded.blocked_at, reason = excluded.reason;\nDELETE FROM session WHERE userId IN (${owner});\nDELETE FROM deviceCode WHERE userId IN (${owner});`
      : `DELETE FROM blocked_users WHERE user_id IN (${owner});`;
    sql += `\nSELECT u.id, u.username, b.blocked_at FROM user u LEFT JOIN blocked_users b ON b.user_id = u.id WHERE u.id IN (${owner});`;
  } else if (action === "cleanup") {
    if (target) throw new Error("cleanup does not accept a target.");
    const timestamp = sqlText(new Date(now).toISOString());
    sql = `DELETE FROM session WHERE expiresAt <= ${timestamp};\nDELETE FROM verification WHERE expiresAt <= ${timestamp};\nDELETE FROM deviceCode WHERE expiresAt <= ${timestamp};\nDELETE FROM api_rate_limits WHERE window_start < ${now - 86_400_000};`;
  } else throw new Error(`Unknown action: ${action}`);
  if (!apply) { console.log(`-- Dry run: ${remote ? "remote" : "local"} database\n${sql}`); return; }
  const directory = await mkdtemp(join(tmpdir(), "my-micro-admin-"));
  try {
    const file = join(directory, "operation.sql");
    await writeFile(file, sql, { mode: 0o600 });
    const result = spawnSync("npm", ["exec", "--", "wrangler", "d1", "execute", "my-micro", "--config", "wrangler.jsonc", remote ? "--remote" : "--local", "--file", file], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)), stdio: "inherit", shell: false,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Wrangler exited with status ${result.status ?? "unknown"}.`);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Admin command failed."); process.exitCode = 1; });
