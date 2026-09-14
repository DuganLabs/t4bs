-- v2 engine (docs/PRD.md §5–§6).
--
-- par: the score a strong player gets on this puzzle, set in admin. NULL
-- means "derive it" — shared/pure.js parFor() computes a default from the
-- phrase and its anchors, so nothing has to be backfilled for the game to
-- work, and a puzzle only carries a stored par once someone has looked at
-- its win rate and decided.
ALTER TABLE puzzles ADD COLUMN par INTEGER;

-- status gains 'retired'. There is no CHECK constraint on puzzles.status to
-- alter (schema.sql declares it as plain TEXT), so this is a convention,
-- enforced by the queries: listApproved() selects status='approved' and a
-- retired puzzle simply stops being offered while every session and share
-- card that references it keeps resolving.

-- In-flight v1 sessions hold state the v2 engine cannot read (per-word
-- locks, wagers, tokens). Every one of them is abandoned here rather than
-- migrated: a round nobody has finished is not worth a translation layer,
-- and resumeSession would otherwise 500 on each of them. The client treats
-- a missing session as "start fresh", which is what happens.
DELETE FROM sessions;
