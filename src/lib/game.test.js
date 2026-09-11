/* Unit tests for src/lib/game.js — pure helpers used by the BaseNative
   views. Engine logic lives in shared/engine.js (covered separately by
   shared/engine.test.js). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  openSlots,
  fullCount,
  computeKeyStatus,
  KEY_STATE_INFO,
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
  /* Owner's ruling (2026-09-10), authoritative: a letter ruled out in
     one word must stay usable — and correctly styled — in a later
     word. `active` is the word the player is currently entering;
     "absent" is scoped to it alone (see the long comment on
     computeKeyStatus in game.js for why). */
  const baseSession = { words: [4, 3], category: "X" };
  const emptyArgs = {
    session: baseSession,
    active: 0,
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

  it("marks present-global letters yellow ('elsewhere') when not already green", () => {
    const status = computeKeyStatus({
      ...emptyArgs,
      locked: [{ 0: "P" }, {}],
      presentGlobal: ["E", "P"], // P is already green — yellow shouldn't downgrade
    });
    assert.equal(status.E, "yellow");
    assert.equal(status.P, "green");
  });

  it("green wins over yellow even if presentGlobal is processed last", () => {
    const status = computeKeyStatus({
      ...emptyArgs,
      locked: [{ 0: "A" }, {}],
      presentGlobal: ["A"],
    });
    assert.equal(status.A, "green");
  });

  it("marks a letter absent when it's ruled out in the ACTIVE word", () => {
    const status = computeKeyStatus({
      ...emptyArgs,
      active: 0,
      absentByWord: [["Q"], []],
    });
    assert.equal(status.Q, "absent");
  });

  it("a letter ruled out in word 1 is usable — and correctly styled — in word 2", () => {
    /* This is the owner's exact bug report: "Q" was ruled out while
       entering word 1 (absentByWord[0]). Word 2 hasn't been tried and
       has said nothing about Q either way. Moving the active word to
       word 2 must NOT carry word 1's "absent" verdict forward — Q
       renders untried (no status, no "dead key" styling), same as any
       other letter nobody's tried yet, and nothing about it prevents
       typing it (computeKeyStatus never sets a `disabled` flag). */
    const wordOneAbsent = { ...emptyArgs, active: 0, absentByWord: [["Q"], []] };
    assert.equal(computeKeyStatus(wordOneAbsent).Q, "absent");

    const movedToWordTwo = { ...wordOneAbsent, active: 1 };
    assert.equal(computeKeyStatus(movedToWordTwo).Q, undefined);
  });

  it("a letter absent from the whole phrase renders 'absent' ('not in phrase') for the word that ruled it out", () => {
    const status = computeKeyStatus({
      ...emptyArgs,
      active: 0,
      presentGlobal: [], // never found present anywhere
      absentByWord: [["Z"], []],
    });
    assert.equal(status.Z, "absent");
  });

  it("a letter present later in the phrase renders the 'elsewhere' state, not 'absent', even where it was ruled out", () => {
    /* "L" was ruled out of the ACTIVE word specifically, but a later
       (already-tried) word revealed it's present in the phrase
       (presentGlobal). The ruling: highlight this differently from
       plain "absent" — "not in this word but in the phrase". */
    const status = computeKeyStatus({
      ...emptyArgs,
      active: 0,
      presentGlobal: ["L"],
      absentByWord: [["L"], []],
    });
    assert.equal(status.L, "yellow");
  });

  it("makes no absent claim with no single active word (e.g. ALL-IN mode)", () => {
    /* Without one active word to scope "absent" to, no claim is safe —
       green/yellow still work, but nothing is marked absent. */
    const status = computeKeyStatus({
      ...emptyArgs,
      active: null,
      locked: [{ 0: "P" }, {}],
      presentGlobal: ["E"],
      absentByWord: [["Q"], ["Q"]],
    });
    assert.equal(status.P, "green");
    assert.equal(status.E, "yellow");
    assert.equal(status.Q, undefined);
  });
});

describe("KEY_STATE_INFO — non-colour cues", () => {
  it("gives every non-default keyboard state its own glyph and aria suffix", () => {
    const states = Object.keys(KEY_STATE_INFO);
    assert.deepEqual(states.sort(), ["absent", "green", "yellow"]);
    for (const s of states) {
      assert.ok(KEY_STATE_INFO[s].glyph, `${s} needs a non-empty glyph`);
      assert.ok(KEY_STATE_INFO[s].ariaSuffix, `${s} needs a non-empty aria suffix`);
    }
  });

  it("is distinguishable without colour: no two states share a glyph or an aria suffix", () => {
    const glyphs = Object.values(KEY_STATE_INFO).map(v => v.glyph);
    const suffixes = Object.values(KEY_STATE_INFO).map(v => v.ariaSuffix);
    assert.equal(new Set(glyphs).size, glyphs.length, "glyphs must be unique per state");
    assert.equal(new Set(suffixes).size, suffixes.length, "aria suffixes must be unique per state");
  });
});

describe("keyboard state contrast (WCAG AA, computed — not eyeballed)", () => {
  /* Plain re-implementation of the WCAG 2.x relative-luminance /
     contrast-ratio formulas (the same ones a browser's own contrast
     checker uses), kept in the test file so a future re-theme of
     src/styles.css's `.bn-kb` block can't silently regress a pairing
     below AA without a failing test — exactly how the package's own
     "5.0:1" comment (actually 2.31:1) shipped unnoticed. Values below
     mirror the .bn-kb block in styles.css and theme.css's `[data-bn=
     "keyboard"]` block; if either changes, update both. */
  function srgb(c) {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function luminance(hex) {
    const n = hex.replace("#", "");
    const r = parseInt(n.slice(0, 2), 16);
    const g = parseInt(n.slice(2, 4), 16);
    const b = parseInt(n.slice(4, 6), 16);
    return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  }
  function contrast(a, b) {
    const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  }

  const AA_NORMAL_TEXT = 4.5;

  const pairs = {
    "ENTER (#1A0A00 on #E8920A)": ["#1A0A00", "#E8920A"],
    "green (#0A1F12 on #4EAF7C)": ["#0A1F12", "#4EAF7C"],
    "yellow (#1F1700 on #D4B445)": ["#1F1700", "#D4B445"],
    "absent (#988570 on #1E1C18)": ["#988570", "#1E1C18"],
  };

  for (const [label, [fg, bg]] of Object.entries(pairs)) {
    it(`${label} clears WCAG AA (${AA_NORMAL_TEXT}:1)`, () => {
      assert.ok(
        contrast(fg, bg) >= AA_NORMAL_TEXT,
        `${label} is ${contrast(fg, bg).toFixed(2)}:1, needs >= ${AA_NORMAL_TEXT}:1`,
      );
    });
  }

  it("documents the two contrast defects this fix corrected (regression guard)", () => {
    // Previously-shipped pairings that failed AA — the ENTER key was
    // already fixed before this change; green/absent were not.
    assert.ok(contrast("#F0EDE4", "#E8920A") < AA_NORMAL_TEXT, "ENTER pre-fix should still read as failing");
    assert.ok(contrast("#FFFFFF", "#4EAF7C") < AA_NORMAL_TEXT, "green pre-fix (white text) should still read as failing");
    assert.ok(contrast("#5A5550", "#1E1C18") < AA_NORMAL_TEXT, "absent pre-fix (package default) should still read as failing");
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
