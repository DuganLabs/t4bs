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
   unit-testing.

   The day key used to be UTC, and UTC rolls at 7 PM CDT / 6 PM CST: a
   player in US Central who sat down after dinner was handed TOMORROW's
   puzzle, and the "next puzzle in Xh" line was wrong by the same
   amount. The daily now rolls at midnight in one fixed zone,
   DAILY_ZONE. That is still a single instant for the whole world —
   everyone is on the same puzzle at the same moment — so the server
   stays authoritative and the visitor's own clock and zone are still
   never consulted. Do not reintroduce a client-local date.

   Nothing stored changes. Day keys are still `YYYY-MM-DD` strings in
   the same columns; only which calendar picks the key moved, so rows
   written under the old UTC key read back fine and there is no
   migration. At worst one historical row near a boundary is now
   attributed to the neighbouring day, which is not worth rewriting a
   table over. */

/** The one zone the daily rolls over in. Not the player's zone and not
 *  UTC: a fixed zone, so "today's puzzle" is one puzzle worldwide. */
export const DAILY_ZONE = "America/Chicago";

/** DAILY_ZONE for player-facing copy — keep the two in step. */
export const DAILY_ZONE_LABEL = "Central Time";

/* `en-CA` formats a date as `YYYY-MM-DD`, which is the key shape
   exactly; the parts are still read out individually so the result is
   not at the mercy of an ICU locale tweak. Formatters are built once —
   constructing one is the expensive part of Intl. */
const dayParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: DAILY_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
const wallParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: DAILY_ZONE, hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** @param {Intl.DateTimeFormat} fmt @param {Date} date */
function numericParts(fmt, date) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const { type, value } of fmt.formatToParts(date)) {
    if (type !== "literal") out[type] = Number(value);
  }
  return out;
}

/** @param {number} n @param {number} width */
function pad(n, width) {
  return String(n).padStart(width, "0");
}

/** Day key, `YYYY-MM-DD`, in DAILY_ZONE. DST-aware: Intl resolves the
 *  offset actually in force at that instant rather than assuming one.
 *  @param {Date} [date] */
export function zonedDayKey(date = new Date()) {
  const { year, month, day } = numericParts(dayParts, date);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/**
 * Shift a `YYYY-MM-DD` key by whole days.
 *
 * Calendar arithmetic on the date PARTS, never `+ days * 86400000` on
 * an instant: a DST day is 23 or 25 hours long, so a fixed 24h step
 * across a transition repeats or skips a day. `Date.UTC` is used here
 * purely as a calendar (month lengths, leap years) and read straight
 * back out in UTC — no zone is involved, so no transition can reach it.
 *
 * @param {string} dayKey @param {number} days
 */
export function shiftDay(dayKey, days) {
  const m = DAY_KEY.exec(String(dayKey));
  if (!m) return dayKey;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(days)));
  if (Number.isNaN(d.getTime())) return dayKey;
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

/** DAILY_ZONE's offset from UTC at instant `ms`, in milliseconds.
 *  @param {number} ms */
function zoneOffsetMs(ms) {
  const p = numericParts(wallParts, new Date(ms));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;   // the parts dropped sub-second precision
}

/**
 * The instant (ms since epoch) at which `dayKey` begins — midnight in
 * DAILY_ZONE. This is the rollover: the moment the daily changes over.
 *
 * Two passes, because the offset needed to place the instant is the
 * offset at the instant itself: guess with the offset in force at the
 * same wall clock read as UTC, then re-read the offset at the guess and
 * correct. One correction settles it — a transition moves the offset by
 * an hour or two, never far enough to land on a different day.
 *
 * @param {string} dayKey
 * @returns {number} NaN for a malformed key
 */
export function zoneMidnightMs(dayKey) {
  const m = DAY_KEY.exec(String(dayKey));
  if (!m) return NaN;
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return wall - zoneOffsetMs(wall - zoneOffsetMs(wall));
}

/**
 * Milliseconds until the daily rolls over — the next midnight in
 * DAILY_ZONE. Drives the "next puzzle in 6h" line on the lobby.
 *
 * On the two DST days a year this is 23h or 25h rather than 24h,
 * because those days really are that long. Clamping it to 24h would
 * put the countdown an hour out of step with the rollover it counts
 * down to, which is the bug this whole change exists to fix.
 *
 * @param {Date} [now]
 */
export function msUntilNextRollover(now = new Date()) {
  const next = zoneMidnightMs(shiftDay(zonedDayKey(now), 1));
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
 * Deterministically pick one puzzle id for a day key. Same day + same
 * catalogue ⇒ same answer on every machine, which is the whole point.
 * The key itself is opaque here, so moving the calendar that produces
 * it (UTC → DAILY_ZONE) left every day's pick untouched.
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
 * A streak counts consecutive DAILY_ZONE days whose daily was SOLVED —
 * the same days the rollover uses, so an evening player in US Central
 * cannot have a streak break at 7 PM. Today is allowed to be missing
 * (the day isn't over — the streak survives until tomorrow), but a
 * *lost* daily today breaks it immediately.
 *
 * `todayKey` comes from zonedDayKey() and the recorded days were
 * written from it too, so the walk is calendar arithmetic on keys
 * (shiftDay) and never touches a clock.
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
