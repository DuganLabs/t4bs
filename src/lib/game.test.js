/* Unit tests for src/lib/game.js — pure helpers used by the BaseNative
   views. Engine logic lives in shared/engine.js (covered separately by
   shared/engine.test.js). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  openSlots,
  fullCount,
  computeKeyStatus,
  knowledgeSummary,
  KEY_STATE_INFO,
  groupLobby,
  browseCategories,
  renderBrowseRounds,
  renderBrowseShelf,
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

/* The client-side daily pick (dailySeed / dailyPuzzle /
   dailyFromGroups / todayKey) is GONE — it was seeded off the
   browser's local date with nothing server-side agreeing with it, so
   two players in different time zones got different "dailies" and any
   client could replay the whole catalogue. Selection now lives in
   shared/daily.js and is resolved server-side; its coverage lives in
   shared/daily.test.js. */

describe("knowledgeSummary — the phrase-level read-out", () => {
  const base = {
    words: [5, 4, 3],
    locked: [{ 0: "H", 1: "E" }, {}, { 2: "T" }],
    wordSolved: [false, false, false],
    presentGlobal: ["H", "E", "T", "R"],
    lives: 3,
    tokens: 1,
  };

  it("counts solved words and locked letters across the whole phrase", () => {
    const k = knowledgeSummary(base);
    assert.equal(k.totalWords, 3);
    assert.equal(k.solvedWords, 0);
    assert.equal(k.totalLetters, 12);
    assert.equal(k.knownLetters, 3);
  });

  it("counts letters known to be in the phrase but not yet placed", () => {
    // H, E, T are locked somewhere; only R is still floating.
    assert.equal(knowledgeSummary(base).floating, 1);
  });

  it("names the unsolved word with the highest share of letters known", () => {
    const k = knowledgeSummary(base);
    // word 0: 2/5 = .4 · word 1: 0/4 = 0 · word 2: 1/3 = .33
    assert.equal(k.bestTarget.wi, 0);
    assert.equal(k.bestTarget.known, 2);
    assert.equal(k.bestTarget.len, 5);
  });

  it("never proposes a solved word as the next target", () => {
    const k = knowledgeSummary({
      ...base,
      locked: [{ 0: "H", 1: "E", 2: "L", 3: "L", 4: "O" }, {}, { 2: "T" }],
      wordSolved: [true, false, false],
    });
    assert.notEqual(k.bestTarget.wi, 0);
    assert.equal(k.bestTarget.wi, 2);
    assert.equal(k.solvedWords, 1);
  });

  it("passes lives and tokens through with the shared-pool allowance", () => {
    const k = knowledgeSummary(base);
    assert.equal(k.lives, 3);
    assert.equal(k.livesAllowed, 4);
    assert.equal(k.tokens, 1);
  });

  it("survives a session that hasn't loaded yet", () => {
    const k = knowledgeSummary({
      words: undefined, locked: [], wordSolved: [], presentGlobal: [], lives: 4, tokens: 0,
    });
    assert.equal(k.totalWords, 0);
    assert.equal(k.totalLetters, 0);
    assert.equal(k.bestTarget, null);
  });
});

/* ── FREE-PLAY BROWSE SHELF ──────────────────────────────────────────
   The lobby's free play used to collapse a category to one row and one
   playable round. These cover the replacement: every round listed, and
   the SAME markup reaching the SSR template and the hydrated client
   from the same input — which is the only thing keeping the two view
   trees honest here. */
describe("browseCategories", () => {
  const groups = [
    {
      category: "MOTIVATIONAL",
      puzzles: [
        { id: 1000, submittedBy: "admin" },
        { id: 8,    submittedBy: "house" },
      ],
    },
    { category: "FAIRY TALES", puzzles: [{ id: 3, submittedBy: "house" }] },
  ];

  it("numbers rounds by ascending puzzle id, not array order", () => {
    const [motivational] = browseCategories(groups);
    assert.deepEqual(
      motivational.rounds.map(r => [r.label, r.id]),
      [["Round 1", 8], ["Round 2", 1000]],
      "the server and the client must number the same puzzle the same way",
    );
  });

  it("says how many rounds are inside, singular and plural", () => {
    const [motivational, fairyTales] = browseCategories(groups);
    assert.equal(motivational.title, "MOTIVATIONAL · 2 rounds");
    assert.equal(fairyTales.title,   "FAIRY TALES · 1 round");
  });

  it("gives every round its own play target", () => {
    const [motivational] = browseCategories(groups);
    assert.deepEqual(
      motivational.rounds.map(r => r.playHref),
      ["/play?play=8", "/play?play=1000"],
      "a category no longer collapses to a single deterministic pick",
    );
  });

  it("credits the submitter per round, not per category", () => {
    const [motivational] = browseCategories(groups);
    assert.deepEqual(motivational.rounds.map(r => r.credit), ["by house", "by admin"]);
  });

  it("marks free play as not counting, in the accessible name", () => {
    const [, fairyTales] = browseCategories(groups);
    assert.match(fairyTales.rounds[0].ariaLabel, /does not count toward your streak/i);
  });

  it("survives a lobby that hasn't loaded", () => {
    assert.equal(browseCategories(null), null);
    assert.deepEqual(browseCategories([]), []);
  });
});

