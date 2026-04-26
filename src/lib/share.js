/* Build a wordle-style emoji grid summarizing the round + share helpers.

   Per-tile glyph reflects the player's hard-won knowledge:
     🟩 = locked correctly (or anchor)
     🟨 = ever guessed yellow at this position (in phrase, wrong spot)
     ⬛ = ever guessed absent at this position
     ⬜ = never tested
*/

import { api } from "./api.js";

const TILE = { green: "🟩", yellow: "🟨", absent: "⬛", empty: "⬜" };

/* Just the multi-line emoji grid string. Used as both the shared text body
   and as the input to the server-side OG card renderer (which parses it
   back to colored tiles). */
export function buildGrid({ session, locked, posFeedback }) {
  return session.words.map((len, wi) => {
    let row = "";
    for (let li = 0; li < len; li++) {
      const isLocked = locked[wi]?.[li] !== undefined;
      const fb = posFeedback?.[wi]?.[li];
      if (isLocked || fb === "green") row += TILE.green;
      else if (fb === "yellow")       row += TILE.yellow;
      else if (fb === "absent")       row += TILE.absent;
      else                            row += TILE.empty;
    }
    return row;
  }).join("\n");
}

/* Compose the full text-body the user shares. URL is included so OG
   crawlers (iMessage, Discord, Twitter) render the dynamic card. */
export function buildShareText({ session, score, won, grid, url }) {
  const verdict = won ? "Solved" : "Busted";
  const head = `T4BS · ${session.category} · ${score}pts · ${verdict}`;
  return `${head}\n\n${grid}\n\n${url || "t4bs.com"}`;
}

/* Mint a server-side share card record so we can return a /s/{id} URL whose
   OG meta points at /og/score/{id}.png. Falls back to a plain home URL on
   network failure so sharing never fails outright. */
export async function mintShareUrl({ session, score, won, grid }) {
  try {
    const r = await api.mintShareCard({
      sessionId: session.sessionId || session.id,
      category: session.category,
      score,
      won,
      grid,
    });
    return r.url;
  } catch {
    return "https://t4bs.com";
  }
}

/* Native share sheet → clipboard fallback. Accepts {text, url}. */
export async function copyOrShare({ text, url }) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      // Pass url separately so iOS share sheet handles it as a link.
      await navigator.share(url ? { text, url } : { text });
      return "shared";
    } catch { /* fall through to clipboard */ }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try { await navigator.clipboard.writeText(text); return "copied"; }
    catch {}
  }
  return "failed";
}

/* Legacy convenience: build text-only share (used as fallback if mint fails
   before showing share sheet). Kept signature-compatible with old callers. */
export function buildShareCard({ session, locked, posFeedback, score, won }) {
  const grid = buildGrid({ session, locked, posFeedback });
  return buildShareText({ session, score, won, grid });
}
