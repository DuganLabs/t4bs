/* shared/daily.js — the server's daily selection + streak maths.

   These cover the properties the feature actually rests on: the pick is
   the same for everyone on a day, the day is the same day for everyone
   at the same instant, the streak survives a day that isn't over yet,
   and it breaks the moment a daily is lost.

   The reported bug these were rewritten for: the day key was UTC, which
   rolls at 7 PM CDT / 6 PM CST, so a player in US Central who opened the
   game after dinner got TOMORROW's puzzle and a countdown that was wrong
   by the same amount. The rollover is now midnight in DAILY_ZONE. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DAILY_ZONE, DAILY_ZONE_LABEL, zonedDayKey, shiftDay, zoneMidnightMs,
  msUntilNextRollover, pickDailyPuzzleId, computeStreak, nextDailyPuzzleId,
} from "./daily.js";

const HOUR = 3_600_000;

describe("DAILY_ZONE", () => {
  it("is one fixed zone, and the label matches it", () => {
    assert.equal(DAILY_ZONE, "America/Chicago");
    assert.equal(DAILY_ZONE_LABEL, "Central Time");
  });
});

describe("zonedDayKey", () => {
  it("does NOT roll at UTC midnight — the bug a US Central player hit", () => {
    /* 23:00Z is 6 PM CDT: still today's puzzle, not tomorrow's. Under the
       old UTC key this instant answered "2026-09-15". */
    assert.equal(zonedDayKey(new Date("2026-09-14T23:00:00Z")), "2026-09-14");
    assert.equal(zonedDayKey(new Date("2026-09-15T00:00:00Z")), "2026-09-14");
    assert.equal(zonedDayKey(new Date("2026-09-15T04:59:59Z")), "2026-09-14");
  });

  it("rolls at midnight in DAILY_ZONE, not before or after", () => {
    // 05:00Z is 00:00 CDT — the new day starts exactly there.
    assert.equal(zonedDayKey(new Date("2026-09-15T05:00:00Z")), "2026-09-15");
    // 05:30Z is 12:30 AM CDT, which is already the 15th.
    assert.equal(zonedDayKey(new Date("2026-09-15T05:30:00Z")), "2026-09-15");
  });

  it("follows DST: the rollover is 05:00Z in summer and 06:00Z in winter", () => {
    assert.equal(zonedDayKey(new Date("2026-12-15T05:59:59Z")), "2026-12-14");
    assert.equal(zonedDayKey(new Date("2026-12-15T06:00:00Z")), "2026-12-15");
  });

  it("ignores the machine's own zone — the server is authoritative", () => {
    /* If this ever starts reading a local date, the whole catalogue is
       replayable by a client that lies about its clock (see the module
       header). Kiritimati is UTC+14: local date and DAILY_ZONE date
       disagree by a day at this instant. */
    const at = new Date("2026-09-14T23:00:00Z");
    const previous = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Kiritimati";
      assert.equal(at.getDate(), 15, "sanity: the runner's local date really did move");
      assert.equal(zonedDayKey(at), "2026-09-14");
      process.env.TZ = "UTC";
      assert.equal(zonedDayKey(at), "2026-09-14");
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});

