import { ApiError, sha256 } from "./http";

/** One atomic SQLite statement prevents concurrent requests from sharing a stale count. */
export async function consumeRate(db: D1Database, key: string, window: number, max: number) {
  const now = Date.now();
  const row = await db.prepare(`
    INSERT INTO api_rate_limits (key, window_start, count) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN window_start <= ? THEN 1 ELSE MIN(count + 1, ?) END,
      window_start = CASE WHEN window_start <= ? THEN excluded.window_start ELSE window_start END
    RETURNING count, window_start
  `).bind(await sha256(key), now, now - window * 1000, max + 1, now - window * 1000).first<{ count: number; window_start: number }>();
  if (!row) throw new Error("Rate limit statement did not return a row");
  return { allowed: row.count <= max, retryAfter: row.count <= max ? null : Math.max(1, Math.ceil((row.window_start + window * 1000 - now) / 1000)) };
}

export async function enforceRate(db: D1Database, key: string, window = 60, max = 30): Promise<void> {
  const result = await consumeRate(db, key, window, max);
  if (!result.allowed) {
    throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please try again shortly.", { "Retry-After": String(result.retryAfter) });
  }
}
