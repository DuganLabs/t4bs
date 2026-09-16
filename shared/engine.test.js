import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "./engine.js";
import { attemptsFor, evalWord, migrateState, parFor, presentFromGuessLog, scoreGuess } from "./pure.js";

/* In-memory stores. */
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
      async create(id, state) { sessions.set(id, structuredClone(state)); },
      async get(id) { const s = sessions.get(id); return s ? structuredClone(s) : null; },
      async save(id, state) { sessions.set(id, structuredClone(state)); },
    },
  };
};

function puzzle(overrides = {}) {
  return {
    id: "p1", phrase: "HELLO WORLD", category: "Test", submittedBy: "house", approved: true,
    anchors: [{ wi: 0, li: 0 }, { wi: 1, li: 0 }],   // H…, W…
    ...overrides,
  };
}

async function fresh(overrides = {}, engineOpts = {}) {
  const stores = createMockStores();
  stores.puzzles.add("p1", puzzle(overrides));
  const engine = createEngine({ ...stores, ...engineOpts });
  const s = await engine.startSession("p1");
  return { stores, engine, s };
}

/* Letters for the OPEN tiles of a word, given the full word guess. */
function open(fullGuess, lockedMap) {
  return fullGuess.split("").filter((_, i) => lockedMap[i] === undefined);
}

describe("pure rules", () => {
  it("attempts per word: 3 for 1–3 letters, 4 for 4–6, 5 for 7+", () => {
    assert.deepEqual([1, 3, 4, 6, 7, 12].map(attemptsFor), [3, 3, 4, 4, 5, 5]);
  });

  it("evalWord: green, yellow with duplicates handled, absent", () => {
    assert.deepEqual(evalWord("HELLO".split(""), "HELLO"), ["green", "green", "green", "green", "green"]);
    assert.deepEqual(evalWord("OLLEH".split(""), "HELLO"), ["yellow", "yellow", "green", "yellow", "yellow"]);
    // Two Ls in the target: one is the green at index 2, the other backs ONE yellow.
    assert.deepEqual(evalWord("LLLXX".split(""), "HELLO"), ["yellow", "absent", "green", "absent", "absent"]);
  });

  it("scoreGuess: +5 green, −1 wrong, a stake doubles to +10 / −5, locked tiles never score", () => {
    assert.equal(scoreGuess(["green", "absent", "yellow"], [], {}), 5 - 1 - 1);
    assert.equal(scoreGuess(["green", "absent"], [0], {}), 10 - 1);
    assert.equal(scoreGuess(["green", "absent"], [1], {}), 5 - 5);
    assert.equal(scoreGuess(["green", "green"], [], { 0: "H" }), 5);
  });

  it("par is a clean solve: 5 per non-anchor tile + 10 per word, unless the puzzle sets its own", () => {
    assert.equal(parFor(puzzle()), (10 - 2) * 5 + 2 * 10);
    assert.equal(parFor(puzzle({ par: 77 })), 77);
  });
});

describe("startSession / resumeSession", () => {
  it("opens with anchors locked, per-word attempts, nothing busted, and no answer", async () => {
    const { s } = await fresh();
    assert.deepEqual(s.words, [5, 5]);
    assert.deepEqual(s.attempts, [4, 4]);
    assert.deepEqual(s.attemptsMax, [4, 4]);
    assert.deepEqual(s.busted, [false, false]);
    assert.deepEqual(s.locked, [{ 0: "H" }, { 0: "W" }]);
    assert.deepEqual(s.anchors, [{ wi: 0, li: 0, letter: "H" }, { wi: 1, li: 0, letter: "W" }]);
    assert.equal(s.reveal, null);
    assert.equal(s.finished, null);
    assert.equal(s.mode, "free");
    assert.ok(!("phrase" in s));
  });

  it("resume returns the same view, including the full guess history", async () => {
    const { engine, s } = await fresh();
    await engine.submitGuess(s.sessionId, 0, open("HELLO", s.locked[0]));
    const r = await engine.resumeSession(s.sessionId);
    assert.equal(r.wordSolved[0], true);
    assert.equal(r.guessLog.length, 1);
    assert.deepEqual(r.guessLog[0].letters, ["H", "E", "L", "L", "O"]);
    assert.deepEqual(r.guessLog[0].feedback, ["green", "green", "green", "green", "green"]);
  });

  it("refuses an unknown puzzle and an unknown session", async () => {
    const { engine } = await fresh();
    assert.equal((await engine.startSession("nope")).error, "puzzle-not-found");
    assert.equal((await engine.resumeSession("nope")).error, "no-session");
  });
});