describe("shiftDay", () => {
  it("walks days, crossing month and year boundaries", () => {
    assert.equal(shiftDay("2026-09-11", -1), "2026-09-10");
    assert.equal(shiftDay("2026-03-01", -1), "2026-02-28");
    assert.equal(shiftDay("2026-01-01", -1), "2025-12-31");
    assert.equal(shiftDay("2026-12-31", 1), "2027-01-01");
  });

  it("handles a leap day", () => {
    assert.equal(shiftDay("2028-03-01", -1), "2028-02-29");
  });

  it("returns a malformed key untouched rather than NaN-ing", () => {
    assert.equal(shiftDay("nonsense", 1), "nonsense");
    assert.equal(shiftDay("", -1), "");
  });

  it("crosses the spring-forward day (2027-03-14) without skipping one", () => {
    // That day is 23 hours long; a "+86400000 ms" shift would skip it.
    assert.equal(shiftDay("2027-03-13", 1), "2027-03-14");
    assert.equal(shiftDay("2027-03-14", 1), "2027-03-15");
    assert.equal(shiftDay("2027-03-15", -1), "2027-03-14");
    assert.equal(shiftDay("2027-03-14", -1), "2027-03-13");
  });

  it("crosses the fall-back day (2026-11-01) without repeating one", () => {
    // That day is 25 hours long; a "+86400000 ms" shift would repeat it.
    assert.equal(shiftDay("2026-10-31", 1), "2026-11-01");
    assert.equal(shiftDay("2026-11-01", 1), "2026-11-02");
    assert.equal(shiftDay("2026-11-02", -1), "2026-11-01");
    assert.equal(shiftDay("2026-11-01", -1), "2026-10-31");
  });

  it("agrees with the clock: walking real rollovers matches walking keys", () => {
    /* Sample every rollover for three years (both DST transitions twice
       over) and check the key one second into the day is the key
       shiftDay predicts. */
    let key = "2026-01-01";
    for (let i = 0; i < 365 * 3; i++) {
      const start = zoneMidnightMs(key);
      assert.equal(zonedDayKey(new Date(start)), key, `midnight of ${key}`);
      assert.equal(zonedDayKey(new Date(start - 1)), shiftDay(key, -1), `one ms before ${key}`);
      key = shiftDay(key, 1);
    }
  });
});

describe("zoneMidnightMs — the rollover instant", () => {
  it("is midnight in DAILY_ZONE, in both halves of the year", () => {
    assert.equal(zoneMidnightMs("2026-09-15"), Date.parse("2026-09-15T05:00:00Z"), "CDT: UTC-5");
    assert.equal(zoneMidnightMs("2026-12-15"), Date.parse("2026-12-15T06:00:00Z"), "CST: UTC-6");
  });

  it("is midnight on the DST days too", () => {
    // Both transitions happen at 2 AM local, so local midnight is ordinary.
    assert.equal(zoneMidnightMs("2026-11-01"), Date.parse("2026-11-01T05:00:00Z"), "still CDT at midnight");
    assert.equal(zoneMidnightMs("2026-11-02"), Date.parse("2026-11-02T06:00:00Z"), "CST by the next midnight");
    assert.equal(zoneMidnightMs("2027-03-14"), Date.parse("2027-03-14T06:00:00Z"), "still CST at midnight");
    assert.equal(zoneMidnightMs("2027-03-15"), Date.parse("2027-03-15T05:00:00Z"), "CDT by the next midnight");
  });

  it("makes the DST days 23 and 25 hours long, as they really are", () => {
    assert.equal((zoneMidnightMs("2027-03-15") - zoneMidnightMs("2027-03-14")) / HOUR, 23);
    assert.equal((zoneMidnightMs("2026-11-02") - zoneMidnightMs("2026-11-01")) / HOUR, 25);
  });

  it("is NaN for a malformed key rather than a silent wrong instant", () => {
    assert.ok(Number.isNaN(zoneMidnightMs("2026-9-1")));
  });
});

describe("msUntilNextRollover", () => {
  it("tells the evening Central player the truth", () => {
    // 6 PM CDT → six hours to the next puzzle. The UTC version said "0h".
    assert.equal(msUntilNextRollover(new Date("2026-09-14T23:00:00Z")), 6 * HOUR);
    assert.equal(msUntilNextRollover(new Date("2026-09-15T04:00:00Z")), 1 * HOUR);
  });

  it("is a whole day at the rollover itself, not zero", () => {
    assert.equal(msUntilNextRollover(new Date("2026-09-15T05:00:00Z")), 24 * HOUR);
  });

  it("is never negative, and never longer than the day it is counting", () => {
    /* A DST day really is 23 or 25 hours, so the bound is 25h, not 24h —
       clamping to 24h would put the countdown an hour out of step with
       the rollover it counts down to. */
    let seen24 = false, seen25 = false, seen23 = false;
    for (let t = Date.parse("2026-01-01T00:00:00Z"); t < Date.parse("2028-01-01T00:00:00Z"); t += 37 * 60_000) {
      const now = new Date(t);
      const ms = msUntilNextRollover(now);
      assert.ok(ms >= 0, `negative countdown at ${now.toISOString()}`);
      assert.ok(ms <= 25 * HOUR, `countdown over 25h at ${now.toISOString()}`);
      const dayLength = zoneMidnightMs(shiftDay(zonedDayKey(now), 1)) - zoneMidnightMs(zonedDayKey(now));
      assert.ok(ms <= dayLength, `countdown longer than its own day at ${now.toISOString()}`);
      if (dayLength === 24 * HOUR) seen24 = true;
      if (dayLength === 25 * HOUR) seen25 = true;
      if (dayLength === 23 * HOUR) seen23 = true;
    }
    assert.ok(seen23 && seen24 && seen25, "the sweep should have covered both DST days");
  });

  it("lands exactly on the rollover: now + countdown is the next midnight", () => {
    for (const iso of [
      "2026-09-14T23:00:00Z", "2026-11-01T04:00:00Z", "2026-11-01T06:30:00Z",
      "2027-03-14T05:30:00Z", "2027-03-14T12:00:00Z", "2026-12-31T23:59:00Z",
    ]) {
      const now = new Date(iso);
      const landing = now.getTime() + msUntilNextRollover(now);
      assert.equal(zonedDayKey(new Date(landing)), shiftDay(zonedDayKey(now), 1), iso);
      assert.equal(landing, zoneMidnightMs(shiftDay(zonedDayKey(now), 1)), iso);
    }
  });
});

