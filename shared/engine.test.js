import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "./engine.js";
import { parFor, scoreFor, normalizePhrase, LIVES } from "./pure.js";

/* In-memory stores with the exact interface functions/_shared/d1.js
   implements. State is copied on the way in and out, as D1 JSON would be. */
const createMockStores = () => {
  const puzzles = new Map();
  const sessions = new Map();
  return {
    puzzles: {
      async listApproved() { return [...puzzles.values()].filter(p => p.approved); },
      async getApproved(id) { const p = puzzles.get(id); return p && p.approved ? p : null; },
      add(id, puzzle) { puzzles.set(id, puzzle); },
    },
    sessions: {
      async create(id, state) { sessions.set(id, JSON.parse(JSON.stringify(state))); },
      async get(id) { const s = sessions.get(id); return s ? JSON.parse(JSON.stringify(s)) : null; },
      async save(id, state) { sessions.set(id, JSON.parse(JSON.stringify(state))); },
      raw(id) { return sessions.get(id); },
    },
  };
};

/* HAPPILY EVER AFTER — 16 letters. Anchors H (0:0) and A (2:0); A appears
   twice, so the anchors reveal 3 tiles and leave 13 hidden. */
function puzzle(overrides = {}) {
  return {
    id: 9,
    category: "FAIRY TALES",
    phrase: "HAPPILY EVER AFTER",
    submittedBy: "house",
    approved: true,
    anchors: [{ wi: 0, li: 0 }, { wi: 2, li: 0 }],   // H, A
    ...overrides,
  };
}

async function fresh(overrides) {
  const stores = createMockStores();
  const finishes = [];
  stores.puzzles.add(9, puzzle(overrides));
  const engine = createEngine({ ...stores, onFinish: info => { finishes.push(info); } });
  const start = await engine.startSession(9, { mode: "free" });
  return { stores, engine, start, finishes, id: start.sessionId };
}

describe("pure", () => {
  it("normalises a solve attempt the way a phone types it", () => {
    assert.equal(normalizePhrase("  happily,  ever-after! "), "HAPPILY EVER AFTER");
  });
  it("scores hidden tiles and kept lives", () => {
    assert.equal(scoreFor(8, 3), 8 * 10 + 3 * 5);
    assert.equal(scoreFor(0, 5), 25);
    assert.equal(scoreFor(-1, -1), 0);
  });
  it("derives par from the non-anchor tiles when a puzzle carries none", () => {
    // Anchors H and A reveal 3 of 16 tiles → 13 hidden → round(6.5)=7 → 70 + 15.
    assert.equal(parFor(puzzle()), 85);
  });
  it("prefers a puzzle's own par", () => {
    assert.equal(parFor(puzzle({ par: 120 })), 120);
  });
});

describe("startSession", () => {
  it("never sends the phrase, and describes the board by shape", async () => {
    const { start } = await fresh();
    assert.equal(start.error, undefined);
    assert.equal(JSON.stringify(start).includes("HAPPILY"), false);
    assert.deepEqual(start.words, [7, 4, 5]);
    assert.equal(start.totalLetters, 16);
    assert.equal(start.lives, LIVES);
    assert.equal(start.finished, null);
    assert.equal(start.reveal, null);
    assert.equal(start.par, parFor(puzzle()));
  });

  it("reveals an anchor's letter in every tile it occurs, not just the anchored one", async () => {
    const { start } = await fresh();
    assert.deepEqual(start.revealed, ["A", "H"]);
    // HAPPILY: H A _ _ _ _ _ ; EVER: _ _ _ _ ; AFTER: A _ _ _ _
    assert.deepEqual(start.board[0], ["H", "A", null, null, null, null, null]);
    assert.deepEqual(start.board[1], [null, null, null, null]);
    assert.deepEqual(start.board[2], ["A", null, null, null, null]);
    assert.equal(start.hiddenCount, 13);
    assert.equal(start.scoreIfSolved, scoreFor(13, LIVES));
  });

  it("errors on an unknown puzzle", async () => {
    const stores = createMockStores();
    const engine = createEngine(stores);
    assert.deepEqual(await engine.startSession(404), { error: "puzzle-not-found" });
  });

  it("issues distinct ids", async () => {
    const a = await fresh(); const b = await fresh();
    assert.notEqual(a.id, b.id);
  });
});

