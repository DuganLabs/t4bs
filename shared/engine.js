/* Game engine. Store-agnostic — takes `puzzles` and `sessions` interfaces.
   Used by the local Vite mock (in-memory stores) and Cloudflare Functions (D1 stores). */

import { evalWord, scoreGuess, openSlots, publicShape, initialState } from "./pure.js";

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Array.from({length:32}, () => Math.floor(Math.random()*16).toString(16)).join("");
}

export function createEngine({ puzzles, sessions }) {
  return {
    async listPuzzles() {
      const rows = await puzzles.listApproved();
      return rows.map(p => ({ id: p.id, category: p.category, submittedBy: p.submittedBy }));
    },

    async startSession(puzzleId) {
      const p = await puzzles.getApproved(puzzleId);
      if (!p) return { error: "puzzle-not-found" };
      const id = newId();
      const state = initialState(p);
      await sessions.create(id, state);
      return { sessionId: id, ...publicShape(p), lives: state.lives };
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

      if (allGreen) {
        sess.wordSolved[wordIndex] = true;
        scoreDelta += 10;
        const priorWrongs = sess.guessLog.filter(g => g.wi === wordIndex && !g.allGreen).length;
        if (priorWrongs === 0) { sess.tokens += 1; cascadeEarned = true; }
      } else {
        sess.lives -= 1;
        livesDelta = -1;
      }

      sess.score = Math.max(0, sess.score + scoreDelta);
      sess.guessLog.push({ wi: wordIndex, allGreen });

      const won = sess.wordSolved.every(Boolean);
      if (won) sess.finished = "won";
      else if (sess.lives <= 0) sess.finished = "lost";

      await sessions.save(sessionId, sess);

      return {
        feedback: fb,
        scoreDelta,
        livesDelta,
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

      return {
        correct,
        scoreDelta,
        score: sess.score,
        lives: sess.lives,
        finished: sess.finished,
        reveal: sess.finished ? words : null,
      };
    },
  };
}
