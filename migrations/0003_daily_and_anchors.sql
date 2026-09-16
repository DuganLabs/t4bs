-- Server-authoritative daily + anchor content.
--
-- 1. `daily_results` makes the daily real: one row per (player,
--    day). The old daily was a client-side date pick with nothing
--    behind it, so "one puzzle a day" was a suggestion the client was
--    free to ignore. The primary key is what stops a replay for score.
--
--    player_key is `u:<user id>` for a signed-in player and
--    `a:<uuid>` for an anonymous one (httpOnly `t4bs_pid` cookie) —
--    Tabs is account-optional and the daily must work signed out.
--
-- 2. The ten house puzzles shipped with `anchors: '[]'` despite the
--    README and PRD both describing anchor letters as the player's
--    bootstrap, and two of them contained one-letter words that
--    shared/submission.js's validator rejects. Both are fixed below;
--    shared/seed-puzzles.js is now the single source of truth and
--    seed.sql is generated from it.

CREATE TABLE IF NOT EXISTS daily_results (
  player_key TEXT    NOT NULL,
  day        TEXT    NOT NULL,                      -- YYYY-MM-DD day key
  puzzle_id  INTEGER NOT NULL,
  outcome    TEXT    NOT NULL,                      -- 'won' | 'lost'
  score      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (player_key, day)
);
CREATE INDEX IF NOT EXISTS idx_daily_results_player_day ON daily_results(player_key, day DESC);

-- Anchors for the shipped house content. Guarded on submitted_by so a
-- community puzzle that happens to share an id range is never touched.
UPDATE puzzles SET anchors = '[{"wi":2,"li":0},{"wi":4,"li":3}]' WHERE id = 1  AND submitted_by = 'house';
UPDATE puzzles SET anchors = '[{"wi":1,"li":0},{"wi":3,"li":1}]', phrase = 'FOUR SCORE AND SEVEN YEARS' WHERE id = 2 AND submitted_by = 'house';
UPDATE puzzles SET anchors = '[{"wi":1,"li":0},{"wi":3,"li":2}]' WHERE id = 3  AND submitted_by = 'house';
UPDATE puzzles SET anchors = '[{"wi":1,"li":1},{"wi":3,"li":0}]' WHERE id = 4  AND submitted_by = 'house';
UPDATE puzzles SET anchors = '[{"wi":0,"li":3},{"wi":1,"li":0}]' WHERE id = 5  AND submitted_by = 'house';
UPDATE puzzles SET anchors = '[{"wi":0,"li":0},{"wi":3,"li":3}]' WHERE id = 6  AND submitted_by = 'house';
UPDATE puzzles SET anchors = '[{"wi":0,"li":0},{"wi":3,"li":0}]' WHERE id = 7  AND submitted_by = 'house';
UPDATE puzzles SET anchors = '[{"wi":0,"li":0},{"wi":1,"li":0}]' WHERE id = 8  AND submitted_by = 'house';
UPDATE puzzles SET anchors = '[{"wi":0,"li":0},{"wi":2,"li":0}]', phrase = 'HAPPILY EVER AFTER' WHERE id = 9 AND submitted_by = 'house';
UPDATE puzzles SET anchors = '[{"wi":0,"li":0},{"wi":2,"li":0}]' WHERE id = 10 AND submitted_by = 'house';
