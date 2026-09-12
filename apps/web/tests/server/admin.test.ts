import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const admin = fileURLToPath(new URL("../../app/server/admin.ts", import.meta.url));
const web = fileURLToPath(new URL("../../", import.meta.url));
const loader = import.meta.resolve("tsx");
const run = (args: string[]) => execFileSync(process.execPath, ["--import", loader, admin, ...args], { cwd: web, encoding: "utf8" });

test("admin cleanup compares real D1 ISO dates and preserves unexpired records", async () => {
  const options = convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response()}}", compatibilityDate: "2026-09-12", d1Databases: ["DB"] });
  options.telemetry = { enabled: false };
  const mf = new Miniflare(options);
  try {
    const db = await mf.getD1Database("DB");
    for (const table of ["session", "verification", "deviceCode"]) {
      await db.prepare(`CREATE TABLE ${table} (id TEXT PRIMARY KEY, expiresAt DATE NOT NULL)`).run();
      await db.prepare(`INSERT INTO ${table} VALUES (?, ?), (?, ?)`).bind("expired", new Date(Date.now() - 60_000).toISOString(), "active", new Date(Date.now() + 60_000).toISOString()).run();
    }
    await db.prepare("CREATE TABLE api_rate_limits (key TEXT PRIMARY KEY, window_start INTEGER)").run();
    await db.prepare("INSERT INTO api_rate_limits VALUES (?, ?), (?, ?)").bind("expired", Date.now() - 2 * 86_400_000, "active", Date.now()).run();
    const sql = run(["cleanup"]).split("\n").slice(1).join("\n");
    await db.batch(sql.split(";").map((part) => part.trim()).filter(Boolean).map((part) => db.prepare(part)));
    for (const table of ["session", "verification", "deviceCode"]) assert.deepEqual((await db.prepare(`SELECT id FROM ${table}`).all()).results, [{ id: "active" }]);
    assert.deepEqual((await db.prepare("SELECT key FROM api_rate_limits").all()).results, [{ key: "active" }]);
  } finally { await mf.dispose(); }
});

test("admin apply uses the web Wrangler cwd, separate arguments, and removes its temporary SQL", async () => {
  const directory = await mkdtemp(join(tmpdir(), "my-micro-admin-test-"));
  const log = join(directory, "invocation.json");
  try {
    // This local stand-in records invocation details; the test cannot reach Wrangler or production.
    await writeFile(join(directory, "npm"), `#!${process.execPath}\nimport {writeFileSync,readFileSync} from 'node:fs';\nconst args=process.argv.slice(2);writeFileSync(${JSON.stringify(log)},JSON.stringify({args,cwd:process.cwd(),environment:process.env.CLOUDFLARE_ENV,sql:readFileSync(args.at(-1),'utf8')}));\n`, { mode: 0o700 });
    const result = spawnSync(process.execPath, ["--import", loader, admin, "block-user", "12345", "--reason", "Operator's test", "--apply"], { cwd: directory, env: { ...process.env, PATH: `${directory}:${process.env.PATH}` }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const invocation = JSON.parse(await readFile(log, "utf8")) as { args: string[]; cwd: string; sql: string };
    assert.equal(invocation.cwd, web.replace(/\/$/, ""));
    assert.deepEqual(invocation.args.slice(0, 10), ["exec", "--", "wrangler", "d1", "execute", "my-micro", "--config", "wrangler.jsonc", "--local", "--file"]);
    assert(invocation.sql.includes("'Operator''s test'"));
    await assert.rejects(() => readFile(invocation.args.at(-1)!), { code: "ENOENT" });
    const productionResult = spawnSync(process.execPath, ["--import", loader, admin, "cleanup", "--remote", "--apply"], { cwd: directory, env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, CLOUDFLARE_ENV: "production" }, encoding: "utf8" });
    assert.equal(productionResult.status, 0, productionResult.stderr);
    const productionInvocation = JSON.parse(await readFile(log, "utf8")) as { args: string[]; cwd: string; environment: string };
    assert.equal(productionInvocation.cwd, web.replace(/\/$/, ""));
    assert.equal(productionInvocation.environment, "production");
    assert.deepEqual(productionInvocation.args.slice(0, 10), ["exec", "--", "wrangler", "d1", "execute", "my-micro", "--config", "wrangler.jsonc", "--remote", "--file"]);
    await assert.rejects(() => readFile(productionInvocation.args.at(-1)!), { code: "ENOENT" });
    const invalid = spawnSync(process.execPath, ["--import", loader, admin, "block-user", "123'; DELETE FROM user;--"], { cwd: web, encoding: "utf8" });
    assert.equal(invalid.status, 1);
    assert(invalid.stderr.includes("Expected the immutable numeric GitHub user ID"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
