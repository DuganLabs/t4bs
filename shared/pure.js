/* Pure game logic — no I/O. Used by the engine, the SSR context, the admin
   stats and the tests.

   This is the WORD-GUESSING game (docs/PRD.md §1, docs/tuning-proposal.md):
   type letters into a word's open tiles, submit, get green / yellow / dark
   per tile. What changed from the original rules is one economy: attempts
   are per WORD (attemptsFor), not four lives for the whole phrase, and a
   stake is a score bet, not a life. Everything else is as it was. */

/* ── Attempts ─────────────────────────────────────────────────────────────
   Deliberately tighter than Wordle's six: Tabs also gives the category, the
   anchors, and every letter learned from the other words. A word that runs
   out of attempts is BUSTED — revealed, worth nothing — and the round goes
   on to the next word (tuning proposal §3.1, owner's decision 2026-09-14). */
export function attemptsFor(wordLen) {
  if (wordLen <= 3) return 3;
  if (wordLen <= 6) return 4;
  return 5;
}

/* ── Scoring ──────────────────────────────────────────────────────────────
   +5 per NEW green, −1 per wrong tile, +10 for completing a word. A staked
   tile doubles both ways: +10 right, −5 wrong. No attempt is spent for the
   stake itself (proposal §3.2). ALL IN pays 8 per tile still hidden. */
export const PER_GREEN = 5;
export const WRONG_TILE = 1;
export const STAKE_WRONG = 5;
export const WORD_BONUS = 10;
export const ALL_IN_PER_TILE = 8;

export function evalWord(guess, target) {
  const N = target.length;
  const result = new Array(N).fill("absent");
  const used   = new Array(N).fill(false);
  for (let i = 0; i < N; i++) {
    if (guess[i] === target[i]) { result[i] = "green"; used[i] = true; }
  }
  for (let i = 0; i < N; i++) {
    if (result[i] !== "absent" || !guess[i]) continue;
    for (let j = 0; j < N; j++) {
      if (!used[j] && guess[i] === target[j]) {
        result[i] = "yellow"; used[j] = true; break;
      }
    }
  }
  return result;
}

/** Score one submitted word. Locked-before tiles (anchors, earlier greens)
 *  never score again. @param {string[]} feedback @param {number[]} absoluteWagers
 *  @param {Record<number,string>} lockedBefore */
export function scoreGuess(feedback, absoluteWagers, lockedBefore) {
  let score = 0;
  feedback.forEach((status, i) => {
    if (lockedBefore[i] !== undefined) return;
    const wagered = absoluteWagers.includes(i);
    if (status === "green") score += PER_GREEN * (wagered ? 2 : 1);
    else                    score -= wagered ? STAKE_WRONG : WRONG_TILE;
  });
  return score;
}

export function openSlots(wordLen, locked) {
  const out = [];
  for (let i = 0; i < wordLen; i++) if (locked[i] === undefined) out.push(i);
  return out;
}

/** @param {string} phrase */
export function wordsOf(phrase) {
  return String(phrase).trim().toUpperCase().split(/\s+/).filter(Boolean);
}

/* Build the public, answer-free shape from a full puzzle row. */
export function publicShape(puzzle) {
  const phraseWords = wordsOf(puzzle.phrase);
  const words = phraseWords.map(w => w.length);
  const anchorReveals = (puzzle.anchors || [])
    .filter(a => phraseWords[a.wi] && phraseWords[a.wi][a.li] !== undefined)
    .map(a => ({ wi: a.wi, li: a.li, letter: phraseWords[a.wi][a.li] }));
  const totalLetters = phraseWords.join("").length;
  return {
    id: puzzle.id,
    category: puzzle.category,
    words,
    anchors: anchorReveals,
    attemptsMax: words.map(attemptsFor),
    totalLetters,
    submittedBy: puzzle.submittedBy,
    par: parFor(puzzle),
  };
}