describe("submitGuess — the word-guessing loop", () => {
  it("a correct word locks, scores 5 per new green + 10, earns a cascade token when clean", async () => {
    const { engine, s } = await fresh();
    const r = await engine.submitGuess(s.sessionId, 0, open("HELLO", s.locked[0]));
    assert.deepEqual(r.feedback, ["green", "green", "green", "green", "green"]);
    assert.equal(r.scoreDelta, 4 * 5 + 10);
    assert.equal(r.wordSolved[0], true);
    assert.equal(r.cascadeEarned, true);
    assert.equal(r.tokens, 1);
    assert.equal(r.attempts[0], 4, "a hit spends nothing");
  });

  it("a miss spends one attempt on THAT word only, locks its greens, records absent letters", async () => {
    const { engine, s } = await fresh();
    const r = await engine.submitGuess(s.sessionId, 0, open("HEXXY", s.locked[0]));
    assert.deepEqual(r.feedback, ["green", "green", "absent", "absent", "absent"]);
    assert.deepEqual(r.attempts, [3, 4]);
    assert.deepEqual(r.locked[0], { 0: "H", 1: "E" });
    assert.deepEqual(r.absentByWord[0].sort(), ["X", "Y"]);
    assert.ok(r.presentGlobal.includes("E"));
    assert.equal(r.finished, null);
  });

  /* Presence is recorded twice, on purpose, and the two ledgers mean
     different things: presentByWord is what the KEYBOARD colours from and
     is scoped to the word the letter was seen in; presentGlobal is the
     phrase-level fact the letter bank and the knowledge read-out show. */
  it("a yellow letter is recorded against the word it fell in, and nowhere else", async () => {
    const { engine, s } = await fresh();
    const r = await engine.submitGuess(s.sessionId, 0, open("HOXXX", s.locked[0]));
    assert.equal(r.feedback[1], "yellow");
    assert.ok(r.presentByWord[0].includes("O"), "O was seen in word 1");
    assert.ok(!r.presentByWord[1].includes("O"), "word 2 has learned nothing about O");
  });

  it("a green letter is recorded against its own word only", async () => {
    const { engine, s } = await fresh();
    const r = await engine.submitGuess(s.sessionId, 0, open("HELLO", s.locked[0]));
    assert.ok(r.presentByWord[0].includes("E"));
    assert.ok(!r.presentByWord[1].includes("E"), "solving word 1 says nothing about word 2's letters");
    assert.equal(r.locked[1].E, undefined, "and nothing is locked in word 2");
  });

  it("presentGlobal stays phrase-wide — the letter bank's fact, not the keyboard's", async () => {
    const { engine, s } = await fresh();
    const r = await engine.submitGuess(s.sessionId, 0, open("HOXXX", s.locked[0]));
    assert.ok(r.presentGlobal.includes("O"), "O is somewhere in the phrase, and that is true");
  });

  it("the next guess only fills the OPEN tiles — greens stay locked", async () => {
    const { engine, s } = await fresh();
    const a = await engine.submitGuess(s.sessionId, 0, open("HEXXY", s.locked[0]));
    const b = await engine.submitGuess(s.sessionId, 0, ["L", "L", "O"]);
    assert.equal(b.wordSolved[0], true);
    assert.equal(b.cascadeEarned, false, "not clean — there was a miss before");
    assert.equal(a.attempts[0], 3);
  });

  it("running a word out of attempts busts it: revealed, round continues", async () => {
    const { engine, s } = await fresh();
    let r;
    for (let i = 0; i < 4; i++) r = await engine.submitGuess(s.sessionId, 0, ["X", "X", "X", "X"]);
    assert.equal(r.bustedNow, true);
    assert.equal(r.busted[0], true);
    assert.equal(r.attempts[0], 0);
    assert.deepEqual(r.locked[0], { 0: "H", 1: "E", 2: "L", 3: "L", 4: "O" }, "the busted word is revealed");
    assert.equal(r.finished, null, "the other word is still open");
    assert.equal((await engine.submitGuess(s.sessionId, 0, [])).error, "word-busted");
  });

  it("ends Solved when every word is green", async () => {
    const { engine, s } = await fresh();
    await engine.submitGuess(s.sessionId, 0, open("HELLO", s.locked[0]));
    const r = await engine.submitGuess(s.sessionId, 1, open("WORLD", s.locked[1]));
    assert.equal(r.finished, "won");
    assert.deepEqual(r.reveal, ["HELLO", "WORLD"]);
  });

  it("ends lost only once every word is resolved and at least one was busted", async () => {
    const { engine, s } = await fresh();
    for (let i = 0; i < 4; i++) await engine.submitGuess(s.sessionId, 0, ["X", "X", "X", "X"]);
    const r = await engine.submitGuess(s.sessionId, 1, open("WORLD", s.locked[1]));
    assert.equal(r.wordSolved[1], true);
    assert.equal(r.finished, "lost");
    assert.deepEqual(r.reveal, ["HELLO", "WORLD"]);
  });

  it("rejects a finished round, a solved word, a wrong-sized guess and a bad index", async () => {
    const { engine, s } = await fresh();
    assert.equal((await engine.submitGuess(s.sessionId, 0, ["A"])).error, "incomplete-guess");
    assert.equal((await engine.submitGuess(s.sessionId, 5, ["A"])).error, "bad-word-index");
    await engine.submitGuess(s.sessionId, 0, open("HELLO", s.locked[0]));
    assert.equal((await engine.submitGuess(s.sessionId, 0, ["A", "B", "C", "D"])).error, "word-already-solved");
    await engine.submitGuess(s.sessionId, 1, open("WORLD", s.locked[1]));
    assert.equal((await engine.submitGuess(s.sessionId, 1, ["A", "B", "C", "D"])).error, "finished");
  });

  it("score never drops below zero", async () => {
    const { engine, s } = await fresh();
    const r = await engine.submitGuess(s.sessionId, 0, ["X", "X", "X", "X"], [0, 1, 2, 3]);
    assert.equal(r.score, 0);
    assert.equal(r.scoreDelta, -20);
  });

  it("records every attempt in full, in order", async () => {
    const { engine, s } = await fresh();
    await engine.submitGuess(s.sessionId, 0, open("HEXXY", s.locked[0]));
    const r = await engine.submitGuess(s.sessionId, 0, ["L", "L", "O"]);
    assert.equal(r.guessLog.length, 2);
    assert.deepEqual(r.guessLog[0], { wi: 0, letters: ["H", "E", "X", "X", "Y"], feedback: ["green", "green", "absent", "absent", "absent"], allGreen: false, staked: [] });
    assert.equal(r.guessLog[1].allGreen, true);
  });
});

