/* Build a wordle-style emoji grid summarizing the round, suitable for Twitter/etc. */

export function buildShareCard({ session, locked, score, won }) {
  const lines = session.words.map((len, wi) => {
    let row = "";
    for (let li = 0; li < len; li++) {
      const isAnchor = session.anchors.some(a => a.wi === wi && a.li === li);
      const isLocked = locked[wi]?.[li] !== undefined;
      if (isAnchor) row += "⬜";
      else if (isLocked && won) row += "🟩";
      else if (isLocked) row += "🟨";
      else row += "⬛";
    }
    return row;
  }).join("\n");

  const header = `T4BS · ${session.category}`;
  const verdict = won ? `Solved · ${score} pts` : `Busted · ${score} pts`;
  return `${header}\n${verdict}\n\n${lines}\n\nt4bs.com`;
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
