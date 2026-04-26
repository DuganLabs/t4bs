-- Migration 0001: roles + share_cards
-- Apply local:  wrangler d1 execute tabs-db --local  --file=./migrations/0001_roles_and_share_cards.sql
-- Apply remote: wrangler d1 execute tabs-db --remote --file=./migrations/0001_roles_and_share_cards.sql

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user','moderator','admin'));
ALTER TABLE users ADD COLUMN role_changed_at INTEGER;
ALTER TABLE users ADD COLUMN role_changed_by TEXT;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS share_cards (
  id          TEXT PRIMARY KEY,           -- short slug
  session_id  TEXT,                       -- optional FK to sessions.id (no constraint; sessions purge)
  user_id     TEXT,                       -- optional FK to users.id
  category    TEXT NOT NULL,
  score       INTEGER NOT NULL,
  won         INTEGER NOT NULL DEFAULT 0, -- 0|1
  grid        TEXT NOT NULL,              -- emoji-grid string (\n-separated rows)
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_share_cards_created ON share_cards(created_at);
