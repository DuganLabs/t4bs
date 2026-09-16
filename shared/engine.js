/* Game engine. Store-agnostic — takes `puzzles` and `sessions` interfaces.
   Used by the Cloudflare Functions (D1 stores) and the tests (in-memory).

   The word-guessing game: submitGuess judges one word, spendCascade reveals
   one tile with an earned token, allIn judges the whole remaining phrase.
   Rules in shared/pure.js; the economy changes from the original are
   docs/tuning-proposal.md §3.1–3.3, decided by the owner 2026-09-14. */

import {
  evalWord, scoreGuess, openSlots, publicShape, initialState, wordsOf,
  migrateState, WORD_BONUS, ALL_IN_PER_TILE,
} from "./pure.js";

/* Session IDs are an authentication token in everything but name — anyone
   holding one can progress that round. crypto.randomUUID is available in
   every runtime t4bs targets. */
function newId() {
  return crypto.randomUUID();
}

/** The whole round as the client sees it, minus the answer. */
function view(sessionId, p, sess) {
  const phraseWords = wordsOf(p.phrase);
  return {
    sessionId,
    ...publicShape(p),
    mode: sess.mode || "free",
    day: sess.day || null,
    attempts: sess.attempts.slice(),
    busted: sess.busted.slice(),
    score: sess.score,
    tokens: sess.tokens,
    locked: sess.locked.map(m => ({ ...m })),
    presentGlobal: sess.presentGlobal.slice(),
    presentByWord: sess.presentByWord.map(a => a.slice()),
    absentByWord: sess.absentByWord.map(a => a.slice()),
    wordSolved: sess.wordSolved.slice(),
    guessLog: sess.guessLog.map(g => ({ ...g })),
    finished: sess.finished,
    reveal: sess.finished ? phraseWords : null,
  };
}

/** Record that `ch` is known to sit in word `wi`.

    Two ledgers, on purpose. `presentByWord` is what the KEYBOARD colours
    from: it may only claim things about the word being guessed, because a
    letter yellow in word 1 says nothing about word 2 and painting it yellow
    there burns one of word 2's 3-5 attempts. `presentGlobal` is the wider,
    honest fact — somewhere in this phrase — and only the letter bank and the
    knowledge read-out show it, both labelled as phrase-level. */
function markPresent(sess, wi, ch) {
  if (!ch) return;
  const row = sess.presentByWord[wi];
  if (row && !row.includes(ch)) row.push(ch);
  if (!sess.presentGlobal.includes(ch)) sess.presentGlobal.push(ch);
}

/** A word is done with when it is solved or busted. */
function resolved(sess) {
  return sess.wordSolved.every((s, i) => s || sess.busted[i]);
}

/** Bust a word: reveal every tile, it scores nothing more. */
function bust(sess, phraseWords, wi) {
  sess.busted[wi] = true;
  const w = phraseWords[wi];
  for (let li = 0; li < w.length; li++) sess.locked[wi][li] = w[li];
}

/**
 * @param {object} deps
 * @param {any} deps.puzzles
 * @param {any} deps.sessions
 * @param {(info: { sessionId: string, state: any, outcome: string }) => Promise<void> | void} [deps.onFinish]
 *   Called exactly once, after the session is persisted, when a round
 *   reaches a terminal state. The daily bookkeeping hangs off this.
 */
