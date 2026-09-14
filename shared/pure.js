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
    absentByWord:  phraseWords.map(() => []),
    wordSolved:    phraseWords.map(() => false),
    tokens:        0,
    finished:      null,
    /* Every attempt in full — the board's guess history is the server's,
       so it survives a reload (proposal §3.5). */
    guessLog:      [],
  };
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