describe("stakes — a score bet, not a life (proposal §3.2)", () => {
  it("a right staked tile pays double", async () => {
    const { engine, s } = await fresh();
    const r = await engine.submitGuess(s.sessionId, 0, open("HELLO", s.locked[0]), [0]);
    assert.equal(r.scoreDelta, 10 + 5 + 5 + 5 + 10);
    assert.equal(r.stakeBusted, false);
  });

  it("a wrong staked tile costs 5 and no attempt beyond the miss itself", async () => {
    const { engine, s } = await fresh();
    const r = await engine.submitGuess(s.sessionId, 0, open("HEXLO", s.locked[0]), [1]);   // stake on X
    assert.equal(r.stakeBusted, true);
    assert.equal(r.scoreDelta, 5 + (-5) + 5 + 5);
    assert.equal(r.attempts[0], 3, "one attempt for the miss, none for the stake");
  });
});

describe("cascade", () => {
  it("spends a token to reveal one tile, and can complete a word", async () => {
    const { engine, s } = await fresh();
    await engine.submitGuess(s.sessionId, 0, open("HELLO", s.locked[0]));   // clean → token
    await engine.submitGuess(s.sessionId, 1, open("WORLX", s.locked[1]));   // O R L green
    const r = await engine.spendCascade(s.sessionId, 1, 4);
    assert.equal(r.tokens, 0);
    assert.equal(r.locked[1][4], "D");
    assert.equal(r.wordSolved[1], true, "the reveal completed the word");
    assert.equal(r.finished, "won");
  });

  it("refuses without a token, on a locked tile, on a solved or busted word", async () => {
    const { engine, s } = await fresh();
    assert.equal((await engine.spendCascade(s.sessionId, 1, 1)).error, "no-tokens");
    await engine.submitGuess(s.sessionId, 0, open("HELLO", s.locked[0]));
    assert.equal((await engine.spendCascade(s.sessionId, 1, 0)).error, "already-locked");
    assert.equal((await engine.spendCascade(s.sessionId, 0, 1)).error, "word-already-solved");
  });
});

