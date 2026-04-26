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

/* Compose the share-text body. The URL is NOT embedded here — it's passed
   to navigator.share separately, which is what iOS / Android use to render
   a single OG preview. Embedding the URL in text caused recipients to see
   both a text block AND a duplicated link → two OG cards. */
export function buildShareText({ session, score, won, grid }) {
  const verdict = won ? "Solved" : "Busted";
  const head = `Tabs · ${session.category} · ${score}pts · ${verdict}`;
  return `${head}\n\n${grid}`;
}

/* Mint a server-side share card record so we can return a /s/{id} URL whose
   OG meta points at /og/score/{id}.png. Falls back to a plain home URL on
   network failure so sharing never fails outright. */
export async function mintShareUrl({ session, score, won, grid }) {
  try {
    const r = await api.mintShareCard({
      sessionId: session.sessionId || session.id,
      puzzleId: session.puzzleId ?? session.id ?? null,
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

/* Native share sheet → clipboard fallback.
   - With a URL: navigator.share gets `{text, url}` — most platforms render
     a single rich card (the URL's OG meta) and append the text below.
   - Clipboard fallback writes "text\n\nurl" so the recipient gets both. */
export async function copyOrShare({ text, url }) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(url ? { text, url } : { text });
      return "shared";
    } catch { /* fall through to clipboard */ }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      const payload = url ? `${text}\n\n${url}` : text;
      await navigator.clipboard.writeText(payload);
      return "copied";
    } catch {}
  }
  return "failed";
}

/* Legacy convenience kept signature-compatible with old callers. */
export function buildShareCard({ session, locked, posFeedback, score, won }) {
  const grid = buildGrid({ session, locked, posFeedback });
  return buildShareText({ session, score, won, grid });
}
