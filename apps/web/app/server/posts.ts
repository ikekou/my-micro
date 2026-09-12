import { actionLabel, microSettingsSchema, snapshotHash, type PostInput, type PostPage, type PostUpdate, type PublicAction, type PublicAuthor, type PublicPost } from "@my-micro/shared";
import { z } from "zod";
import { ApiError } from "./http";

const MODULUS = 2_147_483_647;
const cursorSchema = z.object({
  seed: z.string().regex(/^[1-9]\d{0,9}$/), cutoff: z.iso.datetime(),
  q: z.string().max(100), author: z.string().max(100), snapshot: z.number().int().nonnegative(),
  rank: z.number().int().min(0).max(MODULUS - 1), id: z.string().uuid(),
}).strict();
type Cursor = z.infer<typeof cursorSchema>;
interface PostRow {
  id: string; user_id: string; title: string; description: string; settings: string;
  version: number; created_at: number; updated_at: number; username: string; image: string | null;
  rank: number; request_hash: string; deleted_at: number | null; hidden_at: number | null;
}
const select = `SELECT p.*, u.username, u.image FROM posts p JOIN user u ON u.id = p.user_id`;

export function publicAuthor(user: { id: string; username: string; image?: string | null }): PublicAuthor {
  let avatarUrl: string | null = null;
  if (user.image) {
    try {
      const url = new URL(user.image);
      if (url.protocol === "https:" && url.hostname === "avatars.githubusercontent.com") avatarUrl = url.href;
    } catch { /* Invalid profile images are omitted. */ }
  }
  return { id: user.id, username: user.username, avatarUrl };
}

