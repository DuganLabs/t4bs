/* Game engine. Store-agnostic — takes `puzzles` and `sessions` interfaces.
   Used by the local Vite mock (in-memory stores) and Cloudflare Functions (D1 stores). */

import { evalWord, scoreGuess, openSlots, publicShape, initialState } from "./pure.js";

/* Session IDs are an authentication token in everything but name —
   anyone holding one can call /api/guess and progress that round. They
   need to be from a CSPRNG. crypto.randomUUID is available in every
   runtime t4bs targets (Cloudflare Workers, Node ≥18, modern browsers
   for the Vite dev mock); the previous Math.random() fallback was
   dead code that CodeQL still flagged because the lexical reachability
   analysis can't prove that. Drop the fallback so the analyser stops
   tripping and so a hypothetical future runtime without crypto fails
   loudly instead of silently issuing weak IDs. */
function newId() {
  return crypto.randomUUID();
}

/**
 * @param {object} deps
 * @param {any} deps.puzzles
 * @param {any} deps.sessions
 * @param {(info: { sessionId: string, state: any, outcome: string }) => Promise<void> | void} [deps.onFinish]
 *   Called exactly once, after the session is persisted, when a round
 *   reaches a terminal state. The daily bookkeeping (one puzzle per UTC
 *   day, streaks) hangs off this instead of living in the engine, so
 *   the engine stays store-agnostic and the Vite mock and the D1
 *   Functions can wire their own recorder.
 */
