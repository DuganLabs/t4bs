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

/* Date-seeded deterministic selection — everyone sees the same puzzle
   for a given day. Uses a simple hash of the YYYY-MM-DD string to pick
   an index from the available puzzle list. */
export function dailySeed(date = new Date()) {
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Pick today's puzzle from a flat list of puzzles. Returns null if the list is empty. */
export function dailyPuzzle(puzzles, date = new Date()) {
  if (!puzzles || puzzles.length === 0) return null;
  const seed = dailySeed(date);
  return puzzles[seed % puzzles.length];
}

/** Pick today's category and puzzle from grouped lobby data. */
export function dailyFromGroups(groups, date = new Date()) {
  if (!groups || groups.length === 0) return null;
  const seed = dailySeed(date);
  const group = groups[seed % groups.length];
  const puzzle = group.puzzles[seed % group.puzzles.length];
  return { group, puzzle };
}

/** YYYY-MM-DD string for today (local time). Used as the persistence
 *  key so we know whether the player already finished today's daily. */
export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export const isDev = () => !!(import.meta && import.meta.env && import.meta.env.DEV);
