import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { catalogueRow, scheduleWindow, statsSummary } from "./admin-stats.js";

describe("catalogueRow", () => {
  const base = { id: 9, category: "FAIRY TALES", phrase: "HAPPILY EVER AFTER", anchors: [{ wi: 0, li: 0 }, { wi: 2, li: 0 }], par: null, status: "approved", submittedBy: "house" };

  it("derives par when the row has none, and says so", () => {
    const r = catalogueRow({ ...base, plays: 0, wins: 0, avgWinScore: null });
    // A clean solve: (16 letters − 2 anchors) × 5 + 3 words × 10.
    assert.equal(r.par, 100);
    assert.equal(r.parIsDerived, true);
    assert.equal(r.winRate, null);
    assert.equal(r.winRateLabel, "—");
  });

  it("uses a stored par and computes the win rate", () => {
    const r = catalogueRow({ ...base, par: 120, plays: 40, wins: 10, avgWinScore: 90.4 });
    assert.equal(r.par, 120);
    assert.equal(r.parIsDerived, false);
    assert.equal(r.winRate, 0.25);
    assert.equal(r.winRateLabel, "25%");
    assert.equal(r.avgWinScore, 90);
    assert.equal(r.suspicious, false);
  });

  it("flags a puzzle almost nobody solves — once there are enough plays to say so", () => {
    assert.equal(catalogueRow({ ...base, plays: 40, wins: 2, avgWinScore: 50 }).suspicious, true);
    assert.equal(catalogueRow({ ...base, plays: 5, wins: 0, avgWinScore: null }).suspicious, false);
  });

  it("flags a puzzle everybody beats par on by a mile", () => {
    assert.equal(catalogueRow({ ...base, par: 60, plays: 30, wins: 25, avgWinScore: 140 }).suspicious, true);
  });
});

describe("scheduleWindow", () => {
  const puzzlesById = new Map([[1097, { category: "BEATLES SONGS", phrase: "HEY JUDE" }]]);

  it("lists every day in the window, filled or not", () => {
    const w = scheduleWindow({
      fromDay: "2026-09-13", days: 3,
      rows: [{ day: "2026-09-14", puzzleId: 1097, pinned: 1 }],
      completions: [{ day: "2026-09-13", plays: 4, wins: 1, avgWinScore: 70 }],
      puzzlesById,
    });
    assert.deepEqual(w.map(d => d.day), ["2026-09-13", "2026-09-14", "2026-09-15"]);
    assert.equal(w[0].puzzleId, null);
    assert.equal(w[0].winRateLabel, "25%");
    assert.equal(w[1].pinned, true);
    assert.equal(w[1].category, "BEATLES SONGS");
    assert.equal(w[2].plays, 0);
    assert.equal(w[2].winRateLabel, "—");
  });

  it("does not throw on a scheduled puzzle that has since been removed", () => {
    const w = scheduleWindow({ fromDay: "2026-09-13", days: 1, rows: [{ day: "2026-09-13", puzzleId: 4, pinned: 0 }], completions: [], puzzlesById });
    assert.equal(w[0].puzzleId, 4);
    assert.equal(w[0].category, null);
  });
});

describe("statsSummary", () => {
  it("totals the last seven days and the daily win rate", () => {
    const s = statsSummary({
      totals: { rounds: 603, dailyResults: 4, dailyWins: 1, dailyPlayers: 3, shareCards: 14, puzzles: 432, pending: 0, users: 3 },
      roundsByDay: Array.from({ length: 10 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, rounds: 10, won: 3, lost: 7 })),
    });
    assert.equal(s.rounds, 603);
    assert.equal(s.roundsLast7, 70);
    assert.equal(s.dailyWinRateLabel, "25%");
    assert.equal(s.days.length, 10);
  });

  it("survives empty tables", () => {
    const s = statsSummary({ totals: null, roundsByDay: null });
    assert.equal(s.rounds, 0);
    assert.equal(s.dailyWinRateLabel, "—");
    assert.deepEqual(s.days, []);
  });
});