export function createEngine({ puzzles, sessions, onFinish }) {
  /* Fire the terminal-state hook without letting a bookkeeping failure
     take down a round the player already finished. */
  async function finished(sessionId, sess) {
    if (!sess.finished || !onFinish) return;
    try {
      await onFinish({ sessionId, state: sess, outcome: sess.finished });
    } catch { /* recording a result must never fail the round */ }
  }

  return {
    async listPuzzles() {
      const rows = await puzzles.listApproved();
      return rows.map(p => ({ id: p.id, category: p.category, submittedBy: p.submittedBy }));
    },

    /**
     * @param {number|string} puzzleId
     * @param {{ mode?: "daily"|"free", day?: string|null, playerKey?: string|null }} [opts]
     *   `mode: "daily"` tags the session as the day's authoritative run —
     *   the only kind that records a result and moves a streak.
     */
    async startSession(puzzleId, opts = {}) {
      const p = await puzzles.getApproved(puzzleId);
      if (!p) return { error: "puzzle-not-found" };
      const id = newId();
      const state = initialState(p);
      state.mode      = opts.mode === "daily" ? "daily" : "free";
      state.day       = opts.day || null;
      state.playerKey = opts.playerKey || null;
      await sessions.create(id, state);
      return {
        sessionId: id,
        ...publicShape(p),
        lives: state.lives,
        mode: state.mode,
        day: state.day,
      };
    },

    async resumeSession(sessionId) {
      const sess = await sessions.get(sessionId);
      if (!sess) return { error: "no-session" };
      const p = await puzzles.getApproved(sess.puzzleId);
      if (!p) return { error: "puzzle-gone" };
      const phraseWords = p.phrase.split(" ");
      return {
        sessionId,
        ...publicShape(p),
        mode: sess.mode || "free",
        day: sess.day || null,
        lives: sess.lives,
        score: sess.score,
        tokens: sess.tokens,
        locked: sess.locked,
        presentGlobal: sess.presentGlobal,
        absentByWord: sess.absentByWord,
        wordSolved: sess.wordSolved,
        finished: sess.finished,
        reveal: sess.finished ? phraseWords : null,
      };
    },

    async submitGuess(sessionId, wordIndex, letters, wagers = []) {
      const sess = await sessions.get(sessionId);
      if (!sess) return { error: "no-session" };
      if (sess.finished) return { error: "finished" };

      const p = await puzzles.getApproved(sess.puzzleId);
      if (!p) return { error: "puzzle-gone" };

      const phraseWords = p.phrase.split(" ");
      const word = phraseWords[wordIndex];
      if (!word) return { error: "bad-word-index" };
      if (sess.wordSolved[wordIndex]) return { error: "word-already-solved" };

      const lockedMap = sess.locked[wordIndex];
      const slots = openSlots(word.length, lockedMap);
      if (letters.length !== slots.length) return { error: "incomplete-guess" };

      const fullGuess = word.split("").map((_, i) =>
        lockedMap[i] !== undefined ? lockedMap[i] : letters[slots.indexOf(i)]
      );

      const fb = evalWord(fullGuess, word);
      const lockedBefore = { ...lockedMap };
      const absoluteWagers = wagers.map(s => slots[s]).filter(p => p !== undefined);

      // Update locks + knowledge
      const presentSet = new Set(sess.presentGlobal);
      const absentSet  = new Set(sess.absentByWord[wordIndex]);

      fb.forEach((status, idx) => {
        const ch = fullGuess[idx];
        if (status === "green") {
          if (lockedMap[idx] === undefined) lockedMap[idx] = ch;
          presentSet.add(ch);
        } else if (status === "yellow") {
          presentSet.add(ch);
        } else if (!word.includes(ch)) {
          absentSet.add(ch);
        }
      });
      sess.presentGlobal = [...presentSet];
      sess.absentByWord[wordIndex] = [...absentSet];

      const allGreen = fb.every(s => s === "green");
      let cascadeEarned = false;
      let scoreDelta = scoreGuess(fb, absoluteWagers, lockedBefore);
      let livesDelta = 0;

      /* THE STAKE NOW HAS TEETH.
         Until now a stake only ever moved `score`, and `score` is
         floored at zero below — so a wager could not end a round, and
         once you were at zero it cost literally nothing. It was sold as
         "Vegas-style" risk and was, mechanically, a decorative score
         multiplier. A staked tile is a side bet on ONE position: right
         pays double, wrong costs a life on top of the guess's own.
         Note this can only bite on a guess that already missed — if the
         word comes back all-green, every staked tile is green by
         definition — so the decision it asks is genuinely finer-grained
         than "am I sure about the whole word": you can miss the word and
         still keep your stake if the positions you backed were right.
         Capped at one extra life per guess however many tiles are
         staked, so the worst case stays legible: −2. */
      const stakeBusted = absoluteWagers.some(i => fb[i] !== "green");

      if (allGreen) {
        sess.wordSolved[wordIndex] = true;
        scoreDelta += 10;
        const priorWrongs = sess.guessLog.filter(g => g.wi === wordIndex && !g.allGreen).length;
        if (priorWrongs === 0) { sess.tokens += 1; cascadeEarned = true; }
      } else {
        sess.lives -= 1;
        livesDelta = -1;
      }
      if (stakeBusted) {
        sess.lives -= 1;
        livesDelta -= 1;
      }
      sess.lives = Math.max(0, sess.lives);

      sess.score = Math.max(0, sess.score + scoreDelta);
      sess.guessLog.push({ wi: wordIndex, allGreen });

      const won = sess.wordSolved.every(Boolean);
      if (won) sess.finished = "won";
      else if (sess.lives <= 0) sess.finished = "lost";

      await sessions.save(sessionId, sess);
      await finished(sessionId, sess);

      return {
        feedback: fb,
        scoreDelta,
        livesDelta,
        stakeBusted,
        mode: sess.mode || "free",
        locked: { ...lockedMap },
        presentGlobal: sess.presentGlobal,
        absentByWord: sess.absentByWord[wordIndex],
        wordSolved: sess.wordSolved[wordIndex],
        cascadeEarned,
        tokens: sess.tokens,
        score: sess.score,
        lives: sess.lives,
        finished: sess.finished,
        reveal: sess.finished ? phraseWords : null,
      };
    },

    async spendCascade(sessionId, wordIndex, letterIndex) {
      const sess = await sessions.get(sessionId);
      if (!sess) return { error: "no-session" };
      if (sess.finished) return { error: "finished" };
      if (sess.tokens <= 0) return { error: "no-tokens" };

      const p = await puzzles.getApproved(sess.puzzleId);
      if (!p) return { error: "puzzle-gone" };
      const word = p.phrase.split(" ")[wordIndex];
      if (!word) return { error: "bad-word-index" };
      if (sess.wordSolved[wordIndex]) return { error: "word-already-solved" };

      const lm = sess.locked[wordIndex];
      if (lm[letterIndex] !== undefined) return { error: "already-locked" };

      lm[letterIndex] = word[letterIndex];
      sess.tokens -= 1;
      const presentSet = new Set(sess.presentGlobal);
      presentSet.add(word[letterIndex]);
      sess.presentGlobal = [...presentSet];

      await sessions.save(sessionId, sess);

      return {
        locked: { ...lm },
        tokens: sess.tokens,
        presentGlobal: sess.presentGlobal,
      };
    },

    async allIn(sessionId, wordsGuess) {
      const sess = await sessions.get(sessionId);
      if (!sess) return { error: "no-session" };
      if (sess.finished) return { error: "finished" };

      const p = await puzzles.getApproved(sess.puzzleId);
      if (!p) return { error: "puzzle-gone" };
      const words = p.phrase.split(" ");

      if (!Array.isArray(wordsGuess) || wordsGuess.length !== words.length) return { error: "shape-mismatch" };
      for (let i = 0; i < words.length; i++) {
        if (typeof wordsGuess[i] !== "string" || wordsGuess[i].length !== words[i].length) return { error: "shape-mismatch" };
      }

      const correct = wordsGuess.every((w, i) => w.toUpperCase() === words[i]);
      let scoreDelta = 0;

      if (correct) {
        const remaining = words.reduce((acc, w, wi) => {
          let unsolved = 0;
          for (let li = 0; li < w.length; li++) if (sess.locked[wi][li] === undefined) unsolved++;
          return acc + unsolved;
        }, 0);
        scoreDelta = remaining * 8;
        sess.score += scoreDelta;
        sess.wordSolved = words.map(() => true);
        words.forEach((w, wi) => {
          for (let li = 0; li < w.length; li++) sess.locked[wi][li] = w[li];
        });
        sess.finished = "won";
      } else {
        sess.lives = 0;
        sess.finished = "lost";
      }

      await sessions.save(sessionId, sess);
      await finished(sessionId, sess);

      return {
        correct,
        scoreDelta,
        score: sess.score,
        lives: sess.lives,
        mode: sess.mode || "free",
        finished: sess.finished,
        reveal: sess.finished ? words : null,
      };
    },
  };
}