describe("guessLetter", () => {
  it("turns over every instance of a hit and costs nothing", async () => {
    const { engine, id } = await fresh();
    const r = await engine.guessLetter(id, "e");
    assert.equal(r.hit, true);
    assert.equal(r.repeat, false);
    assert.deepEqual(r.positions, [{ wi: 1, li: 0 }, { wi: 1, li: 2 }, { wi: 2, li: 3 }]);
    assert.equal(r.lives, LIVES);
    assert.deepEqual(r.board[1], ["E", null, "E", null]);
    assert.equal(r.hiddenCount, 10);
  });

  it("a miss costs one life and reveals nothing", async () => {
    const { engine, id } = await fresh();
    const r = await engine.guessLetter(id, "Z");
    assert.equal(r.hit, false);
    assert.equal(r.lives, LIVES - 1);
    assert.deepEqual(r.missed, ["Z"]);
    assert.equal(r.hiddenCount, 13);
    assert.equal(r.finished, null);
  });

  it("a repeated letter is a no-op — no life, no change", async () => {
    const { engine, id } = await fresh();
    await engine.guessLetter(id, "Z");
    const again = await engine.guessLetter(id, "Z");
    assert.equal(again.repeat, true);
    assert.equal(again.lives, LIVES - 1);
    const anchor = await engine.guessLetter(id, "H");
    assert.equal(anchor.repeat, true);
    assert.equal(anchor.hit, true);
    assert.equal(anchor.lives, LIVES - 1);
  });

  it("rejects anything that is not one letter", async () => {
    const { engine, id } = await fresh();
    for (const bad of ["", "AB", "1", " ", null, undefined]) {
      assert.deepEqual(await engine.guessLetter(id, bad), { error: "bad-letter" });
    }
  });

  it("five misses lose the round, reveal the phrase, and score nothing", async () => {
    const { engine, id, finishes } = await fresh();
    let r;
    for (const ch of "ZXQJK") r = await engine.guessLetter(id, ch);
    assert.equal(r.lives, 0);
    assert.equal(r.finished, "lost");
    assert.equal(r.score, 0);
    assert.deepEqual(r.reveal, ["HAPPILY", "EVER", "AFTER"]);
    assert.deepEqual(r.board[1], ["E", "V", "E", "R"]);
    assert.equal(finishes.length, 1);
    assert.equal(finishes[0].outcome, "lost");
  });

  it("revealing every letter wins — for the lives alone", async () => {
    const { engine, id, finishes } = await fresh();
    let r;
    for (const ch of "EPILYVFTR") r = await engine.guessLetter(id, ch);
    assert.equal(r.finished, "won");
    assert.equal(r.hiddenCount, 0);
    assert.equal(r.score, scoreFor(0, LIVES));
    assert.equal(finishes.length, 1);
  });

  it("refuses moves on a finished round", async () => {
    const { engine, id } = await fresh();
    for (const ch of "ZXQJK") await engine.guessLetter(id, ch);
    assert.deepEqual(await engine.guessLetter(id, "E"), { error: "finished" });
    assert.deepEqual(await engine.solve(id, "happily ever after"), { error: "finished" });
  });
});