describe("pickDailyPuzzleId", () => {
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("returns null when there is nothing to pick", () => {
    assert.equal(pickDailyPuzzleId([], "2026-09-11"), null);
    assert.equal(pickDailyPuzzleId(null, "2026-09-11"), null);
  });

  it("is unchanged by the move off UTC — the key is opaque to the hash", () => {
    /* Pinned so a future "tidy-up" of fnv1a cannot silently reshuffle
       every player's day. These are the values the UTC-keyed version
       produced for the same strings. */
    assert.equal(pickDailyPuzzleId(ids, "2026-09-11"), 9);
    assert.equal(pickDailyPuzzleId(ids, "2026-09-14"), 4);
    assert.equal(pickDailyPuzzleId(ids, "2026-09-15"), 5);
    assert.equal(pickDailyPuzzleId(ids, "2026-11-01"), 1);
    assert.equal(pickDailyPuzzleId(ids, "2027-03-14"), 7);
  });

  it("is deterministic — same day, same catalogue, same puzzle", () => {
    assert.equal(
      pickDailyPuzzleId(ids, "2026-09-11"),
      pickDailyPuzzleId(ids, "2026-09-11"),
    );
  });

  it("does not depend on the order the catalogue arrives in", () => {
    const shuffled = [7, 2, 10, 1, 5, 9, 3, 8, 4, 6];
    assert.equal(
      pickDailyPuzzleId(shuffled, "2026-09-11"),
      pickDailyPuzzleId(ids, "2026-09-11"),
    );
  });

  it("only ever picks from the catalogue", () => {
    for (let i = 0; i < 400; i++) {
      const day = shiftDay("2026-01-01", i);
      assert.ok(ids.includes(pickDailyPuzzleId(ids, day)), `off-catalogue pick on ${day}`);
    }
  });

  it("spreads across the catalogue instead of walking it in order", () => {
    /* The old `(h << 5) - h` seed produced near-consecutive indices on
       consecutive days, which with ten puzzles is a visible pattern.
       Over a year every puzzle should come up, and no single one should
       dominate. */
    const counts = new Map(ids.map(id => [id, 0]));
    for (let i = 0; i < 365; i++) {
      const id = pickDailyPuzzleId(ids, shiftDay("2026-01-01", i));
      counts.set(id, counts.get(id) + 1);
    }
    for (const [id, n] of counts) {
      assert.ok(n > 0, `puzzle ${id} never came up in a year`);
      assert.ok(n < 365 * 0.25, `puzzle ${id} dominated the year (${n}/365)`);
    }
  });
});

