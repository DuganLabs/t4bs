-- T4BS production schema for Cloudflare D1.
-- Apply: wrangler d1 execute tabs-db --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS puzzles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category     TEXT NOT NULL,
  phrase       TEXT NOT NULL,
  anchors      TEXT NOT NULL,                            -- JSON: [{wi,li},...]
  submitted_by TEXT NOT NULL DEFAULT 'house',
  status       TEXT NOT NULL DEFAULT 'approved',         -- 'pending'|'approved'|'rejected'
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_puzzles_status ON puzzles(status);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,                            -- random uuid
  puzzle_id  INTEGER NOT NULL,
  state      TEXT NOT NULL,                               -- JSON-serialized engine state
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,                            -- random uuid
  handle     TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS credentials (
  id           TEXT PRIMARY KEY,                          -- WebAuthn credentialID (base64url)
  user_id      TEXT NOT NULL,
  public_key   TEXT NOT NULL,                             -- base64url
  counter      INTEGER NOT NULL DEFAULT 0,
  transports   TEXT,                                      -- JSON array
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_credentials_user ON credentials(user_id);

CREATE TABLE IF NOT EXISTS challenges (
  challenge   TEXT PRIMARY KEY,
  user_id     TEXT,                                       -- NULL during initial registration
  purpose     TEXT NOT NULL,                              -- 'register'|'authenticate'
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_challenges_expires ON challenges(expires_at);

CREATE TABLE IF NOT EXISTS user_sessions (
  id         TEXT PRIMARY KEY,                            -- session token (cookie value)
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

CREATE TABLE IF NOT EXISTS submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category     TEXT NOT NULL,
  phrase       TEXT NOT NULL,
  anchors      TEXT NOT NULL,                              -- JSON
  submitted_by TEXT NOT NULL,                              -- handle
  status       TEXT NOT NULL DEFAULT 'pending',            -- 'pending'|'approved'|'rejected'
  decided_by   TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  decided_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
