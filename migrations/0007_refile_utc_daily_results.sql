-- Re-file the daily results the old UTC day rule mis-attributed.
--
-- The day key was UTC until 2026-09-16 01:00:00 UTC, and UTC rolls at
-- 7 PM CDT. An evening player in the Americas therefore had the round
-- he played on Monday night filed under TUESDAY. That is not a cosmetic
-- off-by-one: daily_results is PRIMARY KEY (player_key, day) and
-- record() is INSERT OR IGNORE (functions/_shared/d1.js), so Monday's
-- misfiled row silently BLOCKS Tuesday's real result. The owner solved
-- Tuesday's puzzle and the site kept showing him Monday's BUSTED card,
-- because Monday's row was sitting on Tuesday's key.
--
-- WHICH ROWS. Everything written before 1789520400 (2026-09-16
-- 01:00:00 UTC), the instant the America/Chicago rule went live. Rows at
-- or after it were already keyed on a real local date and must not be
-- touched — hence the created_at guard, which together with
-- `day <> <recomputed day>` also makes this migration idempotent: run it
-- twice and the second run matches nothing.
--
-- THE RECOMPUTED DAY. SQLite has no IANA time zones, so the offset is
-- written out by hand as '-5 hours' — America/Chicago, CDT. That is
-- sound here and only here: every affected row was created between
-- 2026-09-13 and 2026-09-16, which is entirely inside CDT (US DST ran
-- 2026-03-08 to 2026-11-01), so no DST boundary falls inside the window
-- and one fixed offset is exact rather than approximate.
--
-- WHY CHICAGO, when the day key is now the VISITOR's own zone
-- (shared/daily.js): because for these particular rows the choice does
-- not matter. Every affected row was created between 00:00 and 06:00
-- UTC — evening across the Americas — and Chicago and Los_Angeles agree
-- on the calendar date for every one of them. Going forward the zone is
-- per visitor and read from request.cf.timezone; backwards, these rows
-- have one right answer and both zones give it.
--
-- WHY TWO PASSES. Shifting a row back one day can land on a day that
-- player already holds, and the PRIMARY KEY would reject it. Row order
-- is not something SQLite promises, so "update them in the right order"
-- is not a plan. Pass 1 moves every affected row's day to a sentinel
-- ('shift:' || day) that no real key can collide with — real keys are
-- YYYY-MM-DD — which vacates all the target days at once. Pass 2 then
-- writes the final value into rows that are all sitting on sentinels.
-- u:241957 is exactly this case: three rows, 2026-09-15/14/13, each
-- shifting back onto the day the next one is vacating.
--
-- The two passes have the same reach by construction: pass 2 repeats
-- pass 1's created_at guard and its `<original day> <> <recomputed day>`
-- comparison, reading the original day back out of the sentinel with
-- substr(day, 7) ('shift:' is six characters).
--
-- NOT RE-KEYED: daily_schedule. It maps a date to a puzzle and people
-- already played those puzzles on those dates; moving it would rewrite
-- what was actually served. A re-filed result therefore keeps its own
-- puzzle_id — the puzzle that player really played that evening — which
-- may differ from the puzzle the schedule lists for its new date. That
-- is honest history, and the places that render a day's phrase from the
-- schedule rather than from the row (shared/admin-stats.js
-- scheduleWindow, and dailyStatus's result card) will show the
-- schedule's puzzle beside a row that belongs to another. Reading the
-- row's own puzzle_id is the fix for those, not rewriting this table.

-- Pass 1 — vacate: move every mis-attributed row onto a key that
-- cannot collide with anything, real or re-filed.
UPDATE daily_results
   SET day = 'shift:' || day
 WHERE created_at < 1789520400
   AND day <> date(created_at, 'unixepoch', '-5 hours');

-- Pass 2 — settle: the same rows, now identifiable by their sentinel,
-- take the America/Chicago date of their own created_at.
UPDATE daily_results
   SET day = date(created_at, 'unixepoch', '-5 hours')
 WHERE created_at < 1789520400
   AND day LIKE 'shift:%'
   AND substr(day, 7) <> date(created_at, 'unixepoch', '-5 hours');
