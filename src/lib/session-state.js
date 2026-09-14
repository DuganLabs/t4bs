/* The round, as the client holds it.

   v2 has one source of truth on the client: the last view the server
   returned. Every response from /api/session, /api/letter and /api/solve is
   the whole board (shared/engine.js's view()), so the client never derives
   game state — it stores the response and draws it. hydrate.js and main.js
   both used to carry a hydrateSession() that rebuilt nine signals from a
   response; that code lived twice and drifted twice. This module is the one
   copy, and it is what createPlay() takes. */

import { computed, signal } from "@basenative/runtime";

export function createSessionState() {
  /** The server's view of the round, or null between rounds. */
  const session = signal(null);
  /** "lobby" | "playing" | "won" | "lost" — what the shell should show. */
  const phase = signal("lobby");

  const score = computed(() => session()?.score ?? 0);
  const lives = computed(() => session()?.lives ?? 0);
  /* Header parity: the SSR header still has a tokens slot; v2 has no
     tokens, so it stays hidden by reading 0. Removed with the header
     cleanup in delivery step 5. */
  const tokens = computed(() => 0);

  /** Take any server response that carries a board and make it current. */
  function apply(view) {
    if (!view || !Array.isArray(view.board)) return;
    session.set(view);
    phase.set(view.finished || "playing");
  }

  function clear() {
    session.set(null);
    phase.set("lobby");
  }

  return { session, phase, score, lives, tokens, apply, clear };
}

/** The share grid: one row per word, 🟩 for a tile that was revealed when
 *  the round ended, ⬜ for one still hidden — the hidden ones are the brag.
 *  functions/_shared/og.js parses exactly these two glyphs (plus the v1
 *  pair, which v2 never emits). @param {any} view */
export function shareGrid(view) {
  if (!view?.board) return "";
  const hidden = new Set();
  /* `reveal` is the phrase once finished; the board is fully shown by then,
     so "hidden at the end" has to come from what the player had revealed.
     `revealed` is the letter set, which is exactly that. */
  const revealed = new Set(view.revealed || []);
  return view.board.map((row, wi) => row.map((ch, li) => {
    const letter = view.reveal?.[wi]?.[li] ?? ch;
    if (letter && revealed.has(letter)) return "🟩";
    hidden.add(`${wi}:${li}`);
    return "⬜";
  }).join("")).join("\n");
}
