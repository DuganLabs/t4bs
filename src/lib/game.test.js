/* Unit tests for src/lib/game.js — pure helpers used by the BaseNative
   views. Engine logic lives in shared/engine.js (covered separately by
   shared/engine.test.js). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  KEY_STATE_INFO, groupCatalogue,
  renderCataloguePhrases, renderCatalogueShelf,
} from "./game.js";




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

/* ── THE CATALOGUE — a moderator's list of phrases by category ─────
   The home page used to carry this as "categories" of numbered
   "rounds". Categories have phrases, not rounds; the list shows the
   phrase, and it renders the SAME markup for the SSR template and the
   hydrated client from the same input. */
describe("groupCatalogue", () => {
  it("returns null for null input (loading state) and [] for empty", () => {
    assert.equal(groupCatalogue(null), null);
    assert.deepEqual(groupCatalogue([]), []);
  });

  it("groups by category, alphabetical, ids ascending inside a group", () => {
    const rows = [
      { id: 1000, category: "MOVIES", phrase: "THE EMPIRE STRIKES BACK", submittedBy: "admin" },
      { id: 2,    category: "FOOD",   phrase: "FISH AND CHIPS",          submittedBy: "b" },
      { id: 3,    category: "MOVIES", phrase: "JAWS",                    submittedBy: "house" },
    ];
    const groups = groupCatalogue(rows);
    assert.deepEqual(groups.map(g => g.category), ["FOOD", "MOVIES"]);
    assert.deepEqual(groups[1].puzzles.map(p => p.id), [3, 1000]);
  });
});

describe("renderCataloguePhrases", () => {
  const group = groupCatalogue([
    { id: 3, category: "FAIRY TALES", phrase: "LITTLE RED RIDING HOOD", submittedBy: "house" },
  ])[0];

  it("shows the phrase itself, not a round number", () => {
    const html = renderCataloguePhrases(group);
    assert.match(html, /LITTLE RED RIDING HOOD/);
    assert.doesNotMatch(html, /Round \d/);
  });

  it("gives every phrase a preview link that works without JavaScript", () => {
    const html = renderCataloguePhrases(group);
    assert.match(html, /<a href="\/play\?play=3"[^>]*data-bn-action="preview"[^>]*data-puzzle-id="3"/);
    assert.match(html, /Does not count toward a streak/);
  });

  it("escapes interpolated fields", () => {
    const evil = groupCatalogue([
      { id: 1, category: 'X" onload="alert(1)', phrase: "<img/onerror=1>", submittedBy: "<b>" },
    ])[0];
    const html = renderCataloguePhrases(evil);
    assert.doesNotMatch(html, /<img\/onerror=1>/);
    assert.match(html, /&lt;img\/onerror=1&gt;/);
    assert.doesNotMatch(html, /onload="alert/);
  });
});

describe("renderCatalogueShelf", () => {
  it("is one native <details> per category, titled with the phrase count", () => {
    const html = renderCatalogueShelf(groupCatalogue([
      { id: 1, category: "ANIMALS", phrase: "A", submittedBy: "x" },
      { id: 2, category: "ANIMALS", phrase: "B", submittedBy: "x" },
      { id: 3, category: "FOODS",   phrase: "C", submittedBy: "x" },
    ]));
    assert.match(html, /<details[^>]*data-bn="accordion-item"/);
    assert.match(html, /ANIMALS · 2 phrases/);
    assert.match(html, /FOODS · 1 phrase/);
  });

  it("survives a catalogue that hasn't loaded", () => {
    assert.doesNotThrow(() => renderCatalogueShelf(null));
  });
});
/* ── THE WORD BOARD — client helpers ───────────────────────────────── */
import { openSlots, fullCount, computeKeyStatus, knowledgeSummary, historyFor } from "./game.js";

describe("openSlots / fullCount", () => {
  it("lists the tiles a word still has open, and counts hidden tiles across the phrase", () => {
    assert.deepEqual(openSlots(5, { 0: "H", 2: "L" }), [1, 3, 4]);
    assert.equal(fullCount([5, 5], [{ 0: "H" }, { 0: "W", 1: "O" }]), 7);
  });
});

describe("computeKeyStatus", () => {
  it("green anywhere locked, yellow when known in the phrase, absent only for the active word", () => {
    const st = computeKeyStatus({
      session: { words: [5, 5] }, active: 1,
      locked: [{ 0: "H" }, { 0: "W" }],
      presentGlobal: ["H", "E", "W"],
      absentByWord: [["X"], ["Z"]],
    });
    assert.equal(st.H, "green");
    assert.equal(st.E, "yellow");
    assert.equal(st.Z, "absent");
    assert.equal(st.X, undefined, "ruled out in another word says nothing about this one");
  });
  it("is empty with no session", () => {
    assert.deepEqual(computeKeyStatus({ session: null }), {});
  });
});

describe("knowledgeSummary", () => {
  it("counts words, letters, attempts left and busts, and picks the most-known open word", () => {
    const k = knowledgeSummary({
      words: [5, 3, 4], locked: [{ 0: "H", 1: "E" }, { 0: "A", 1: "N", 2: "D" }, { 0: "W" }],
      wordSolved: [false, true, false], busted: [false, false, false],
      presentGlobal: ["H", "E", "A", "N", "D", "R"], attempts: [3, 3, 4], attemptsMax: [4, 3, 4], tokens: 1,
    });
    assert.equal(k.solvedWords, 1);
    assert.equal(k.knownLetters, 6);
    assert.equal(k.totalLetters, 12);
    assert.equal(k.floating, 1);            // R
    assert.equal(k.attemptsLeft, 10);
    assert.equal(k.attemptsTotal, 11);
    assert.deepEqual(k.bestTarget, { wi: 0, known: 2, len: 5 });
  });
});

describe("historyFor", () => {
  it("returns one word's attempts in order and ignores ALL IN entries", () => {
    const log = [
      { wi: 0, letters: ["A"], feedback: ["absent"], allGreen: false },
      { wi: 1, letters: ["B"], feedback: ["green"], allGreen: true },
      { wi: -1, allIn: true, letters: ["A", "B"], correct: false },
      { wi: 0, letters: ["C"], feedback: ["green"], allGreen: true },
    ];
    assert.deepEqual(historyFor(log, 0).map(g => g.letters[0]), ["A", "C"]);
    assert.deepEqual(historyFor(null, 0), []);
  });
});