describe("ALL IN", () => {
  it("right: +8 per hidden tile, Solved", async () => {
    const { engine, s } = await fresh();
    const r = await engine.allIn(s.sessionId, ["hello", "world"]);
    assert.equal(r.correct, true);
    assert.equal(r.scoreDelta, 8 * 8);
    assert.equal(r.finished, "won");
  });

  it("wrong: every unsolved word is busted and the round is Finished", async () => {
    const { engine, s } = await fresh();
    await engine.submitGuess(s.sessionId, 0, open("HELLO", s.locked[0]));
    const r = await engine.allIn(s.sessionId, ["HELLO", "WORLX"]);
    assert.equal(r.correct, false);
    assert.deepEqual(r.busted, [false, true]);
    assert.equal(r.finished, "lost");
    assert.deepEqual(r.reveal, ["HELLO", "WORLD"]);
  });

  it("rejects a shape mismatch", async () => {
    const { engine, s } = await fresh();
    assert.equal((await engine.allIn(s.sessionId, ["HELLO"])).error, "shape-mismatch");
    assert.equal((await engine.allIn(s.sessionId, ["HELLO", "WORL"])).error, "shape-mismatch");
  });
});

describe("mode + the finish hook", () => {
  it("tags a daily session and fires onFinish exactly once, after the save", async () => {
    const calls = [];
    const stores = createMockStores();
    stores.puzzles.add("p1", puzzle());
    const engine = createEngine({ ...stores, onFinish: async (info) => { calls.push(info); } });
    const s = await engine.startSession("p1", { mode: "daily", day: "2026-09-14", playerKey: "pk" });
    assert.equal(s.mode, "daily");
    assert.equal(s.day, "2026-09-14");
    await engine.submitGuess(s.sessionId, 0, open("HELLO", s.locked[0]));
    assert.equal(calls.length, 0);
    await engine.submitGuess(s.sessionId, 1, open("WORLD", s.locked[1]));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].outcome, "won");
    assert.equal(calls[0].state.playerKey, "pk");
    assert.equal((await stores.sessions.get(s.sessionId)).finished, "won");
  });

  it("a recorder failure never fails the round", async () => {
    const { engine, s } = await fresh({}, { onFinish: async () => { throw new Error("boom"); } });
    const r = await engine.allIn(s.sessionId, ["HELLO", "WORLD"]);
    assert.equal(r.finished, "won");
  });
});


/* ── Per-word knowledge: ALL IN and stored sessions ─────────────────── */

