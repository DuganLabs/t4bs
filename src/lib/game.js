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

/* Letter status for the on-screen keyboard.

   Owner's ruling (2026-09-10, bug report + follow-up): a letter ruled
   out while entering one word must stay fully usable — and correctly
   styled — when the player moves on to a subsequent word. The old
   implementation aggregated `absentByWord` across every word the
   player had tried (see git history / PR discussion) and marked a
   letter globally "absent" the moment it was ruled out of ONE tried
   word, even while other words remained untried and could still
   contain it. That read as (and was reported as) the key being
   disabled for later words.

   The fix scopes "absent" to the single ACTIVE word — the word the
   player is currently entering — and drops the cross-word
   aggregation entirely:
     green  — locked anywhere (unchanged: a letter whose position is
              already confirmed is unambiguously good news regardless
              of which word is active, and this was never part of the
              reported confusion).
     yellow — present somewhere in the phrase (`presentGlobal`) but
              not locked. This is the "elsewhere" state the ruling
              asked for: "not in this word but in the phrase". It was
              already computed this way and already took priority over
              "absent" — the bug was purely in the absent branch below.
     absent — ruled out specifically in the ACTIVE word. Says nothing
              about words the player hasn't tried yet, so switching to
              an untried word clears it back to "untried" instead of
              carrying a false "not here" verdict forward.
     (default/untried) — no claim either way yet.

   When there's no single active word (`active` is null — the brief
   window before the first word gets focus, or ALL-IN mode where the
   player fills every remaining word at once) we simply skip the
   absent computation: with no one word to scope it to, no absent
   claim is safe to make, and green/yellow keep working as before. */
export function computeKeyStatus({ session, active, locked, presentGlobal, absentByWord }) {
  if (!session) return {};
  const status = {};
  // Greens: any letter currently locked (anchors + green-locked from prior guesses)
  locked.forEach((lm) => {
    Object.values(lm || {}).forEach(L => { status[L] = "green"; });
  });
  // Elsewhere/present: letters known to be in the phrase but not locked yet
  presentGlobal.forEach(L => { if (status[L] !== "green") status[L] = "yellow"; });
  // Absent: ruled out in the ACTIVE word specifically — no claim about
  // words the player hasn't attempted yet.
  if (active !== null && active !== undefined) {
    (absentByWord[active] || []).forEach(L => {
      if (!status[L]) status[L] = "absent";
    });
  }
  return status;
}

/* Non-colour cues for each keyboard key state, so the four states the
   owner's ruling requires (untried / in this word / elsewhere in the
   phrase / not in this word) are distinguishable without relying on
   colour alone (WCAG 1.4.1). `glyph` is a small badge rendered via CSS
   (see .bn-kb-key--<state>::after in styles.css); `ariaSuffix` is
   appended to each key's aria-label so screen-reader users get the
   same information colour conveys visually. Every value below is
   unique on purpose — see game.test.js's "distinguishable without
   colour" check. */
export const KEY_STATE_INFO = {
  green:  { glyph: "✓", ariaSuffix: "confirmed in this word" },
  yellow: { glyph: "◆", ariaSuffix: "elsewhere in the phrase, not this word" },
  absent: { glyph: "✕", ariaSuffix: "not in this word" },
};

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
