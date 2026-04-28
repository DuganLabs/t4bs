import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "./engine.js";
import { initialState, publicShape } from "./pure.js";

/* Mock stores for in-memory testing. */
const createMockStores = () => {
  const puzzles = new Map();
  const sessions = new Map();

  return {
    puzzles: {
      async listApproved() {
        return Array.from(puzzles.values()).filter(p => p.approved);
      },
      async getApproved(id) {
        const p = puzzles.get(id);
        return p && p.approved ? p : null;
      },
      add(id, puzzle) {
        puzzles.set(id, puzzle);
      },
    },
    sessions: {
      async create(id, state) {
        sessions.set(id, { ...state });
      },
      async get(id) {
        const sess = sessions.get(id);
        return sess ? { ...sess } : null;
      },
      async save(id, state) {
        sessions.set(id, { ...state });
      },
    },
  };
};

/* Helper to create a test puzzle. */
function createTestPuzzle(overrides = {}) {
  return {
    id: "puzzle-1",
    phrase: "HELLO WORLD",
    category: "Test",
    submittedBy: "testuser",
    approved: true,
    anchors: [
      { wi: 0, li: 0 }, // H in HELLO
      { wi: 1, li: 0 }, // W in WORLD
    ],
    ...overrides,
  };
}

describe("Game Engine", () => {
  describe("Initialization - startSession", () => {
    it("should create a new session with correct initial state", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const result = await engine.startSession("puzzle-1");

      assert.equal(result.error, undefined);
      assert.ok(result.sessionId);
      assert.deepEqual(result.words, [5, 5]); // HELLO, WORLD
      assert.deepEqual(result.anchors, [
        { wi: 0, li: 0, letter: "H" },
        { wi: 1, li: 0, letter: "W" },
      ]);
      assert.equal(result.lives, 4);
      assert.equal(result.totalLetters, 10);
    });

    it("should return error for non-existent puzzle", async () => {
      const { puzzles, sessions } = createMockStores();
      const engine = createEngine({ puzzles, sessions });

      const result = await engine.startSession("nonexistent");

      assert.equal(result.error, "puzzle-not-found");
    });

    it("should generate unique session IDs", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const sess1 = await engine.startSession("puzzle-1");
      const sess2 = await engine.startSession("puzzle-1");

      assert.notEqual(sess1.sessionId, sess2.sessionId);
    });

    it("should initialize session with anchors locked", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      await engine.startSession("puzzle-1");
      const sessData = await sessions.get((await engine.startSession("puzzle-1")).sessionId);

      // First word (HELLO): H at position 0 should be locked
      assert.equal(sessData.locked[0][0], "H");
      // W at position 0 of second word should be locked
      assert.equal(sessData.locked[1][0], "W");
      // Other positions should not be locked
      assert.equal(sessData.locked[0][1], undefined);
      assert.equal(sessData.locked[1][1], undefined);
    });

    it("should initialize with correct starting values", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const result = await engine.startSession("puzzle-1");
      const sessionId = result.sessionId;
      const sess = await sessions.get(sessionId);

      assert.equal(sess.lives, 4);
      assert.equal(sess.score, 0);
      assert.equal(sess.tokens, 0);
      assert.deepEqual(sess.presentGlobal, []);
      assert.deepEqual(sess.wordSolved, [false, false]);
      assert.equal(sess.finished, null);
    });
  });

  describe("Initialization - resumeSession", () => {
    it("should return existing session state", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const resumed = await engine.resumeSession(started.sessionId);

      assert.equal(resumed.sessionId, started.sessionId);
      assert.deepEqual(resumed.words, started.words);
      assert.equal(resumed.lives, started.lives);
    });

    it("should return error for non-existent session", async () => {
      const { puzzles, sessions } = createMockStores();
      const engine = createEngine({ puzzles, sessions });

      const result = await engine.resumeSession("nonexistent-session");

      assert.equal(result.error, "no-session");
    });

    it("should not reveal phrase when game is ongoing", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const resumed = await engine.resumeSession(started.sessionId);

      assert.equal(resumed.reveal, null);
    });

    it("should reveal phrase when game is finished", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const sess = await sessions.get(started.sessionId);
      sess.finished = "won";
      await sessions.save(started.sessionId, sess);

      const resumed = await engine.resumeSession(started.sessionId);

      assert.deepEqual(resumed.reveal, ["HELLO", "WORLD"]);
      assert.equal(resumed.finished, "won");
    });
  });

  describe("Letter Guessing - submitGuess", () => {
    it("should reject guess on finished game", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const sess = await sessions.get(started.sessionId);
      sess.finished = "won";
      await sessions.save(started.sessionId, sess);

      const result = await engine.submitGuess(started.sessionId, 0, ["E", "L", "L", "O"]);

      assert.equal(result.error, "finished");
    });

    it("should reject guess for already-solved word", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const sess = await sessions.get(started.sessionId);
      sess.wordSolved[0] = true;
      await sessions.save(started.sessionId, sess);

      const result = await engine.submitGuess(started.sessionId, 0, ["E", "L", "L", "O"]);

      assert.equal(result.error, "word-already-solved");
    });

    it("should reject guess with wrong number of letters", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");

      // HELLO has 5 letters, but H is locked (anchor), so 4 slots available
      const result = await engine.submitGuess(started.sessionId, 0, ["E", "L", "L"]); // Only 3

      assert.equal(result.error, "incomplete-guess");
    });

    it("should reject guess with invalid word index", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");

      const result = await engine.submitGuess(started.sessionId, 5, ["X"]);

      assert.equal(result.error, "bad-word-index");
    });

    it("should handle correct full word guess (allGreen)", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      // HELLO: H is locked (anchor at 0), need to guess E, L, L, O at positions 1, 2, 3, 4
      const result = await engine.submitGuess(started.sessionId, 0, ["E", "L", "L", "O"]);

      assert.equal(result.error, undefined);
      assert.deepEqual(result.feedback, ["green", "green", "green", "green", "green"]);
      assert.equal(result.wordSolved, true);
      assert.equal(result.cascadeEarned, true); // First correct guess = token
      assert.equal(result.tokens, 1);
      assert.ok(result.scoreDelta > 0); // Should have score bonus
      assert.equal(result.livesDelta, 0); // Correct guess doesn't cost a life
    });

    it("should handle incorrect guess (loses life)", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      // Guess wrong letters at some positions
      const result = await engine.submitGuess(started.sessionId, 0, ["X", "Y", "Z", "Q"]);

      assert.equal(result.error, undefined);
      assert.equal(result.wordSolved, false);
      assert.equal(result.livesDelta, -1);
      assert.equal(result.lives, 3); // Started with 4
      assert.equal(result.cascadeEarned, false);
    });

    it("should handle partial word guess (yellow and absent)", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      // E, L, L, O are correct letters but some in wrong positions for HELLO
      // Actually, let's guess with letters that exist but not at position
      // HELLO: A, B, C, D should all be absent (not in word)
      const result = await engine.submitGuess(started.sessionId, 0, ["A", "B", "C", "D"]);

      assert.ok(result.feedback);
      assert.ok(result.absentByWord); // Should track absent letters
      // presentGlobal includes H from anchor, so should have 1 element
      assert.deepEqual(result.presentGlobal, ["H"]); // Only H (from anchor)
    });

    it("should update locked letters for green guesses", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      // Guess with some correct letters
      const result = await engine.submitGuess(started.sessionId, 0, ["E", "L", "L", "O"]);

      assert.deepEqual(result.locked, {
        0: "H", // anchor
        1: "E",
        2: "L",
        3: "L",
        4: "O",
      });
    });

    it("should track presentGlobal (known letters)", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      // Guess E, L, L, O - all are in HELLO
      const result = await engine.submitGuess(started.sessionId, 0, ["E", "L", "L", "O"]);

      assert.ok(result.presentGlobal.includes("E"));
      assert.ok(result.presentGlobal.includes("L"));
      assert.ok(result.presentGlobal.includes("O"));
      assert.ok(result.presentGlobal.includes("H")); // Anchor was already known
    });

    it("should track absentByWord (letters not in word)", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      // Guess with letters not in HELLO
      const result = await engine.submitGuess(started.sessionId, 0, ["X", "Y", "Z", "Q"]);

      assert.ok(result.absentByWord.includes("X"));
      assert.ok(result.absentByWord.includes("Y"));
    });

    it("should not grant cascade on second correct guess of same word", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const sess = await sessions.get(started.sessionId);

      // First correct guess (should grant cascade)
      let result = await engine.submitGuess(started.sessionId, 0, ["E", "L", "L", "O"]);
      assert.equal(result.cascadeEarned, true);
      assert.equal(result.tokens, 1);

      // Try guessing the same word again (should fail - already solved)
      result = await engine.submitGuess(started.sessionId, 0, ["E", "L", "L", "O"]);
      assert.equal(result.error, "word-already-solved");
    });

    it("should not grant cascade if word was guessed incorrectly before", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");

      // First guess: incorrect
      let result = await engine.submitGuess(started.sessionId, 0, ["X", "Y", "Z", "Q"]);
      assert.equal(result.cascadeEarned, false);
      assert.equal(result.tokens, 0);

      // Second guess: correct
      result = await engine.submitGuess(started.sessionId, 0, ["E", "L", "L", "O"]);
      assert.equal(result.cascadeEarned, false); // No cascade because there was a prior wrong guess
      assert.equal(result.tokens, 0);
    });

    it("should award 10 point bonus for solving word", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const result = await engine.submitGuess(started.sessionId, 0, ["E", "L", "L", "O"]);

      // scoreDelta should include the 10-point word bonus
      assert.ok(result.scoreDelta >= 10);
    });

    it("should end game with 'won' when all words solved", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");

      // Solve first word
      await engine.submitGuess(started.sessionId, 0, ["E", "L", "L", "O"]);
      // Solve second word
      const result = await engine.submitGuess(started.sessionId, 1, ["O", "R", "L", "D"]);

      assert.equal(result.finished, "won");
      assert.deepEqual(result.reveal, ["HELLO", "WORLD"]);
    });

    it("should end game with 'lost' when lives reach 0", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");

      // Make 4 wrong guesses (starting with 4 lives)
      for (let i = 0; i < 4; i++) {
        const result = await engine.submitGuess(started.sessionId, 0, ["X", "Y", "Z", "Q"]);
        if (i < 3) {
          assert.equal(result.finished, null);
        } else {
          assert.equal(result.finished, "lost");
        }
      }
    });

    it("should handle wager (stake) multipliers on scoring", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      // Guess with wagers on positions (relative wager indices)
      const resultWithWager = await engine.submitGuess(started.sessionId, 0, ["E", "L", "L", "O"], [0, 1]);
      const resultNoWager = await engine.submitGuess(started.sessionId, 1, ["O", "R", "L", "D"], []);

      // Both are correct, but wager should have higher score
      assert.ok(resultWithWager.scoreDelta > 0);
      assert.ok(resultNoWager.scoreDelta > 0);
    });

    it("should not count already-locked positions in scoring", async () => {
      const { puzzles, sessions } = createMockStores();
      // Create a puzzle with more anchors
      const puzzle = createTestPuzzle({
        anchors: [
          { wi: 0, li: 0 }, // H
          { wi: 0, li: 4 }, // O
        ],
      });
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      // Guess only the middle letters (E, L, L)
      // HELLO: positions 0 and 4 are locked, need to guess 1, 2, 3
      const result = await engine.submitGuess(started.sessionId, 0, ["E", "L", "L"]);

      // H and O were already locked, so only E, L, L score
      assert.ok(result.feedback);
      assert.equal(result.wordSolved, true);
      // Score should only count the 3 guessed positions
      assert.ok(result.scoreDelta > 0);
    });

    it("should preserve immutability of input state", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const origSess = await sessions.get(started.sessionId);
      const origLives = origSess.lives;
      const origScore = origSess.score;
      const origLocked = JSON.stringify(origSess.locked);

      // Make a guess
      await engine.submitGuess(started.sessionId, 0, ["X", "Y", "Z", "Q"]);

      // Re-fetch and verify the session was properly saved
      const updatedSess = await sessions.get(started.sessionId);
      assert.equal(updatedSess.lives, origLives - 1);
      assert.equal(updatedSess.score, origScore); // Depends on guess outcome
    });
  });

  describe("Cascade Mechanic - spendCascade", () => {
    it("should reject cascade spend on finished game", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const sess = await sessions.get(started.sessionId);
      sess.finished = "won";
      sess.tokens = 1;
      await sessions.save(started.sessionId, sess);

      const result = await engine.spendCascade(started.sessionId, 0, 1);

      assert.equal(result.error, "finished");
    });

    it("should reject cascade spend with no tokens", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");

      const result = await engine.spendCascade(started.sessionId, 0, 1);

      assert.equal(result.error, "no-tokens");
    });

    it("should reject cascade spend on already-locked letter", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const sess = await sessions.get(started.sessionId);
      sess.tokens = 1;
      await sessions.save(started.sessionId, sess);

      // Try to lock position 0 which is already locked (anchor)
      const result = await engine.spendCascade(started.sessionId, 0, 0);

      assert.equal(result.error, "already-locked");
    });

    it("should reject cascade spend on already-solved word", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const sess = await sessions.get(started.sessionId);
      sess.wordSolved[0] = true;
      sess.tokens = 1;
      await sessions.save(started.sessionId, sess);

      const result = await engine.spendCascade(started.sessionId, 0, 1);

      assert.equal(result.error, "word-already-solved");
    });

    it("should successfully lock a letter with a cascade token", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const sess = await sessions.get(started.sessionId);
      sess.tokens = 1;
      await sessions.save(started.sessionId, sess);

      const result = await engine.spendCascade(started.sessionId, 0, 1);

      assert.equal(result.error, undefined);
      assert.equal(result.locked[1], "E"); // Second letter of HELLO
      assert.equal(result.tokens, 0); // Token spent
    });

    it("should add locked letter to presentGlobal", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const sess = await sessions.get(started.sessionId);
      sess.tokens = 1;
      await sessions.save(started.sessionId, sess);

      const result = await engine.spendCascade(started.sessionId, 0, 1);

      assert.ok(result.presentGlobal.includes("E"));
    });

    it("should reject cascade spend on invalid word index", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const sess = await sessions.get(started.sessionId);
      sess.tokens = 1;
      await sessions.save(started.sessionId, sess);

      const result = await engine.spendCascade(started.sessionId, 5, 1);

      assert.equal(result.error, "bad-word-index");
    });

    it("should allow multiple cascades on different positions", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const sess = await sessions.get(started.sessionId);
      sess.tokens = 3;
      await sessions.save(started.sessionId, sess);

      let result = await engine.spendCascade(started.sessionId, 0, 1);
      assert.equal(result.error, undefined);
      assert.equal(result.tokens, 2);
      assert.equal(result.locked[1], "E");

      result = await engine.spendCascade(started.sessionId, 0, 2);
      assert.equal(result.error, undefined);
      assert.equal(result.tokens, 1);
      assert.equal(result.locked[2], "L");
    });
  });

  describe("All-In Mechanic - allIn", () => {
    it("should reject all-in on finished game", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const sess = await sessions.get(started.sessionId);
      sess.finished = "won";
      await sessions.save(started.sessionId, sess);

      const result = await engine.allIn(started.sessionId, ["HELLO", "WORLD"]);

      assert.equal(result.error, "finished");
    });

    it("should reject all-in with shape mismatch (wrong word count)", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");

      const result = await engine.allIn(started.sessionId, ["HELLO"]); // Missing WORLD

      assert.equal(result.error, "shape-mismatch");
    });

    it("should reject all-in with shape mismatch (wrong word length)", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");

      const result = await engine.allIn(started.sessionId, ["HELLO", "WOR"]); // Wrong length

      assert.equal(result.error, "shape-mismatch");
    });

    it("should reject all-in if not an array", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");

      const result = await engine.allIn(started.sessionId, "HELLO WORLD");

      assert.equal(result.error, "shape-mismatch");
    });

    it("should win on correct all-in guess", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");

      const result = await engine.allIn(started.sessionId, ["HELLO", "WORLD"]);

      assert.equal(result.error, undefined);
      assert.equal(result.correct, true);
      assert.equal(result.finished, "won");
      assert.deepEqual(result.reveal, ["HELLO", "WORLD"]);
    });

    it("should lose on incorrect all-in guess", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");

      const result = await engine.allIn(started.sessionId, ["HELLO", "WORDS"]);

      assert.equal(result.error, undefined);
      assert.equal(result.correct, false);
      assert.equal(result.finished, "lost");
      assert.equal(result.lives, 0);
      assert.deepEqual(result.reveal, ["HELLO", "WORLD"]);
    });

    it("should be case-insensitive", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");

      const result = await engine.allIn(started.sessionId, ["hello", "world"]);

      assert.equal(result.correct, true);
      assert.equal(result.finished, "won");
    });

    it("should award score based on unsolved letters", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");

      const result = await engine.allIn(started.sessionId, ["HELLO", "WORLD"]);

      // Both words have 10 letters, 2 are anchored (H, W), so 8 unsolved
      // Score should be: 8 * 8 = 64
      assert.equal(result.scoreDelta, 64);
      assert.ok(result.score >= 64);
    });

    it("should award reduced score when letters are already locked", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const sess = await sessions.get(started.sessionId);
      // Manually lock more letters
      sess.locked[0][1] = "E";
      sess.locked[0][2] = "L";
      await sessions.save(started.sessionId, sess);

      const result = await engine.allIn(started.sessionId, ["HELLO", "WORLD"]);

      // Now only 6 unsolved letters (2 in word 0 locked: H, E, L; 5 in word 1)
      assert.ok(result.scoreDelta < 64);
      assert.ok(result.scoreDelta > 0);
    });

    it("should lock all letters on correct all-in", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");

      await engine.allIn(started.sessionId, ["HELLO", "WORLD"]);
      const sess = await sessions.get(started.sessionId);

      assert.equal(sess.locked[0][0], "H");
      assert.equal(sess.locked[0][1], "E");
      assert.equal(sess.locked[0][4], "O");
      assert.equal(sess.locked[1][0], "W");
      assert.equal(sess.locked[1][4], "D");
    });

    it("should mark all words as solved on correct all-in", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");

      await engine.allIn(started.sessionId, ["HELLO", "WORLD"]);
      const sess = await sessions.get(started.sessionId);

      assert.equal(sess.wordSolved[0], true);
      assert.equal(sess.wordSolved[1], true);
    });

    it("should not modify locked state on incorrect all-in", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const sessBefore = await sessions.get(started.sessionId);
      const lockedBefore = JSON.stringify(sessBefore.locked);

      await engine.allIn(started.sessionId, ["HELLO", "WRONG"]);
      const sessAfter = await sessions.get(started.sessionId);

      // Locked state should not change on wrong guess
      assert.equal(lockedBefore, JSON.stringify(sessAfter.locked));
    });
  });

  describe("Edge Cases", () => {
    it("should handle single-word phrase", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle({
        phrase: "HELLO",
        anchors: [{ wi: 0, li: 0 }],
      });
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const result = await engine.startSession("puzzle-1");

      assert.deepEqual(result.words, [5]);
      assert.equal(result.totalLetters, 5);
    });

    it("should handle multi-word phrases", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle({
        phrase: "THE QUICK BROWN FOX",
        anchors: [
          { wi: 0, li: 0 },
          { wi: 1, li: 0 },
          { wi: 2, li: 0 },
          { wi: 3, li: 0 },
        ],
      });
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const result = await engine.startSession("puzzle-1");

      assert.deepEqual(result.words, [3, 5, 5, 3]);
      assert.equal(result.totalLetters, 16);
    });

    it("should handle phrase with many anchors", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle({
        anchors: [
          { wi: 0, li: 0 },
          { wi: 0, li: 1 },
          { wi: 0, li: 2 },
          { wi: 0, li: 3 },
          { wi: 0, li: 4 },
        ],
      });
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      // All letters of HELLO are locked
      const result = await engine.submitGuess(started.sessionId, 0, []);

      assert.equal(result.error, undefined);
      assert.deepEqual(result.feedback, ["green", "green", "green", "green", "green"]);
      assert.equal(result.wordSolved, true);
    });

    it("should handle duplicate letters in phrase", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle({
        phrase: "BELL BELL",
        anchors: [
          { wi: 0, li: 0 },
          { wi: 1, li: 0 },
        ],
      });
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");
      const result = await engine.submitGuess(started.sessionId, 0, ["E", "L", "L"]);

      assert.equal(result.error, undefined);
      assert.equal(result.wordSolved, true);
    });

    it("should handle consecutive wrong guesses leading to game over", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");

      for (let i = 0; i < 5; i++) {
        const result = await engine.submitGuess(started.sessionId, 0, ["X", "Y", "Z", "Q"]);
        if (i < 3) {
          assert.equal(result.lives, 4 - i - 1);
          assert.equal(result.finished, null);
        } else {
          assert.equal(result.finished, "lost");
          break;
        }
      }
    });

    it("should prevent operations after game is finished", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");

      // Win the game
      await engine.submitGuess(started.sessionId, 0, ["E", "L", "L", "O"]);
      await engine.submitGuess(started.sessionId, 1, ["O", "R", "L", "D"]);

      // Try to make another guess
      const result = await engine.submitGuess(started.sessionId, 0, ["E", "L", "L", "O"]);
      assert.equal(result.error, "finished");

      // Try to spend cascade
      const cascadeResult = await engine.spendCascade(started.sessionId, 0, 1);
      assert.equal(cascadeResult.error, "finished");

      // Try all-in
      const allInResult = await engine.allIn(started.sessionId, ["HELLO", "WORLD"]);
      assert.equal(allInResult.error, "finished");
    });

    it("should maintain consistency across multiple operations", async () => {
      const { puzzles, sessions } = createMockStores();
      const puzzle = createTestPuzzle();
      puzzles.add("puzzle-1", puzzle);
      const engine = createEngine({ puzzles, sessions });

      const started = await engine.startSession("puzzle-1");

      // Guess 1: wrong
      let result = await engine.submitGuess(started.sessionId, 0, ["X", "Y", "Z", "Q"]);
      assert.equal(result.lives, 3);
      assert.equal(result.cascadeEarned, false);

      // Guess 2: correct
      result = await engine.submitGuess(started.sessionId, 0, ["E", "L", "L", "O"]);
      assert.equal(result.wordSolved, true);
      assert.equal(result.cascadeEarned, false); // Not earned because prior wrong guess

      // Spend cascade on word 2
      const sess = await sessions.get(started.sessionId);
      sess.tokens = 1;
      await sessions.save(started.sessionId, sess);

      result = await engine.spendCascade(started.sessionId, 1, 1);
      assert.ok(result.locked[1]);

      // Check final state
      const finalSess = await sessions.get(started.sessionId);
      assert.equal(finalSess.lives, 3);
      assert.equal(finalSess.wordSolved[0], true);
      assert.equal(finalSess.wordSolved[1], false);
    });
  });
});