describe("computeStreak", () => {
  const won = day => ({ day, outcome: "won" });
  const lost = day => ({ day, outcome: "lost" });

  it("is zero with no history", () => {
    assert.deepEqual(computeStreak([], "2026-09-11"), { current: 0, best: 0, playedToday: false });
  });

  it("counts consecutive solved days ending today", () => {
    const r = computeStreak(
      [won("2026-09-11"), won("2026-09-10"), won("2026-09-09")],
      "2026-09-11",
    );
    assert.equal(r.current, 3);
    assert.equal(r.playedToday, true);
  });

  it("survives today being unplayed — the day isn't over", () => {
    const r = computeStreak([won("2026-09-10"), won("2026-09-09")], "2026-09-11");
    assert.equal(r.current, 2);
    assert.equal(r.playedToday, false);
  });

  it("does not break at 7 PM Central — the streak walks the same zone", () => {
    /* The evening of 09-14 Central, before and after old UTC midnight.
       With a UTC key the 23:00Z reading became "2026-09-15", today's win
       moved to "yesterday", and the player's streak silently reset. */
    const history = [won("2026-09-14"), won("2026-09-13"), won("2026-09-12")];
    for (const iso of ["2026-09-14T22:59:00Z", "2026-09-15T00:30:00Z", "2026-09-15T04:59:00Z"]) {
      const r = computeStreak(history, zonedDayKey(new Date(iso)));
      assert.equal(r.current, 3, iso);
      assert.equal(r.playedToday, true, iso);
    }
    // After the real rollover, today is unplayed and the run still stands.
    const after = computeStreak(history, zonedDayKey(new Date("2026-09-15T05:00:00Z")));
    assert.equal(after.current, 3);
    assert.equal(after.playedToday, false);
  });

  it("walks back across a DST boundary without dropping a day", () => {
    const history = [
      won("2026-11-03"), won("2026-11-02"), won("2026-11-01"), won("2026-10-31"),
    ];
    assert.equal(computeStreak(history, "2026-11-03").current, 4);
  });

  it("breaks immediately when today's daily is lost", () => {
    const r = computeStreak(
      [lost("2026-09-11"), won("2026-09-10"), won("2026-09-09")],
      "2026-09-11",
    );
    assert.equal(r.current, 0);
    assert.equal(r.best, 2, "the broken run still counts toward the best");
    assert.equal(r.playedToday, true);
  });

  it("breaks on a missed day, not just a lost one", () => {
    // 09-10 is absent entirely.
    const r = computeStreak([won("2026-09-11"), won("2026-09-09")], "2026-09-11");
    assert.equal(r.current, 1);
  });

  it("reports the longest historical run as best", () => {
    const r = computeStreak([
      won("2026-09-01"), won("2026-09-02"), won("2026-09-03"), won("2026-09-04"),
      lost("2026-09-05"),
      won("2026-09-10"), won("2026-09-11"),
    ], "2026-09-11");
    assert.equal(r.current, 2);
    assert.equal(r.best, 4);
  });

  it("ignores malformed rows rather than throwing", () => {
    const r = computeStreak([null, undefined, { outcome: "won" }, won("2026-09-11")], "2026-09-11");
    assert.equal(r.current, 1);
  });
});

describe("nextDailyPuzzleId — the no-repeat cycle", () => {
  const ids = [3, 1, 2, 5, 4];

  it("returns null with nothing to pick", () => {
    assert.equal(nextDailyPuzzleId([], [], "2026-09-13"), null);
  });

  it("never picks a puzzle already used this cycle", () => {
    const used = new Set();
    for (let d = 0; d < ids.length; d++) {
      const pick = nextDailyPuzzleId(ids, used, shiftDay("2026-09-13", d));
      assert.ok(!used.has(pick), `day ${d} repeated ${pick}`);
      used.add(pick);
    }
    assert.equal(used.size, ids.length, "every puzzle was today's exactly once");
  });

  it("starts a new cycle once every puzzle has been used", () => {
    const pick = nextDailyPuzzleId(ids, ids, "2026-09-20");
    assert.ok(ids.includes(pick));
  });

  it("is deterministic for a given day and used set", () => {
    assert.equal(nextDailyPuzzleId(ids, [1, 2], "2026-09-13"), nextDailyPuzzleId(ids, [2, 1], "2026-09-13"));
  });

  it("does not depend on catalogue order", () => {
    assert.equal(nextDailyPuzzleId([5, 4, 3, 2, 1], [], "2026-09-13"), nextDailyPuzzleId([1, 2, 3, 4, 5], [], "2026-09-13"));
  });
});