/* Build the initial server-side session state from a puzzle. */
export function initialState(puzzle) {
  const phraseWords = wordsOf(puzzle.phrase);
  const locked = phraseWords.map((w, wi) => {
    const m = {};
    (puzzle.anchors || []).filter(a => a.wi === wi && w[a.li] !== undefined)
      .forEach(a => { m[a.li] = w[a.li]; });
    return m;
  });
  return {
    puzzleId:      puzzle.id,
    started:       Date.now(),
    attempts:      phraseWords.map(w => attemptsFor(w.length)),
    busted:        phraseWords.map(() => false),
    score:         0,
    locked,
    presentGlobal: [],
    presentByWord: phraseWords.map(() => []),
    absentByWord:  phraseWords.map(() => []),
    wordSolved:    phraseWords.map(() => false),
    tokens:        0,
    finished:      null,
    /* Every attempt in full — the board's guess history is the server's,
       so it survives a reload (proposal §3.5). */
    guessLog:      [],
  };
}

/* ── Per-word knowledge ───────────────────────────────────────────────────
   `presentByWord[wi]` is every letter the player has SEEN in word wi —
   green or yellow — and it is what the keyboard colours from, because the
   keyboard may only claim things about the word being guessed. A letter
   yellow in word 1 says nothing about word 2, and painting it yellow there
   invites the player to spend one of that word's 3–5 attempts on a letter
   that cannot be in it (owner's decision, 2026-09-15).

   `presentGlobal` survives alongside it, but it means exactly one thing:
   somewhere in the phrase. Only the letter bank and knowledgeSummary use
   it, and both label it as a phrase-level fact. */

/** Rebuild per-word presence from a session's stored guess log + locked
 *  tiles. The guess log holds every attempt in full (proposal §3.5), so a
 *  round started before `presentByWord` existed loses nothing.
 *  @param {number} wordCount @param {any[]} guessLog @param {any[]} locked */
export function presentFromGuessLog(wordCount, guessLog, locked) {
  const out = Array.from({ length: wordCount }, () => new Set());
  (guessLog || []).forEach((g) => {
    /* ALL IN rows carry wi = -1 and no per-tile feedback — nothing in them
       can be attributed to one word. */
    if (!g || !Array.isArray(g.feedback) || !Array.isArray(g.letters)) return;
    const set = out[g.wi];
    if (!set) return;
    g.feedback.forEach((st, i) => {
      if ((st === "green" || st === "yellow") && g.letters[i]) set.add(g.letters[i]);
    });
  });
  /* Anchors, earlier greens and a busted word's reveal are all letters the
     player can see sitting in that word. */
  (locked || []).forEach((lm, wi) => {
    const set = out[wi];
    if (set) Object.values(lm || {}).forEach(L => { if (L) set.add(L); });
  });
  return out.map(s => [...s]);
}

/** Bring a stored session up to the current shape, in place.

    Sessions live in D1 (`sessions.state`, a JSON blob — functions/_shared/d1.js)
    and are read back by session id, so rounds started before a shape change
    are still in flight days later. A stored session that crashes the play
    screen is a worse bug than any it fixes, so every read goes through here:
    a missing `presentByWord` is rebuilt from the guess log rather than
    defaulted to empty, and the arrays are re-sized to the word count if a
    session was ever written short.
    @template T @param {T} sess @returns {T} */
export function migrateState(sess) {
  if (!sess || typeof sess !== "object") return sess;
  const n = (sess.locked || sess.absentByWord || sess.attempts || []).length;
  const fill = (v) => Array.from({ length: n }, (_, i) => (Array.isArray(v?.[i]) ? v[i] : []));
  if (!Array.isArray(sess.presentGlobal)) sess.presentGlobal = [];
  if (!Array.isArray(sess.absentByWord) || sess.absentByWord.length !== n) {
    sess.absentByWord = fill(sess.absentByWord);
  }
  if (!Array.isArray(sess.presentByWord) || sess.presentByWord.length !== n) {
    sess.presentByWord = presentFromGuessLog(n, sess.guessLog, sess.locked);
  }
  return sess;
}

/* "Par": what a strong player scores — a clean solve. Every tile that is
   not an anchor scores 5, every word 10, no misses, no stakes. An admin can
   set a puzzle's own par to override it (admin catalogue). */
export function parFor(puzzle) {
  const own = Number(puzzle.par);
  if (Number.isFinite(own) && own > 0) return Math.round(own);
  const phraseWords = wordsOf(puzzle.phrase);
  const anchors = (puzzle.anchors || []).filter(a => phraseWords[a.wi] && phraseWords[a.wi][a.li] !== undefined).length;
  const letters = phraseWords.join("").length;
  return Math.max(0, letters - anchors) * PER_GREEN + phraseWords.length * WORD_BONUS;
}