describe("solve", () => {
  it("a correct solve scores the hidden tiles and the kept lives", async () => {
    const { engine, id, finishes } = await fresh();
    await engine.guessLetter(id, "E");         // 10 hidden now
    const r = await engine.solve(id, "happily ever after");
    assert.equal(r.correct, true);
    assert.equal(r.finished, "won");
    assert.equal(r.hiddenAtSolve, 10);
    assert.equal(r.score, scoreFor(10, LIVES));
    assert.deepEqual(r.reveal, ["HAPPILY", "EVER", "AFTER"]);
    assert.equal(r.par, parFor(puzzle()));
    assert.equal(finishes.length, 1);
    assert.equal(finishes[0].outcome, "won");
    assert.equal(finishes[0].state.score, r.score);
  });

  it("solving from the anchors alone is the maximum", async () => {
    const { engine, id, start } = await fresh();
    const r = await engine.solve(id, "HAPPILY EVER AFTER");
    assert.equal(r.score, start.scoreIfSolved);
    assert.equal(r.score, scoreFor(13, LIVES));
  });

  it("a wrong solve costs one life and reveals nothing", async () => {
    const { engine, id } = await fresh();
    const r = await engine.solve(id, "happily ever laughter");
    assert.equal(r.correct, false);
    assert.equal(r.lives, LIVES - 1);
    assert.equal(r.finished, null);
    assert.equal(r.reveal, null);
    assert.equal(r.hiddenCount, 13);
    assert.equal(r.solveAttempts, 1);
  });

  it("a wrong solve on the last life loses the round", async () => {
    const { engine, id, finishes } = await fresh();
    for (const ch of "ZXQJ") await engine.guessLetter(id, ch);
    const r = await engine.solve(id, "nope nope nope");
    assert.equal(r.lives, 0);
    assert.equal(r.finished, "lost");
    assert.equal(r.score, 0);
    assert.deepEqual(r.reveal, ["HAPPILY", "EVER", "AFTER"]);
    assert.equal(finishes.length, 1);
  });

  it("ignores case, punctuation and spacing in the attempt", async () => {
    const { engine, id } = await fresh();
    const r = await engine.solve(id, "  Happily,   ever AFTER. ");
    assert.equal(r.correct, true);
  });

  it("rejects an empty attempt without spending anything", async () => {
    const { engine, id } = await fresh();
    assert.deepEqual(await engine.solve(id, "   "), { error: "empty-solve" });
    const v = await engine.resumeSession(id);
    assert.equal(v.lives, LIVES);
    assert.equal(v.solveAttempts, 0);
  });
});

describe("resumeSession", () => {
  it("returns the board as it stands, phrase still hidden", async () => {
    const { engine, id } = await fresh();
    await engine.guessLetter(id, "E");
    await engine.guessLetter(id, "Z");
    const v = await engine.resumeSession(id);
    assert.equal(v.sessionId, id);
    assert.equal(v.lives, LIVES - 1);
    assert.deepEqual(v.revealed, ["A", "E", "H"]);
    assert.deepEqual(v.missed, ["Z"]);
    assert.equal(v.reveal, null);
    assert.equal(JSON.stringify(v).includes("HAPPILY"), false);
  });

  it("carries mode and day for the daily bookkeeping", async () => {
    const stores = createMockStores();
    stores.puzzles.add(9, puzzle());
    const engine = createEngine(stores);
    const s = await engine.startSession(9, { mode: "daily", day: "2026-09-13", playerKey: "a:1" });
    assert.equal(s.mode, "daily");
    assert.equal(s.day, "2026-09-13");
    assert.equal(stores.sessions.raw(s.sessionId).playerKey, "a:1");
  });

  it("errors on an unknown session", async () => {
    const { engine } = await fresh();
    assert.deepEqual(await engine.resumeSession("nope"), { error: "no-session" });
  });
});

describe("onFinish", () => {
  it("fires once per round and never fails it", async () => {
    const stores = createMockStores();
    stores.puzzles.add(9, puzzle());
    let calls = 0;
    const engine = createEngine({ ...stores, onFinish: () => { calls++; throw new Error("bookkeeping down"); } });
    const s = await engine.startSession(9);
    const r = await engine.solve(s.sessionId, "happily ever after");
    assert.equal(r.finished, "won");
    assert.equal(calls, 1);
  });
});
