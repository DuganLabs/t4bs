/* Game engine, v2. Store-agnostic — takes `puzzles` and `sessions`
   interfaces. Used by the local Vite mock (in-memory stores) and the
   Cloudflare Functions (D1 stores via functions/_shared/game.js).

   Three moves: start, guess a letter, solve. See docs/PRD.md §6. The v1
   engine — per-word Wordle feedback, stakes, cascade tokens, ALL IN — is in
   git history at d1361ec; §0 of the PRD is why it is not here. */

import {
  boardFor, hiddenCount, initialState, normalizePhrase, parFor, publicShape,
  scoreFor, wordsOf,
} from "./pure.js";

/* Session IDs are an authentication token in everything but name — anyone
   holding one can progress that round — so they come from a CSPRNG.
   crypto.randomUUID exists in every runtime t4bs targets. */
function newId() {
  return crypto.randomUUID();
}

const LETTER = /^[A-Z]$/;

/**
 * @param {object} deps
 * @param {any} deps.puzzles      `listApproved()`, `getApproved(id)`
 * @param {any} deps.sessions     `create(id, state)`, `get(id)`, `save(id, state)`
 * @param {(info: { sessionId: string, state: any, outcome: string }) => Promise<void> | void} [deps.onFinish]
 *   Called exactly once, after the session is persisted, when a round
 *   reaches a terminal state. The daily bookkeeping hangs off this so the
 *   engine stays store-agnostic.
 */
export function createEngine({ puzzles, sessions, onFinish }) {
  async function finished(sessionId, sess) {
    if (!sess.finished || !onFinish) return;
    try {
      await onFinish({ sessionId, state: sess, outcome: sess.finished });
    } catch { /* recording a result must never fail the round */ }
  }

  /** Everything the client needs to draw the round as it stands. */
  function view(sessionId, p, sess) {
    const words = wordsOf(p.phrase);
    const revealed = new Set(sess.revealed);
    const over = !!sess.finished;
    const hidden = hiddenCount(words, revealed);
    return {
      sessionId,
      ...publicShape(p),
      mode: sess.mode || "free",
      day: sess.day || null,
      lives: sess.lives,
      revealed: [...revealed].sort(),
      missed: [...sess.missed].sort(),
      board: boardFor(words, revealed, over),
      hiddenCount: hidden,
      /* The number under the Solve button. */
      scoreIfSolved: over ? sess.score : scoreFor(hidden, sess.lives),
      solveAttempts: sess.solveAttempts,
      score: sess.score,
      finished: sess.finished,
      reveal: over ? words : null,
    };
  }

  async function load(sessionId) {
    const sess = await sessions.get(sessionId);
    if (!sess) return { error: "no-session" };
    const p = await puzzles.getApproved(sess.puzzleId);
    if (!p) return { error: "puzzle-gone" };
    return { sess, p };
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
      return view(id, p, state);
    },

    async resumeSession(sessionId) {
      const r = await load(sessionId);
      if (r.error) return r;
      return view(sessionId, r.p, r.sess);
    },

    /**
     * One letter. In the phrase: every instance turns over. Not: a life.
     * Already tried: a no-op that costs nothing — the keyboard should have
     * disabled it, and a double-tap must not be a double penalty.
     */
    async guessLetter(sessionId, rawLetter) {
      const letter = String(rawLetter || "").toUpperCase();
      if (!LETTER.test(letter)) return { error: "bad-letter" };

      const r = await load(sessionId);
      if (r.error) return r;
      const { sess, p } = r;
      if (sess.finished) return { error: "finished" };

      const words = wordsOf(p.phrase);
      const revealed = new Set(sess.revealed);
      const missed = new Set(sess.missed);

      if (revealed.has(letter) || missed.has(letter)) {
        return { repeat: true, hit: revealed.has(letter), letter, ...view(sessionId, p, sess) };
      }

      const positions = [];
      words.forEach((w, wi) => {
        for (let li = 0; li < w.length; li++) if (w[li] === letter) positions.push({ wi, li });
      });
      const hit = positions.length > 0;

      if (hit) {
        revealed.add(letter);
        sess.revealed = [...revealed].sort();
        /* Revealed the whole thing without solving: the round is won, and
           the score says exactly what that was worth — nothing hidden,
           only the lives kept. */
        if (hiddenCount(words, revealed) === 0) {
          sess.finished = "won";
          sess.score = scoreFor(0, sess.lives);
        }
      } else {
        missed.add(letter);
        sess.missed = [...missed].sort();
        sess.lives = Math.max(0, sess.lives - 1);
        if (sess.lives === 0) {
          sess.finished = "lost";
          sess.score = 0;
        }
      }

      await sessions.save(sessionId, sess);
      await finished(sessionId, sess);
      return { repeat: false, hit, letter, positions, ...view(sessionId, p, sess) };
    },

    /**
     * The whole phrase. Right: the round ends and scores. Wrong: a life,
     * nothing revealed, play continues — a wrong solve is an attempt, not a
     * suicide. Out of lives on a wrong solve is the same loss as any other.
     */
    async solve(sessionId, rawPhrase) {
      const attempt = normalizePhrase(rawPhrase);
      if (!attempt) return { error: "empty-solve" };

      const r = await load(sessionId);
      if (r.error) return r;
      const { sess, p } = r;
      if (sess.finished) return { error: "finished" };

      const words = wordsOf(p.phrase);
      const correct = attempt === words.join(" ");
      sess.solveAttempts += 1;

      if (correct) {
        const hidden = hiddenCount(words, new Set(sess.revealed));
        sess.score = scoreFor(hidden, sess.lives);
        sess.finished = "won";
        sess.hiddenAtSolve = hidden;
      } else {
        sess.lives = Math.max(0, sess.lives - 1);
        if (sess.lives === 0) {
          sess.finished = "lost";
          sess.score = 0;
        }
      }

      await sessions.save(sessionId, sess);
      await finished(sessionId, sess);
      return {
        correct,
        hiddenAtSolve: correct ? sess.hiddenAtSolve : null,
        par: parFor(p),
        ...view(sessionId, p, sess),
      };
    },
  };
}
