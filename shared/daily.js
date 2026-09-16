/* Daily-puzzle selection + streak maths — pure, no I/O.

   The old daily was `dailyPuzzle()` in src/lib/game.js: a *client-side*
   pick seeded off the browser's LOCAL date. Nothing server-side agreed
   with it, so two players in different time zones got different
   "dailies", and any client could simply POST /api/session with any
   puzzle id — or any date — and replay the whole catalogue in one
   sitting. That is the reason the day key is decided on the server and
   never taken from the request body, a query param or a header. It
   still is.

   This module is the server's answer to "which puzzle is today's?" and
   "how long is this player's streak?". It lives in shared/ because the
   Vite dev mock and the Cloudflare Functions both need the identical
   answer, and because pure functions are the only part of this worth
   unit-testing.

   Which calendar decides the key has moved twice. It was UTC, and UTC
   rolls at 7 PM CDT: a player in US Central who sat down after dinner
   was handed TOMORROW's puzzle. It was then one fixed zone, America/
   Chicago, which fixed him and broke the owner on US Pacific — his
   daily rolled at 10 PM. No single zone is right for everybody, so the
   key is now the VISITOR'S OWN local date.

   The visitor's zone is not asked of the visitor. Cloudflare resolves
   it at the edge and puts it on `request.cf.timezone`; the Functions
   read it from there and pass it in (see functions/_shared/util.js
   visitorZone). `cf` is set by the edge and a client cannot forge it,
   which is what keeps the "server decides the day" property above
   intact: a client that could name its own zone could walk its day key
   forward one zone at a time and farm the catalogue, exactly the replay
   the server-side pick exists to prevent. Every function here takes the
   zone as an argument so none of them can reach for a request.

   FALLBACK_ZONE covers the cases where no zone is known — local dev,
   the Vite mock, a request with no `cf`, a zone string Intl rejects.
   resolveZone() validates before trusting, because a bad `timeZone`
   makes `Intl.DateTimeFormat` throw and a 500 is a worse answer than
   yesterday's puzzle.

   What this costs: "the same puzzle for everyone at the same instant"
   is gone, and it was never the promise players were given. The promise
   is that everyone playing the same CALENDAR DATE plays the same
   phrase, and that survives — the pick is a pure function of the day
   key, so two players on 2026-09-15 get the same puzzle whether that
   date arrives for them in Auckland or in Anchorage.

   Nothing stored changes shape. Day keys are still `YYYY-MM-DD` strings
   in the same columns. Rows written under the two older rules are
   re-filed by migrations/0007 for the window where the UTC rule
   mis-attributed them. */

/** The zone the daily rolls over in when the visitor's own is unknown:
 *  no `request.cf` (local dev, the Vite mock, a unit test) or a zone
 *  string Intl will not accept. NOT a default anybody is meant to be
 *  served in production — it is the answer of last resort. */
export const FALLBACK_ZONE = "America/Chicago";

/* `en-CA` formats a date as `YYYY-MM-DD`, which is the key shape
   exactly; the parts are still read out individually so the result is
   not at the mercy of an ICU locale tweak. Constructing an
   Intl.DateTimeFormat is the expensive part of Intl, so the pair for a
   zone is built once and cached. The cache cannot be grown without
   bound by a hostile request: only zones that pass resolveZone() are
   ever stored, and the only zones reaching it come from `cf` — a fixed
   few hundred IANA names. */
const formatterCache = new Map();

/* An IANA zone name: `Area/Location`, optionally `Area/Region/Location`,
   plus the bare aliases (`UTC`). Cheap shape check first so obvious junk
   never reaches Intl and never reaches the cache. */
const ZONE_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/;

/** @param {string} zone a zone already known to be valid */
function formattersFor(zone) {
  const hit = formatterCache.get(zone);
  if (hit) return hit;
  const built = {
    day: new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    }),
    wall: new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }),
  };
  formatterCache.set(zone, built);
  return built;
}

/**
 * The zone to actually use: `zone` if Intl accepts it, FALLBACK_ZONE
 * otherwise. Anything may be passed — undefined, "", a country code, a
 * zone this runtime's ICU has never heard of — and the answer is always
 * a zone that works, never a throw.
 *
 * @param {unknown} zone
 * @returns {string}
 */
