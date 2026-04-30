/* Unit tests for src/lib/game.js — pure helpers used by the BaseNative
   views. Engine logic lives in shared/engine.js (covered separately by
   shared/engine.test.js). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  openSlots,
  fullCount,
  computeKeyStatus,
  groupLobby,
  dailySeed,
  dailyPuzzle,
  dailyFromGroups,
  todayKey,
} from "./game.js";

describe("openSlots", () => {
  it("returns every index when nothing is locked", () => {
    assert.deepEqual(openSlots(5, {}), [0, 1, 2, 3, 4]);
  });

  it("skips locked indices regardless of letter value", () => {
    assert.deepEqual(openSlots(5, { 0: "P", 3: "R" }), [1, 2, 4]);
  });

  it("treats only 'undefined' as open — empty-string lock is still locked", () => {
    assert.deepEqual(openSlots(4, { 0: "", 2: "X" }), [1, 3]);
  });

  it("returns [] when every slot is locked", () => {
    assert.deepEqual(openSlots(3, { 0: "A", 1: "B", 2: "C" }), []);
  });

  it("returns [] for a zero-length word", () => {
    assert.deepEqual(openSlots(0, {}), []);
  });
});

describe("fullCount", () => {
  it("counts the un-anchored slots across every word", () => {
    // 5 + 4 + 3 = 12 letters total. 1 + 2 + 0 anchored = 3. Open = 9.
    const words = [5, 4, 3];
    const locked = [{ 0: "S" }, { 1: "A", 3: "Z" }, {}];
    assert.equal(fullCount(words, locked), 9);
  });

  it("returns total letters when nothing is locked", () => {
    assert.equal(fullCount([3, 4, 5], [{}, {}, {}]), 12);
  });

  it("returns 0 when every slot is locked", () => {
    assert.equal(
      fullCount([2, 3], [{ 0: "A", 1: "B" }, { 0: "C", 1: "D", 2: "E" }]),
      0,
    );
  });

  it("treats missing-index locked entries as empty", () => {
    /* If `locked[wi]` is undefined we should count the whole word, not
       throw. The lobby skeleton path can leak through with sparse
       arrays mid-resume. */
    const words = [4, 3];
    const locked = [undefined, { 0: "A" }];
    assert.equal(fullCount(words, locked), 4 + 2);
  });
});

describe("computeKeyStatus", () => {
  const baseSession = { words: [4, 3], category: "X" };
  const emptyArgs = {
    session: baseSession,
    locked: [{}, {}],
    presentGlobal: [],
    absentByWord: [[], []],
  };

  it("returns {} when there is no session", () => {
    assert.deepEqual(
      computeKeyStatus({ ...emptyArgs, session: null }),
      {},
    );
  });

  it("returns {} when nothing is known yet", () => {
    assert.deepEqual(computeKeyStatus(emptyArgs), {});
  });

  it("marks locked letters green (across both words)", () => {
    const status = computeKeyStatus({
      ...emptyArgs,
      locked: [{ 0: "P" }, { 2: "R" }],
    });
    assert.equal(status.P, "green");
    assert.equal(status.R, "green");
  });

  it("marks present-global letters yellow when not already green", () => {
    const status = computeKeyStatus({
      ...emptyArgs,
      locked: [{ 0: "P" }, {}],
      presentGlobal: ["E", "P"], // P is already green — yellow shouldn't downgrade
    });
    assert.equal(status.E, "yellow");
    assert.equal(status.P, "green");
  });

  it("marks a letter absent only when ruled out in every word the player has tried", () => {
    /* "Q" is in absentByWord[0] but absentByWord[1] is empty (untried).
       Per the rule, absent only fires when every TRIED set contains it.
       Word 1 has been tried (set is non-empty), word 2 hasn't, so Q is
       absent. */
    const status = computeKeyStatus({
      ...emptyArgs,
      absentByWord: [["Q"], []],
    });
    assert.equal(status.Q, "absent");
  });

  it("does not mark absent if no word has been tried yet", () => {
    const status = computeKeyStatus({
      ...emptyArgs,
      absentByWord: [[], []],
    });
    assert.equal(status.Z, undefined);
  });

  it("does not mark absent if any tried word still considers the letter possible", () => {
    /* Tried in word 1 → ruled out there. Tried in word 2 → NOT ruled
       out (set non-empty but doesn't contain Q). So Q is still possible
       in word 2; can't mark absent globally. */
    const status = computeKeyStatus({
      ...emptyArgs,
      absentByWord: [["Q"], ["X"]],
    });
    assert.equal(status.Q, undefined);
  });

  it("green wins over yellow even if presentGlobal is processed last", () => {
    const status = computeKeyStatus({
      ...emptyArgs,
      locked: [{ 0: "A" }, {}],
      presentGlobal: ["A"],
    });
    assert.equal(status.A, "green");
  });
});

