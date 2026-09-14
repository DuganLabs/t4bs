/* Daily-puzzle selection + streak maths — pure, no I/O.

   The old daily was `dailyPuzzle()` in src/lib/game.js: a *client-side*
   pick seeded off the browser's LOCAL date. Nothing server-side agreed
   with it, so two players in different time zones got different
   "dailies", and any client could simply POST /api/session with any
   puzzle id and replay the whole catalogue in one sitting.

   This module is the server's answer to "which puzzle is today's?" and
   "how long is this player's streak?". It lives in shared/ because the
   Vite dev mock and the Cloudflare Functions both need the identical
   answer, and because pure functions are the only part of this worth
   unit-testing. */

/** UTC day key, `YYYY-MM-DD`. UTC (not local time) so every player in
 *  the world is on the same puzzle at the same moment.
 *  @param {Date} [date] */
export function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** Shift a `YYYY-MM-DD` key by whole days. @param {string} dayKey @param {number} days */
export function shiftDay(dayKey, days) {
  const t = Date.parse(`${dayKey}T00:00:00Z`);
  if (Number.isNaN(t)) return dayKey;
  return utcDayKey(new Date(t + days * 86400000));
}

/** Milliseconds until the next UTC midnight — drives the "next puzzle
 *  in 6h" line on the lobby. @param {Date} [now] */
export function msUntilNextUtcDay(now = new Date()) {
  const next = Date.parse(`${shiftDay(utcDayKey(now), 1)}T00:00:00Z`);
  return Math.max(0, next - now.getTime());
}

/* FNV-1a. A plain `hash % length` over a date string with a weak hash
   walks the catalogue in near-order (the old `(h << 5) - h` seed did
   exactly that on consecutive days); FNV-1a's avalanche keeps
   consecutive days uncorrelated with a handful of puzzles. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministically pick one puzzle id for a UTC day. Same day + same
 * catalogue ⇒ same answer on every machine, which is the whole point.
 *
 * @param {ReadonlyArray<number>} puzzleIds
 * @param {string} dayKey
 * @returns {number | null}
 */
export function pickDailyPuzzleId(puzzleIds, dayKey) {
  const ids = [...(puzzleIds || [])].filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (ids.length === 0) return null;
  return ids[fnv1a(String(dayKey)) % ids.length];
}

/**
 * The next daily, without repeats.
 *
 * `usedIds` is every puzzle the schedule has already handed out this cycle.
 * The pick is made from the approved puzzles NOT in that set, keyed on the
 * day so two servers filling the same day agree; when every puzzle has been
 * today's once, the cycle starts over. The schedule table is what makes
 * this stick — this function is only ever asked about a day that has no
 * row yet (docs/PRD.md §4.3).
 *
 * @param {ReadonlyArray<number>} puzzleIds  approved puzzle ids
 * @param {Iterable<number>} usedIds         ids already scheduled
 * @param {string} dayKey
 * @returns {number | null}
 */
export function nextDailyPuzzleId(puzzleIds, usedIds, dayKey) {
  const ids = [...(puzzleIds || [])].filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (ids.length === 0) return null;
  const used = new Set([...(usedIds || [])].map(Number));
  let pool = ids.filter(id => !used.has(id));
  if (pool.length === 0) pool = ids;                 // cycle complete: start again
  return pool[fnv1a(String(dayKey)) % pool.length];
}

/**
 * Current + best daily streak from a player's recorded results.
 *
 * A streak counts consecutive UTC days whose daily was SOLVED. Today
 * is allowed to be missing (the day isn't over — the streak survives
 * until tomorrow), but a *lost* daily today breaks it immediately.
 *
 * @param {ReadonlyArray<{ day: string, outcome: string }>} results
 * @param {string} todayKey
 * @returns {{ current: number, best: number, playedToday: boolean }}
 */
export function computeStreak(results, todayKey) {
  const byDay = new Map();
  for (const r of results || []) {
    if (r && typeof r.day === "string") byDay.set(r.day, r.outcome);
  }
  const playedToday = byDay.has(todayKey);

  let cursor = todayKey;
  if (!playedToday) cursor = shiftDay(todayKey, -1);
  else if (byDay.get(todayKey) !== "won") return { current: 0, best: bestRun(byDay), playedToday };

  let current = 0;
  while (byDay.get(cursor) === "won") {
    current++;
    cursor = shiftDay(cursor, -1);
  }
  return { current, best: Math.max(current, bestRun(byDay)), playedToday };
}

/** Longest run of consecutive won days anywhere in the history. */
function bestRun(byDay) {
  const won = [...byDay.entries()].filter(([, o]) => o === "won").map(([d]) => d).sort();
  let best = 0, run = 0, prev = null;
  for (const day of won) {
    run = prev !== null && shiftDay(prev, 1) === day ? run + 1 : 1;
    if (run > best) best = run;
    prev = day;
  }
  return best;
}