export function resolveZone(zone) {
  if (typeof zone !== "string") return FALLBACK_ZONE;
  const z = zone.trim();
  if (!z || !ZONE_SHAPE.test(z)) return FALLBACK_ZONE;
  if (formatterCache.has(z)) return z;
  try {
    formattersFor(z);
    return z;
  } catch {
    return FALLBACK_ZONE;                 // Intl said no: RangeError, not a 500
  }
}

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

/** Day key, `YYYY-MM-DD`, in `zone` — the visitor's own zone, from
 *  `request.cf.timezone`, never from anything the client can set.
 *  DST-aware: Intl resolves the offset actually in force at that instant
 *  rather than assuming one. An unusable zone falls back to
 *  FALLBACK_ZONE rather than throwing.
 *  @param {Date} [date] @param {unknown} [zone] */
export function zonedDayKey(date = new Date(), zone) {
  const { year, month, day } = numericParts(formattersFor(resolveZone(zone)).day, date);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/**
 * Shift a `YYYY-MM-DD` key by whole days.
 *
 * Calendar arithmetic on the date PARTS, never `+ days * 86400000` on
 * an instant: a DST day is 23 or 25 hours long, so a fixed 24h step
 * across a transition repeats or skips a day. `Date.UTC` is used here
 * purely as a calendar (month lengths, leap years) and read straight
 * back out in UTC — no zone is involved, so no transition can reach it,
 * and that is why this one takes no zone argument.
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

/** `zone`'s offset from UTC at instant `ms`, in milliseconds.
 *  @param {number} ms @param {string} zone already resolved */
function zoneOffsetMs(ms, zone) {
  const p = numericParts(formattersFor(zone).wall, new Date(ms));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;   // the parts dropped sub-second precision
}

/**
 * The instant (ms since epoch) at which `dayKey` begins — midnight in
 * `zone`. This is the rollover: the moment this visitor's daily changes
 * over. Two visitors in different zones have different instants for the
 * same key, which is the point.
 *
 * Two passes, because the offset needed to place the instant is the
 * offset at the instant itself: guess with the offset in force at the
 * same wall clock read as UTC, then re-read the offset at the guess and
 * correct. One correction settles it — a transition moves the offset by
 * an hour or two, never far enough to land on a different day.
 *
 * @param {string} dayKey
 * @param {unknown} [zone]
 * @returns {number} NaN for a malformed key
 */
export function zoneMidnightMs(dayKey, zone) {
  const m = DAY_KEY.exec(String(dayKey));
  if (!m) return NaN;
  const z = resolveZone(zone);
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return wall - zoneOffsetMs(wall - zoneOffsetMs(wall, z), z);
}

/**
 * Milliseconds until this visitor's daily rolls over — the next
 * midnight in `zone`. Drives the "next puzzle in 6h" countdown, which
 * must use the same zone as the day key or it counts down to somebody
 * else's midnight.
 *
 * On the two DST days a year this is 23h or 25h rather than 24h,
 * because those days really are that long. Clamping it to 24h would
 * put the countdown an hour out of step with the rollover it counts
 * down to, which is the bug this whole change exists to fix.
 *
 * @param {Date} [now]
 * @param {unknown} [zone]
 */
export function msUntilNextRollover(now = new Date(), zone) {
  const z = resolveZone(zone);
  const next = zoneMidnightMs(shiftDay(zonedDayKey(now, z), 1), z);
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
 * catalogue ⇒ same answer on every machine, which is the whole point:
 * it is what still makes "everyone playing 2026-09-15 plays the same
 * phrase" true now that 2026-09-15 starts at a different instant for
 * each visitor. The key itself is opaque here, so every move of the
 * calendar that produces it (UTC → one fixed zone → the visitor's own)
 * left every day's pick untouched.
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
 * A streak counts consecutive days whose daily was SOLVED. Today is
 * allowed to be missing (the day isn't over — the streak survives until
 * tomorrow), but a *lost* daily today breaks it immediately.
 *
 * `todayKey` must come from zonedDayKey() in the SAME zone the rollover
 * uses, or a player's streak breaks at a foreign midnight: read in the
 * wrong zone, tonight's win reads as yesterday's and the run resets.
 * The recorded days were written from that key too, so the walk itself
 * is calendar arithmetic on keys (shiftDay) and never touches a clock
 * or a zone.
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