describe("ALL IN — feedback still belongs to one word at a time", () => {
  it("a correct shove records every letter against the word it fell in", async () => {
    const { engine, s } = await fresh();
    const r = await engine.allIn(s.sessionId, ["HELLO", "WORLD"]);
    assert.equal(r.correct, true);
    assert.deepEqual(r.presentByWord[0].sort(), ["E", "H", "L", "O"]);
    assert.deepEqual(r.presentByWord[1].sort(), ["D", "L", "O", "R", "W"]);
    assert.ok(!r.presentByWord[0].includes("W"), "W belongs to word 2 and stays there");
    assert.ok(!r.presentByWord[1].includes("H"), "H belongs to word 1 and stays there");
  });

  it("a wrong shove busts and reveals every word, and records each reveal per word", async () => {
    const { engine, s } = await fresh();
    const r = await engine.allIn(s.sessionId, ["HELLO", "WORLX"]);
    assert.equal(r.correct, false);
    assert.deepEqual(r.busted, [true, true]);
    assert.ok(!r.presentByWord[0].includes("W"));
    assert.ok(r.presentByWord[1].includes("D"), "word 2 is revealed, so its letters are known to be in it");
  });

  it("the ALL IN guess-log row carries no per-tile feedback, so nothing can be misattributed", async () => {
    const { engine, s } = await fresh();
    const r = await engine.allIn(s.sessionId, ["HELLO", "WORLD"]);
    const row = r.guessLog.at(-1);
    assert.equal(row.wi, -1);
    assert.equal(row.feedback, undefined);
    assert.deepEqual(presentFromGuessLog(2, [row], [{}, {}]), [[], []]);
  });
});

describe("a session persisted before presentByWord existed", () => {
  /* Rounds are a JSON blob in D1 (functions/_shared/d1.js) read back by
     session id, so one started before this change can still be in flight.
     It must load and play — a stored session that crashes the play screen
     is a worse bug than the keyboard lying. */
  async function legacySession() {
    const { engine, stores, s } = await fresh();
    await engine.submitGuess(s.sessionId, 0, open("HOXXX", s.locked[0]));
    const raw = await stores.sessions.get(s.sessionId);
    delete raw.presentByWord;                       // exactly the old shape
    await stores.sessions.save(s.sessionId, raw);
    return { engine, stores, sessionId: s.sessionId };
  }

  it("resumes, and rebuilds per-word presence from the stored guess log", async () => {
    const { engine, sessionId } = await legacySession();
    const r = await engine.resumeSession(sessionId);
    assert.ok(Array.isArray(r.presentByWord));
    assert.equal(r.presentByWord.length, 2);
    assert.ok(r.presentByWord[0].includes("O"), "the yellow O is recovered from the guess log");
    assert.ok(r.presentByWord[0].includes("H"), "and the anchor H, which is visibly in word 1");
    assert.ok(!r.presentByWord[1].includes("O"), "word 2 learns nothing it was never told");
  });

  it("keeps playing from there — the next guess records against the right word", async () => {
    const { engine, sessionId } = await legacySession();
    const r = await engine.submitGuess(sessionId, 1, ["O", "R", "L", "D"]);
    assert.equal(r.wordSolved[1], true);
    assert.deepEqual(r.presentByWord[1].sort(), ["D", "L", "O", "R", "W"]);
  });

  it("migrateState leaves an already-migrated session alone", () => {
    const sess = {
      locked: [{}, {}], attempts: [4, 4], guessLog: [],
      presentGlobal: ["Q"], presentByWord: [["Q"], []], absentByWord: [["X"], []],
    };
    const out = migrateState(sess);
    assert.deepEqual(out.presentByWord, [["Q"], []]);
    assert.deepEqual(out.absentByWord, [["X"], []]);
  });

  it("migrateState is safe on junk", () => {
    assert.equal(migrateState(null), null);
    const bare = migrateState({ locked: [{}, {}, {}] });
    assert.deepEqual(bare.presentByWord, [[], [], []]);
    assert.deepEqual(bare.absentByWord, [[], [], []]);
    assert.deepEqual(bare.presentGlobal, []);
  });
});
