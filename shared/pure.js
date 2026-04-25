/* Pure game logic — no I/O. Used by both the local mock and Cloudflare Functions. */

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

export function scoreGuess(feedback, absoluteWagers, lockedBefore, opts = {}) {
  const PER_GREEN = opts.perGreen ?? 5;
  const WRONG_TILE = opts.wrongTile ?? 1;
  let score = 0;
  feedback.forEach((status, i) => {
    if (lockedBefore[i] !== undefined) return;
    const wagered = absoluteWagers.includes(i);
    if (status === "green") score += PER_GREEN * (wagered ? 2 : 1);
    else                    score -= WRONG_TILE * (wagered ? 2 : 1);
  });
  return score;
}

export function openSlots(wordLen, locked) {
  const out = [];
  for (let i = 0; i < wordLen; i++) if (locked[i] === undefined) out.push(i);
  return out;
}

/* Build the public, answer-free shape from a full puzzle row. */
export function publicShape(puzzle) {
  const phraseWords = puzzle.phrase.split(" ");
  const words = phraseWords.map(w => w.length);
  const anchorReveals = puzzle.anchors.map(a => ({
    wi: a.wi, li: a.li,
    letter: phraseWords[a.wi][a.li],
  }));
  const totalLetters = puzzle.phrase.replace(/ /g, "").length;
  return {
    id: puzzle.id,
    category: puzzle.category,
    words,
    anchors: anchorReveals,
    totalLetters,
    submittedBy: puzzle.submittedBy,
  };
}

/* Build the initial server-side session state from a puzzle. */
export function initialState(puzzle, livesAllowed = 4) {
  const phraseWords = puzzle.phrase.split(" ");
  const locked = phraseWords.map((w, wi) => {
    const m = {};
    puzzle.anchors.filter(a => a.wi === wi).forEach(a => { m[a.li] = w[a.li]; });
    return m;
  });
  return {
    puzzleId:      puzzle.id,
    started:       Date.now(),
    lives:         livesAllowed,
    score:         0,
    locked,
    presentGlobal: [],
    absentByWord:  phraseWords.map(() => []),
    wordSolved:    phraseWords.map(() => false),
    tokens:        0,
    finished:      null,
    guessLog:      [],
  };
}