export function createEngine({ puzzles, sessions, onFinish }) {
  /* Every session read goes through here. Rounds are persisted as a JSON
     blob in D1 (functions/_shared/d1.js) and can be days old, so a session
     written before a shape change must still load and play — migrateState
     backfills what is missing (see shared/pure.js). */
  async function load(sessionId) {
    const sess = await sessions.get(sessionId);
    return sess ? migrateState(sess) : null;
  }

  async function finished(sessionId, sess) {
    if (!sess.finished || !onFinish) return;
    try {
      await onFinish({ sessionId, state: sess, outcome: sess.finished });
    } catch { /* recording a result must never fail the round */ }
  }

  /** Solved if every word is green; lost the moment every word is resolved
   *  and at least one was busted. Nothing ends a round early. */
  function settle(sess) {
    if (sess.wordSolved.every(Boolean)) sess.finished = "won";
    else if (resolved(sess)) sess.finished = "lost";
  }

  return {
    async listPuzzles() {
      const rows = await puzzles.listApproved();
      return rows.map(p => ({ id: p.id, category: p.category, submittedBy: p.submittedBy }));
    },

    /**
     * @param {number|string} puzzleId
     * @param {{ mode?: "daily"|"free", day?: string|null, playerKey?: string|null }} [opts]
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
      return view(id, p, state);
    },

    async resumeSession(sessionId) {
      const sess = await load(sessionId);
      if (!sess) return { error: "no-session" };
      const p = await puzzles.getApproved(sess.puzzleId);
      if (!p) return { error: "puzzle-gone" };
      return view(sessionId, p, sess);
    },

    /**
     * Judge one word. `letters` fills the word's OPEN tiles in order;
     * `wagers` are indexes into those open tiles the player staked.
     */
    async submitGuess(sessionId, wordIndex, letters, wagers = []) {
      const sess = await load(sessionId);
      if (!sess) return { error: "no-session" };
      if (sess.finished) return { error: "finished" };

      const p = await puzzles.getApproved(sess.puzzleId);
      if (!p) return { error: "puzzle-gone" };

      const phraseWords = wordsOf(p.phrase);
      const word = phraseWords[wordIndex];
      if (!word) return { error: "bad-word-index" };
      if (sess.wordSolved[wordIndex]) return { error: "word-already-solved" };
      if (sess.busted[wordIndex]) return { error: "word-busted" };

      const lockedMap = sess.locked[wordIndex];
      const slots = openSlots(word.length, lockedMap);
      if (!Array.isArray(letters) || letters.length !== slots.length) return { error: "incomplete-guess" };

      const fullGuess = word.split("").map((_, i) =>
        lockedMap[i] !== undefined ? lockedMap[i] : String(letters[slots.indexOf(i)] || "").toUpperCase()
      );

      const fb = evalWord(fullGuess, word);
      const lockedBefore = { ...lockedMap };
      const absoluteWagers = wagers.map(s => slots[s]).filter(x => x !== undefined);

      const absentSet = new Set(sess.absentByWord[wordIndex]);
      fb.forEach((status, idx) => {
        const ch = fullGuess[idx];
        if (status === "green") {
          if (lockedMap[idx] === undefined) lockedMap[idx] = ch;
          markPresent(sess, wordIndex, ch);
        } else if (status === "yellow") {
          markPresent(sess, wordIndex, ch);
        } else if (!word.includes(ch)) {
          absentSet.add(ch);
        }
      });
      sess.absentByWord[wordIndex] = [...absentSet];

      const allGreen = fb.every(s => s === "green");
      const stakeBusted = absoluteWagers.some(i => fb[i] !== "green");
      let scoreDelta = scoreGuess(fb, absoluteWagers, lockedBefore);
      let cascadeEarned = false;
      let bustedNow = false;

      if (allGreen) {
        sess.wordSolved[wordIndex] = true;
        scoreDelta += WORD_BONUS;
        const priorWrongs = sess.guessLog.filter(g => g.wi === wordIndex && !g.allGreen).length;
        if (priorWrongs === 0) { sess.tokens += 1; cascadeEarned = true; }
      } else {
        /* A miss spends one of THIS word's attempts. Out of attempts: the
           word is busted and revealed; the round carries on. */
        sess.attempts[wordIndex] = Math.max(0, sess.attempts[wordIndex] - 1);
        if (sess.attempts[wordIndex] === 0) { bust(sess, phraseWords, wordIndex); bustedNow = true; }
      }

      sess.score = Math.max(0, sess.score + scoreDelta);
      sess.guessLog.push({ wi: wordIndex, letters: fullGuess, feedback: fb, allGreen, staked: absoluteWagers });

      settle(sess);
      await sessions.save(sessionId, sess);
      await finished(sessionId, sess);

      return {
        feedback: fb,
        letters: fullGuess,
        scoreDelta,
        stakeBusted,
        cascadeEarned,
        bustedNow,
        wordIndex,
        ...view(sessionId, p, sess),
      };
    },

    async spendCascade(sessionId, wordIndex, letterIndex) {
      const sess = await load(sessionId);
      if (!sess) return { error: "no-session" };
      if (sess.finished) return { error: "finished" };
      if (sess.tokens <= 0) return { error: "no-tokens" };

      const p = await puzzles.getApproved(sess.puzzleId);
      if (!p) return { error: "puzzle-gone" };
      const phraseWords = wordsOf(p.phrase);
      const word = phraseWords[wordIndex];
      if (!word) return { error: "bad-word-index" };
      if (sess.wordSolved[wordIndex] || sess.busted[wordIndex]) return { error: "word-already-solved" };

      const lm = sess.locked[wordIndex];
      if (lm[letterIndex] !== undefined) return { error: "already-locked" };
      if (word[letterIndex] === undefined) return { error: "bad-letter-index" };

      lm[letterIndex] = word[letterIndex];
      sess.tokens -= 1;
      /* A revealed tile is a letter seen in THIS word — per-word knowledge,
         same as a green. */
      markPresent(sess, wordIndex, word[letterIndex]);

      /* A reveal can complete a word. */
      if (openSlots(word.length, lm).length === 0) {
        sess.wordSolved[wordIndex] = true;
        sess.score += WORD_BONUS;
        settle(sess);
      }

      await sessions.save(sessionId, sess);
      await finished(sessionId, sess);
      return { wordIndex, letterIndex, ...view(sessionId, p, sess) };
    },

    /** The whole remaining phrase in one shove. Right: +8 per hidden tile,
     *  Solved. Wrong: every unsolved word is busted, Finished. */
    async allIn(sessionId, wordsGuess) {
      const sess = await load(sessionId);
      if (!sess) return { error: "no-session" };
      if (sess.finished) return { error: "finished" };

      const p = await puzzles.getApproved(sess.puzzleId);
      if (!p) return { error: "puzzle-gone" };
      const words = wordsOf(p.phrase);

      if (!Array.isArray(wordsGuess) || wordsGuess.length !== words.length) return { error: "shape-mismatch" };
      for (let i = 0; i < words.length; i++) {
        if (typeof wordsGuess[i] !== "string" || wordsGuess[i].length !== words[i].length) return { error: "shape-mismatch" };
      }

      const correct = wordsGuess.every((w, i) => w.toUpperCase() === words[i]);
      let scoreDelta = 0;

      if (correct) {
        let remaining = 0;
        words.forEach((w, wi) => {
          for (let li = 0; li < w.length; li++) if (sess.locked[wi][li] === undefined) remaining++;
        });
        scoreDelta = remaining * ALL_IN_PER_TILE;
        sess.score += scoreDelta;
        /* ALL IN judges the phrase, but its feedback still belongs to one
           word at a time: every letter revealed here fell in a known word
           index, so it is recorded against that word and nowhere else. */
        words.forEach((w, wi) => {
          sess.wordSolved[wi] = true;
          for (let li = 0; li < w.length; li++) {
            sess.locked[wi][li] = w[li];
            markPresent(sess, wi, w[li]);
          }
        });
      } else {
        words.forEach((w, wi) => {
          if (!sess.wordSolved[wi] && !sess.busted[wi]) { sess.attempts[wi] = 0; bust(sess, words, wi); }
          for (let li = 0; li < w.length; li++) markPresent(sess, wi, w[li]);
        });
      }
      sess.guessLog.push({ wi: -1, allIn: true, letters: wordsGuess.map(w => w.toUpperCase()), correct, allGreen: correct });
      settle(sess);

      await sessions.save(sessionId, sess);
      await finished(sessionId, sess);
      return { correct, scoreDelta, ...view(sessionId, p, sess) };
    },
  };
}