describe("renderBrowseRounds — the SSR/client tag split", () => {
  const cat = browseCategories([
    { category: "FAIRY TALES", puzzles: [{ id: 3, submittedBy: "house" }] },
  ])[0];

  /* issue #24: the lobby has to work with JavaScript disabled, so the
     SSR surface is anchors — and now one per puzzle rather than one per
     category, which is strictly more reachable than before. */
  it("emits a real href per round for the no-JS surface", () => {
    const html = renderBrowseRounds(cat, "a");
    assert.match(html, /<a href="\/play\?play=3"/);
    assert.doesNotMatch(html, /<button/);
  });

  /* The hydrated client uses buttons: a client-side navigation to
     /play?play=… never re-runs the boot resolver that reads the query
     string, so an anchor would route to an empty play view. */
  it("emits buttons for the hydrated client", () => {
    const html = renderBrowseRounds(cat, "button");
    assert.match(html, /<button type="button"/);
    assert.doesNotMatch(html, /href=/);
  });

  it("carries the puzzle id on every control, either way", () => {
    for (const tag of ["a", "button"]) {
      assert.match(renderBrowseRounds(cat, tag), /data-puzzle-id="3"/);
    }
  });

  it("escapes interpolated fields", () => {
    const evil = browseCategories([
      { category: 'X" onload="alert(1)', puzzles: [{ id: 1, submittedBy: "<img/onerror=1>" }] },
    ])[0];
    const html = renderBrowseRounds(evil, "a");
    assert.doesNotMatch(html, /onload="alert/);
    assert.doesNotMatch(html, /<img/);
  });
});

describe("renderBrowseShelf", () => {
  const groups = [
    { category: "FAIRY TALES",  puzzles: [{ id: 3, submittedBy: "house" }] },
    { category: "MOTIVATIONAL", puzzles: [{ id: 8, submittedBy: "house" }] },
  ];

  it("is @basenative/components' accordion, so the disclosure is native", () => {
    const html = renderBrowseShelf(groups, "a");
    assert.match(html, /<div data-bn="accordion"/);
    assert.match(html, /<details data-bn="accordion-item"/);
    assert.match(html, /<summary data-bn="accordion-header"/);
  });

  /* The id is pinned rather than left to the package's nextId()
     counter. If the server and the client picked different ids, the
     name= grouping that makes the sections mutually exclusive would
     desynchronise across hydration. */
  it("pins the same id on both sides of hydration", () => {
    const server = renderBrowseShelf(groups, "a");
    const client = renderBrowseShelf(groups, "button");
    assert.match(server, /id="lobby-browse"/);
    assert.match(client, /id="lobby-browse"/);
    assert.equal(
      (server.match(/name="lobby-browse"/g) || []).length,
      (client.match(/name="lobby-browse"/g) || []).length,
    );
  });

  /* The two trees must differ in exactly one way — the control tag. */
  it("differs between the trees only in the control element", () => {
    const server = renderBrowseShelf(groups, "a");
    const client = renderBrowseShelf(groups, "button");
    const normalise = (s) => s
      .replace(/<a href="[^"]*"/g, "<CTRL")
      .replace(/<button type="button"/g, "<CTRL")
      .replace(/<\/(a|button)>/g, "</CTRL>");
    assert.equal(normalise(server), normalise(client));
  });

  it("renders an empty shelf rather than throwing on no puzzles", () => {
    assert.match(renderBrowseShelf([], "a"), /data-bn="accordion"/);
    assert.match(renderBrowseShelf(null, "a"), /data-bn="accordion"/);
  });
});
