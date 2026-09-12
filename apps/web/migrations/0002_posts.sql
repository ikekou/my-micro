CREATE TABLE posts (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  settings TEXT,
  search_text TEXT NOT NULL,
  shuffle_key INTEGER NOT NULL CHECK (shuffle_key > 0 AND shuffle_key < 2147483647),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  hidden_at INTEGER,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX posts_author ON posts(user_id, deleted_at, created_at);
CREATE INDEX posts_gallery ON posts(deleted_at, hidden_at, created_at);
CREATE TABLE blocked_users (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  blocked_at INTEGER NOT NULL,
  reason TEXT NOT NULL
);
CREATE TABLE api_rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
CREATE INDEX api_rate_limits_expiry ON api_rate_limits(window_start);
