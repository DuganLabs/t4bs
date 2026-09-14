/* Unit tests for src/lib/game.js — pure helpers used by the BaseNative
   views. Engine logic lives in shared/engine.js (covered separately by
   shared/engine.test.js). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  keyStateFor, KEY_STATE_INFO, groupLobby, browseCategories,
  renderBrowseRounds, renderBrowseShelf,
} from "./game.js";




describe("KEY_STATE_INFO — non-colour cues", () => {
  it("gives every non-default keyboard state its own glyph and aria suffix", () => {
    const states = Object.keys(KEY_STATE_INFO);
    assert.deepEqual(states.sort(), ["absent", "green"]);
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

describe("keyStateFor — the keyboard from the server's view", () => {
  it("returns {} with no round", () => {
    assert.deepEqual(keyStateFor(null), {});
  });
  it("marks revealed letters green and missed letters absent, nothing else", () => {
    assert.deepEqual(
      keyStateFor({ revealed: ["A", "E"], missed: ["Z"] }),
      { A: "green", E: "green", Z: "absent" },
    );
  });
  it("has no third state — a letter is in the phrase or it is not", () => {
    assert.deepEqual(Object.keys(KEY_STATE_INFO).sort(), ["absent", "green"]);
  });
});
