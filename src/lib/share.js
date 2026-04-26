/* Build a wordle-style emoji grid summarizing the round.

   Per-tile glyph reflects the player's hard-won knowledge:
     🟩 = locked correctly (or anchor)
     🟨 = ever guessed yellow at this position (in phrase, wrong spot)
     ⬛ = ever guessed absent at this position
     ⬜ = never tested
*/

const TILE = { green: "🟩", yellow: "🟨", absent: "⬛" };

export function buildShareCard({ session, locked, posFeedback, score, won }) {
  const lines = session.words.map((len, wi) => {
    let row = "";
    for (let li = 0; li < len; li++) {
      const isLocked = locked[wi]?.[li] !== undefined;
      const fb = posFeedback?.[wi]?.[li];
      if (isLocked || fb === "green") row += TILE.green;
      else if (fb === "yellow")       row += TILE.yellow;
      else if (fb === "absent")       row += TILE.absent;
      else                            row += "⬜";
    }
    return row;
  }).join("\n");

  const verdict = won ? "Solved" : "Busted";
  return `T4BS · ${session.category} · ${score}pts · ${verdict}\n\n${lines}\n\nt4bs.com`;
}

export async function copyOrShare(text) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try { await navigator.share({ text }); return "shared"; }
    catch { /* fall through to clipboard */ }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try { await navigator.clipboard.writeText(text); return "copied"; }
    catch {}
  }
  return "failed";
}