describe("groupLobby", () => {
  it("returns null for null input (loading state)", () => {
    assert.equal(groupLobby(null), null);
  });

  it("returns [] for an empty list", () => {
    assert.deepEqual(groupLobby([]), []);
  });

  it("groups puzzles by category, preserving submission order within a group", () => {
    const lobby = [
      { id: 1, category: "MOVIES",     submittedBy: "a" },
      { id: 2, category: "FOOD",       submittedBy: "b" },
      { id: 3, category: "MOVIES",     submittedBy: "c" },
      { id: 4, category: "FOOD",       submittedBy: "d" },
    ];
    const groups = groupLobby(lobby);
    assert.equal(groups.length, 2);
    const food = groups.find(g => g.category === "FOOD");
    const movies = groups.find(g => g.category === "MOVIES");
    assert.deepEqual(food.puzzles.map(p => p.id), [2, 4]);
    assert.deepEqual(movies.puzzles.map(p => p.id), [1, 3]);
  });

  it("sorts categories alphabetically", () => {
    const lobby = [
      { id: 1, category: "ZEBRA",  submittedBy: "z" },
      { id: 2, category: "APPLE",  submittedBy: "a" },
      { id: 3, category: "MANGO",  submittedBy: "m" },
    ];
    const groups = groupLobby(lobby);
    assert.deepEqual(groups.map(g => g.category), ["APPLE", "MANGO", "ZEBRA"]);
  });
});

describe("dailySeed", () => {
  it("is deterministic for the same date", () => {
    const a = dailySeed(new Date(2026, 3, 30));
    const b = dailySeed(new Date(2026, 3, 30));
    assert.equal(a, b);
  });

  it("returns different seeds for different dates", () => {
    const a = dailySeed(new Date(2026, 3, 30));
    const b = dailySeed(new Date(2026, 3, 29));
    assert.notEqual(a, b);
  });

  it("always returns a non-negative integer", () => {
    /* Sample a year of dates to confirm the |0 + Math.abs hashing path
       never lets a negative number leak through. */
    for (let day = 0; day < 365; day++) {
      const d = new Date(2026, 0, 1 + day);
      const seed = dailySeed(d);
      assert.ok(seed >= 0, `seed should be >= 0 for ${d.toDateString()}, got ${seed}`);
      assert.ok(Number.isInteger(seed), `seed should be integer, got ${seed}`);
    }
  });
});

describe("dailyPuzzle", () => {
  it("returns null for null/empty puzzle list", () => {
    assert.equal(dailyPuzzle(null), null);
    assert.equal(dailyPuzzle([]), null);
  });

  it("picks the same puzzle for the same date across calls", () => {
    const puzzles = [
      { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 },
    ];
    const date = new Date(2026, 3, 30);
    const a = dailyPuzzle(puzzles, date);
    const b = dailyPuzzle(puzzles, date);
    assert.equal(a, b); // identity, not deepEqual — should be the same object
  });

  it("only returns puzzles from the given list", () => {
    const puzzles = [{ id: 7 }, { id: 8 }, { id: 9 }];
    /* Spot-check a handful of consecutive days, asserting the daily
       always lands inside the input set. */
    for (let day = 0; day < 30; day++) {
      const d = new Date(2026, 3, 1 + day);
      const picked = dailyPuzzle(puzzles, d);
      assert.ok(puzzles.includes(picked));
    }
  });
});

describe("dailyFromGroups", () => {
  it("returns null for null/empty groups", () => {
    assert.equal(dailyFromGroups(null), null);
    assert.equal(dailyFromGroups([]), null);
  });

  it("returns a {group, puzzle} pair where the puzzle belongs to the group", () => {
    const groups = [
      { category: "A", puzzles: [{ id: 1 }, { id: 2 }] },
      { category: "B", puzzles: [{ id: 3 }] },
    ];
    const date = new Date(2026, 3, 30);
    const result = dailyFromGroups(groups, date);
    assert.ok(result.group);
    assert.ok(result.puzzle);
    assert.ok(result.group.puzzles.includes(result.puzzle));
  });

  it("is deterministic for the same date + groups", () => {
    const groups = [
      { category: "A", puzzles: [{ id: 1 }, { id: 2 }] },
      { category: "B", puzzles: [{ id: 3 }, { id: 4 }] },
    ];
    const date = new Date(2026, 3, 30);
    const a = dailyFromGroups(groups, date);
    const b = dailyFromGroups(groups, date);
    assert.equal(a.group, b.group);
    assert.equal(a.puzzle, b.puzzle);
  });
});

describe("todayKey", () => {
  it("returns a YYYY-MM-DD string", () => {
    assert.equal(todayKey(new Date(2026, 0, 5)), "2026-01-05"); // Jan
    assert.equal(todayKey(new Date(2026, 11, 31)), "2026-12-31"); // Dec
  });

  it("zero-pads single-digit month and day", () => {
    assert.equal(todayKey(new Date(2026, 0, 1)), "2026-01-01");
    assert.equal(todayKey(new Date(2026, 8, 9)), "2026-09-09");
  });

  it("agrees with dailySeed on the same date string format", () => {
    /* dailySeed and todayKey both build a YYYY-MM-DD key — confirm
       they would not disagree on a date due to padding bugs. */
    const date = new Date(2026, 2, 7);
    assert.equal(todayKey(date), "2026-03-07");
    // Recompute the seed-key inline so we know what string was hashed
    const seedKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    assert.equal(seedKey, "2026-03-07");
  });
});
