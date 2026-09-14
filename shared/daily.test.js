/* shared/daily.js — the server's daily selection + streak maths.

   These cover the three properties the feature actually rests on:
   the pick is the same for everyone on a UTC day, the streak survives
   a day that isn't over yet, and it breaks the moment a daily is lost. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  utcDayKey, shiftDay, msUntilNextUtcDay, pickDailyPuzzleId, computeStreak,
 nextDailyPuzzleId } from "./daily.js";

describe("utcDayKey", () => {
  it("is UTC, not local — that's the whole point", () => {
    // 23:30 UTC on the 11th is still the 11th, wherever the runner is.
    assert.equal(utcDayKey(new Date("2026-09-11T23:30:00Z")), "2026-09-11");
    assert.equal(utcDayKey(new Date("2026-09-12T00:00:00Z")), "2026-09-12");
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
});

describe("msUntilNextUtcDay", () => {
  it("counts down to the next UTC midnight", () => {
    assert.equal(msUntilNextUtcDay(new Date("2026-09-11T23:00:00Z")), 3600_000);
    assert.equal(msUntilNextUtcDay(new Date("2026-09-11T00:00:00Z")), 86_400_000);
  });
});

describe("pickDailyPuzzleId", () => {
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("returns null when there is nothing to pick", () => {
    assert.equal(pickDailyPuzzleId([], "2026-09-11"), null);
    assert.equal(pickDailyPuzzleId(null, "2026-09-11"), null);
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
