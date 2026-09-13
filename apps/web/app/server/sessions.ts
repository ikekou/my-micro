import { z } from "zod";
import type { SessionInfo, SessionPage } from "@my-micro/shared";
import { ApiError } from "./http";

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const cursorSchema = z.object({ owner: identifier, createdAt: z.iso.datetime(), id: identifier }).strict();
type SessionRow = Omit<SessionInfo, "current">;
const columns = "SELECT id, createdAt, expiresAt, userAgent FROM session";

export async function listSessions(db: D1Database, url: URL, owner: string, currentId: string): Promise<SessionPage> {
  const rawLimit = url.searchParams.get("limit") ?? "20";
  if (!/^\d{1,3}$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 100) {
    throw new ApiError(400, "INVALID_QUERY", "Use a connection page size between 1 and 100.");
  }
  const limit = Number(rawLimit);
  let cursor: z.infer<typeof cursorSchema> | undefined;
  const raw = url.searchParams.get("cursor");
  if (raw !== null) {
    try {
      if (raw.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
      cursor = cursorSchema.parse(JSON.parse(atob(raw.replace(/-/g, "+").replace(/_/g, "/"))));
      if (cursor.owner !== owner) throw new Error();
    } catch { throw new ApiError(400, "INVALID_CURSOR", "Refresh your connections to start a new list."); }
  }
  const now = new Date().toISOString();
  const [result, current] = await Promise.all([
    db.prepare(`${columns} WHERE userId = ? AND expiresAt > ?
      AND (? IS NULL OR createdAt < ? OR (createdAt = ? AND id < ?))
      ORDER BY createdAt DESC, id DESC LIMIT ?`)
      .bind(owner, now, cursor?.createdAt ?? null, cursor?.createdAt ?? "", cursor?.createdAt ?? "", cursor?.id ?? "", limit + 1).all<SessionRow>(),
    db.prepare(`${columns} WHERE userId = ? AND id = ? AND expiresAt > ?`).bind(owner, currentId, now).first<SessionRow>(),
  ]);
  const rows = result.results.slice(0, limit);
  const last = rows.at(-1);
  const toInfo = (row: SessionRow): SessionInfo => ({ ...row, createdAt: new Date(row.createdAt).toISOString(), expiresAt: new Date(row.expiresAt).toISOString(), current: row.id === currentId });
  const next = result.results.length > limit && last
    ? btoa(JSON.stringify({ owner, createdAt: last.createdAt, id: last.id })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : null;
  return { sessions: rows.map(toInfo), currentSession: current ? toInfo(current) : null, page: { cursor: next } };
}
