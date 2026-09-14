/* Pure game logic — no I/O. Shared by the Cloudflare Functions, the Vite
   mock, and the client (which uses the board/score helpers to render what
   the server already decided).

   v2 (docs/PRD.md §1, §6). One mechanic: reveal letters, solve the phrase.
   A letter is either in the phrase — every instance turns over — or it is
   not, and that costs a life. Solving is always available; wrong costs a
   life and reveals nothing. Score is what you did NOT need: ten points for
   every tile still hidden when you solve, five for each life you kept.

   Everything here is a function of (puzzle, revealed letters, lives). There
   is no per-word state, no wager, no token: the score system is the bet. */

export const LIVES = 5;
export const POINTS_PER_HIDDEN = 10;
export const POINTS_PER_LIFE = 5;

/** Uppercase, letters and single spaces only. Applied to phrases on the way
 *  in and to solve attempts, so "happily  ever after" solves "HAPPILY EVER
 *  AFTER". @param {string} s */
export function normalizePhrase(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/[^A-Z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** @param {string} phrase → ["HAPPILY","EVER","AFTER"] */
export function wordsOf(phrase) {
  return normalizePhrase(phrase).split(" ").filter(Boolean);
}

/** The letters the anchors reveal. An anchor names a position, but in a
 *  letter-reveal game a known letter is known everywhere — an H revealed at
 *  0:0 is an H on the keyboard, and guessing it again would be a repeat, not
 *  a discovery. So an anchor reveals its letter in every tile.
 *  @param {{ phrase: string, anchors: Array<{wi:number, li:number}> }} puzzle
 *  @returns {Set<string>} */
export function anchorLetters(puzzle) {
  const words = wordsOf(puzzle.phrase);
  const out = new Set();
  for (const a of puzzle.anchors || []) {
    const ch = words[a.wi]?.[a.li];
    if (ch) out.add(ch);
  }
  return out;
}

/** Tiles whose letter is not yet revealed. @param {string[]} words @param {Set<string>} revealed */
export function hiddenCount(words, revealed) {
  let n = 0;
  for (const w of words) for (const ch of w) if (!revealed.has(ch)) n++;
  return n;
}

/** The one formula. @param {number} hidden @param {number} lives */
export function scoreFor(hidden, lives) {
  return Math.max(0, hidden) * POINTS_PER_HIDDEN + Math.max(0, lives) * POINTS_PER_LIFE;
}

/** The score a strong player gets on this puzzle: solve with half the
 *  non-anchor tiles still hidden, three lives in hand. A puzzle may carry its
 *  own `par` (set in admin, §4.1); this is the default when it does not.
 *  @param {{ phrase: string, anchors: any[], par?: number|null }} puzzle */
export function parFor(puzzle) {
  const own = Number(puzzle.par);
  if (Number.isFinite(own) && own > 0) return Math.round(own);
  const words = wordsOf(puzzle.phrase);
  const hiddenAfterAnchors = hiddenCount(words, anchorLetters(puzzle));
  return Math.round(hiddenAfterAnchors / 2) * POINTS_PER_HIDDEN + 3 * POINTS_PER_LIFE;
}

/** What the client draws: per word, per tile, the letter if revealed (or the
 *  round is over) and null if still hidden.
 *  @param {string[]} words @param {Set<string>} revealed @param {boolean} [showAll] */
export function boardFor(words, revealed, showAll = false) {
  return words.map(w => [...w].map(ch => (showAll || revealed.has(ch)) ? ch : null));
}

/** The answer-free shape a round starts with. The phrase itself never leaves
 *  the server until the round is finished. @param {any} puzzle */
export function publicShape(puzzle) {
  const words = wordsOf(puzzle.phrase);
  return {
    id: puzzle.id,
    category: puzzle.category,
    words: words.map(w => w.length),
    anchors: (puzzle.anchors || [])
      .filter(a => words[a.wi]?.[a.li])
      .map(a => ({ wi: a.wi, li: a.li, letter: words[a.wi][a.li] })),
    totalLetters: words.reduce((n, w) => n + w.length, 0),
    par: parFor(puzzle),
    submittedBy: puzzle.submittedBy,
  };
}

/** Server-side session state at the start of a round. `revealed` and
 *  `missed` are arrays because the state is JSON in D1; the engine wraps
 *  them in Sets while it works. @param {any} puzzle */
export function initialState(puzzle) {
  return {
    puzzleId: puzzle.id,
    started: Date.now(),
    lives: LIVES,
    revealed: [...anchorLetters(puzzle)].sort(),
    missed: [],
    solveAttempts: 0,
    finished: null,
    score: 0,
  };
}
