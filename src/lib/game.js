/* Pure helpers shared by the BaseNative views.
   Engine logic stays in shared/engine.js (server-side).
   These functions are presentation-only — they shape session state for the UI. */

export function openSlots(wordLen, locked) {
  const out = [];
  for (let i = 0; i < wordLen; i++) {
    if (locked[i] === undefined) out.push(i);
  }
  return out;
}

export function fullCount(words, locked) {
  return words.reduce(
    (acc, n, wi) => acc + (n - Object.keys(locked[wi] || {}).length),
    0
  );
}

/* Letter status for the on-screen keyboard (cross-phrase intel) */
export function computeKeyStatus({ session, locked, presentGlobal, absentByWord }) {
  if (!session) return {};
  const status = {};
  // Greens: any letter currently locked (anchors + green-locked from prior guesses)
  locked.forEach((lm) => {
    Object.values(lm || {}).forEach(L => { status[L] = "green"; });
  });
  // Present: letters known to be in the phrase but not locked yet
  presentGlobal.forEach(L => { if (status[L] !== "green") status[L] = "yellow"; });
  // Absent: letters ruled out in EVERY word the player has tried
  const triedSets = absentByWord.map(s => new Set(s || []));
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(L => {
    if (status[L]) return;
    const triedWordCount = triedSets.filter(s => s.size > 0).length;
    if (triedWordCount === 0) return;
    const allRuledOut = triedSets.every(s => s.size === 0 || s.has(L));
    if (allRuledOut) status[L] = "absent";
  });
  return status;
}

/* Group lobby puzzles by category — multiple submissions for the same subject
   collapse into a single card. Stable order: alphabetical by category. */
export function groupLobby(lobby) {
  if (!lobby) return null;
  const map = new Map();
  for (const p of lobby) {
    const key = p.category;
    if (!map.has(key)) map.set(key, { category: p.category, puzzles: [] });
    map.get(key).puzzles.push(p);
  }
  return [...map.values()].sort((a, b) => a.category.localeCompare(b.category));
}

export const isDev = () => !!(import.meta && import.meta.env && import.meta.env.DEV);
