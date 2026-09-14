-- The daily schedule (docs/PRD.md §4.3).
--
-- The daily used to be `hash(day) % catalogue.length`: with twelve puzzles it
-- repeated within a fortnight, and there was no way to say "this one on
-- Saturday". Now each UTC day gets a row. A day with no row is filled when
-- first asked for (functions/_shared/game.js dailyStatus): the next puzzle
-- not yet used in the current cycle, chosen deterministically from the day
-- key, so no puzzle repeats until every approved one has been today's. A
-- pinned row is set by an admin and never overwritten by the filler.
CREATE TABLE IF NOT EXISTS daily_schedule (
  day        TEXT    PRIMARY KEY,                    -- UTC YYYY-MM-DD
  puzzle_id  INTEGER NOT NULL,
  pinned     INTEGER NOT NULL DEFAULT 0,             -- 1 = set by hand, keep
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_daily_schedule_puzzle ON daily_schedule(puzzle_id);
