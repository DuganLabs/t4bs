-- Why a submission was rejected (docs/PRD.md §4.4, backlog T4-021).
--
-- Reject used to commit on the first tap with nothing recorded and the row
-- vanishing from every list. A rejection now carries a reason, and decided
-- rows stay visible in the admin queue tab. NULL for approvals and for the
-- rows decided before this column existed.
ALTER TABLE submissions ADD COLUMN reason TEXT;