function publicPost(row: PostRow): PublicPost {
  return {
    id: row.id, author: publicAuthor({ id: row.user_id, username: row.username, image: row.image }),
    title: row.title, description: row.description, settings: microSettingsSchema.parse(JSON.parse(row.settings)),
    version: row.version, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function searchText(input: PostInput): string {
  const { slots, encoder, analogStick } = input.settings.layout;
  const actions: PublicAction[] = [...slots.map((slot) => slot.action), encoder.clockwise, encoder.counterclockwise, encoder.press, encoder.longPress, ...Object.values(analogStick)];
  return [input.title, input.description, ...actions.flatMap((action) => [actionLabel(action, "en"), actionLabel(action, "ja")])].join(" ").normalize("NFKC").toLowerCase();
}

function randomNumber(): number { return crypto.getRandomValues(new Uint32Array(1))[0]! % (MODULUS - 1) + 1; }
function encodeCursor(cursor: Cursor): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(cursor)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeCursor(raw: string): Cursor {
  try {
    if (raw.length > 2500 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
    const bytes = Uint8Array.from(atob(raw.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
    return cursorSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch { throw new ApiError(400, "INVALID_CURSOR", "The gallery cursor is invalid. Start a new exploration."); }
}

export async function listPosts(db: D1Database, url: URL, owner?: string): Promise<PostPage> {
  const q = (url.searchParams.get("q") ?? "").trim().normalize("NFKC").toLowerCase();
  const author = owner ?? url.searchParams.get("author") ?? "";
  const rawLimit = url.searchParams.get("limit") ?? "18";
  if (q.length > 100 || author.length > 100 || !/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 48) {
    throw new ApiError(400, "INVALID_QUERY", "Invalid search, author, or page size.");
  }
  const limit = Number(rawLimit);
  const cursor = url.searchParams.get("cursor") ? decodeCursor(url.searchParams.get("cursor")!) : null;
  const seed = url.searchParams.get("seed") ?? cursor?.seed ?? String(randomNumber());
  const cutoff = url.searchParams.get("cutoff") ?? cursor?.cutoff ?? new Date().toISOString();
  if (!/^[1-9]\d{0,9}$/.test(seed) || Number(seed) >= MODULUS || !z.iso.datetime().safeParse(cutoff).success || Date.parse(cutoff) > Date.now() + 1000) {
    throw new ApiError(400, "INVALID_QUERY", "Invalid gallery seed or cutoff.");
  }
  if (cursor && (cursor.seed !== seed || cursor.cutoff !== cutoff || cursor.q !== q || cursor.author !== author)) {
    throw new ApiError(400, "CURSOR_MISMATCH", "Keep the same search and gallery parameters while paging.");
  }
  // Sequence high-water mark excludes inserts made in the same millisecond as the cutoff.
  const snapshot = cursor?.snapshot ?? (await db.prepare("SELECT COALESCE(MAX(sequence), 0) AS value FROM posts").first<{ value: number }>())!.value;
  const escapedQuery = q.replace(/[\\%_]/g, "\\$&");
  const rank = `((p.shuffle_key * ?) % ${MODULUS})`;
  const results = await db.prepare(`
    SELECT p.*, u.username, u.image, ${rank} AS rank FROM posts p JOIN user u ON u.id = p.user_id
    WHERE p.deleted_at IS NULL ${owner ? "" : "AND p.hidden_at IS NULL"}
      AND p.created_at <= ? AND p.sequence <= ?
      AND (? = '' OR p.user_id = ?) AND (? = '' OR p.search_text LIKE ? ESCAPE '\\')
      AND (? IS NULL OR ${rank} > ? OR (${rank} = ? AND p.id > ?))
    ORDER BY rank, p.id LIMIT ?
  `).bind(Number(seed), Date.parse(cutoff), snapshot, author, author, q, `%${escapedQuery}%`, cursor?.rank ?? null,
    Number(seed), cursor?.rank ?? 0, Number(seed), cursor?.rank ?? 0, cursor?.id ?? "", limit + 1).all<PostRow>();
  const rows = results.results.slice(0, limit);
  const last = rows.at(-1);
  return { items: rows.map(publicPost), page: { seed, cutoff, cursor: results.results.length > limit && last ? encodeCursor({ seed, cutoff, q, author, snapshot, rank: last.rank, id: last.id }) : null } };
}

export async function getPost(db: D1Database, id: string): Promise<PublicPost> {
  const row = await db.prepare(`${select} WHERE p.id = ? AND p.deleted_at IS NULL AND p.hidden_at IS NULL`).bind(id).first<PostRow>();
  if (!row) throw new ApiError(404, "POST_NOT_FOUND", "This Micro could not be found.");
  return publicPost(row);
}

export async function assertCanWrite(db: D1Database, userId: string): Promise<void> {
  if (await db.prepare("SELECT user_id FROM blocked_users WHERE user_id = ?").bind(userId).first()) {
    throw new ApiError(403, "WRITES_DISABLED", "Posting is disabled for this account.");
  }
}

export async function createPost(db: D1Database, userId: string, input: PostInput, key: string): Promise<{ post: PublicPost; created: boolean }> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "Send a unique Idempotency-Key of 16–128 letters, digits, dashes, or underscores.");
  const hash = await snapshotHash(input);
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.prepare(`INSERT INTO posts (id, user_id, title, description, settings, search_text, shuffle_key, version, created_at, updated_at, idempotency_key, request_hash)
    SELECT ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM blocked_users WHERE user_id = ?)
    ON CONFLICT(user_id, idempotency_key) DO NOTHING`).bind(id, userId, input.title, input.description, JSON.stringify(input.settings), searchText(input), randomNumber(), now, now, key, hash, userId).run();
  const row = await db.prepare(`${select} WHERE p.user_id = ? AND p.idempotency_key = ?`).bind(userId, key).first<PostRow>();
  if (!row) { await assertCanWrite(db, userId); throw new Error("Post creation failed"); }
  if (row.request_hash !== hash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "This Idempotency-Key already belongs to different content.");
  if (row.deleted_at !== null) throw new ApiError(410, "POST_DELETED", "The post created with this key was deleted. It will not be recreated.");
  if (row.hidden_at !== null) throw new ApiError(403, "POST_HIDDEN", "This post is currently hidden.");
  return { post: publicPost(row), created: row.id === id };
}

export async function updatePost(db: D1Database, userId: string, id: string, input: PostUpdate): Promise<PublicPost> {
  const result = await db.prepare(`UPDATE posts SET title = ?, description = ?, settings = ?, search_text = ?, version = version + 1, updated_at = ?
    WHERE id = ? AND user_id = ? AND version = ? AND deleted_at IS NULL AND hidden_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM blocked_users WHERE user_id = ?)
    RETURNING id`).bind(input.title, input.description, JSON.stringify(input.settings), searchText(input), Date.now(), id, userId, input.version, userId).first<{ id: string }>();
  if (!result) {
    await assertCanWrite(db, userId);
    const row = await db.prepare("SELECT version FROM posts WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND hidden_at IS NULL").bind(id, userId).first();
    if (!row) throw new ApiError(404, "POST_NOT_FOUND", "This Micro could not be found.");
    throw new ApiError(409, "VERSION_CONFLICT", "This Micro changed after your preview. Fetch it and review the update again.");
  }
  return getPost(db, id);
}

export async function deletePost(db: D1Database, userId: string, id: string, version: number): Promise<void> {
  // Keep only the idempotency tombstone; clear all published content.
  const row = await db.prepare(`UPDATE posts SET deleted_at = ?, title = '', description = '', settings = NULL, search_text = '', version = version + 1
    WHERE id = ? AND user_id = ? AND version = ? AND deleted_at IS NULL RETURNING id`).bind(Date.now(), id, userId, version).first();
  if (!row) {
    const existing = await db.prepare("SELECT id FROM posts WHERE id = ? AND user_id = ? AND deleted_at IS NULL").bind(id, userId).first();
    if (existing) throw new ApiError(409, "VERSION_CONFLICT", "This Micro changed. Review the current version before deleting.");
    throw new ApiError(404, "POST_NOT_FOUND", "This Micro could not be found.");
  }
}
