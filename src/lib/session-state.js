/* The round, as the client holds it.

   One source of truth: the last view the server returned (shared/engine.js
   view()). Every response from /api/session, /api/guess, /api/cascade and
   /api/allin is the whole round, so the client never derives game state —
   it stores the response and the play view draws from these signals.
   hydrate.js and main.js both used to carry their own hydrateSession() that
   rebuilt nine signals from a response; this module is the one copy. */

import { computed, signal } from "@basenative/runtime";

export function createSessionState() {
  /** The server's view of the round (words, anchors, mode…), or null. */
  const session       = signal(null);
  /** Per word: { tileIndex: letter } — anchors, greens, revealed busts. */
  const locked        = signal([]);
  /** Somewhere in the phrase. Phrase-level — the letter bank and the
   *  knowledge read-out only, never the keyboard. */
  const presentGlobal = signal([]);
  /** Per word: letters seen IN that word. What the keyboard colours from. */
  const presentByWord = signal([]);
  const absentByWord  = signal([]);
  const wordSolved    = signal([]);
  const busted        = signal([]);
  const attempts      = signal([]);
  const attemptsMax   = signal([]);
  const guessLog      = signal([]);
  const score         = signal(0);
  const tokens        = signal(0);
  /** "lobby" | "playing" | "won" | "lost". */
  const phase         = signal("lobby");
  const reveal        = signal(null);

  /* Header parity: the shell still shows lives when > 0; this game has
     attempts per word instead, so the header's lives slot stays hidden. */
  const lives = computed(() => 0);

  /** Take any server response that carries a round and make it current. */
  function apply(view) {
    if (!view || !Array.isArray(view.words)) return;
    session.set(view);
    const lm = view.words.map(() => ({}));
    (view.anchors || []).forEach(a => { if (lm[a.wi]) lm[a.wi][a.li] = a.letter; });
    (view.locked || []).forEach((m, wi) => {
      Object.entries(m || {}).forEach(([li, letter]) => { if (lm[wi]) lm[wi][Number(li)] = letter; });
    });
    locked.set(lm);
    presentGlobal.set(view.presentGlobal || []);
    /* A round started before presentByWord existed is backfilled server-side
       (shared/pure.js migrateState), but an SSR seed or a cached response
       could still arrive without it — one empty list per word keeps the play
       screen rendering rather than throwing on undefined[active]. */
    presentByWord.set(view.presentByWord || view.words.map(() => []));
    absentByWord.set(view.absentByWord || view.words.map(() => []));
    wordSolved.set(view.wordSolved || view.words.map(() => false));
    busted.set(view.busted || view.words.map(() => false));
    attempts.set(view.attempts || view.attemptsMax || []);
    attemptsMax.set(view.attemptsMax || view.attempts || []);
    guessLog.set(view.guessLog || []);
    score.set(view.score || 0);
    tokens.set(view.tokens || 0);
    reveal.set(view.reveal || null);
    phase.set(view.finished || "playing");
  }

  function clear() {
    session.set(null);
    locked.set([]); presentGlobal.set([]); presentByWord.set([]); absentByWord.set([]);
    wordSolved.set([]); busted.set([]); attempts.set([]); attemptsMax.set([]); guessLog.set([]);
    score.set(0); tokens.set(0); reveal.set(null);
    phase.set("lobby");
  }

  return {
    session, locked, presentGlobal, presentByWord, absentByWord, wordSolved, busted,
    attempts, attemptsMax, guessLog, score, tokens, lives, phase, reveal,
    apply, clear,
  };
}

/** The share grid: one row per word. 🟩 a tile you locked in (anchor or
 *  green), 🟨 known-elsewhere at the end, ⬛ a busted word's tile, ⬜ still
 *  hidden. functions/_shared/og.js parses exactly these glyphs. */
export function shareGrid({ session, locked, busted, guessLog }) {
  if (!session?.words) return "";
  const lastFeedback = new Map();
  (guessLog || []).forEach(g => { if (Array.isArray(g.feedback)) lastFeedback.set(g.wi, g.feedback); });
  return session.words.map((len, wi) => {
    let row = "";
    const fb = lastFeedback.get(wi);
    for (let li = 0; li < len; li++) {
      if (busted?.[wi]) row += "⬛";
      else if (locked?.[wi]?.[li] !== undefined) row += "🟩";
      else if (fb?.[li] === "yellow") row += "🟨";
      else row += "⬜";
    }
    return row;
  }).join("\n");
}
