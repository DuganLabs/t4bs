-- Migration 0002: add puzzle_id to share_cards so /s/{id} can redirect
-- recipients into the same puzzle the original player solved/busted.
-- Apply local:  wrangler d1 execute tabs-db --local  --file=./migrations/0002_share_cards_puzzle_id.sql
-- Apply remote: wrangler d1 execute tabs-db --remote --file=./migrations/0002_share_cards_puzzle_id.sql

ALTER TABLE share_cards ADD COLUMN puzzle_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_share_cards_puzzle ON share_cards(puzzle_id);
