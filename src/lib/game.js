/* Pure helpers shared by the BaseNative views.
   Engine logic stays in shared/engine.js (server-side).
   These functions are presentation-only — they shape session state for the UI. */

import { renderAccordion } from "@basenative/components";
import { escapeAttr, escapeText } from "@basenative/runtime/shared/escape";

/* Keyboard state from the server's view of the round. v2 has exactly two
   things a key can be once tried: in the phrase, or not. Both are final —
   a letter is guessed against the whole phrase, so there is no "elsewhere"
   and no per-word scoping to get wrong. Untried keys carry no state. The
   package's class vocabulary is green/yellow/absent; v2 uses the two that
   mean what they say. */
/* ── THE WORD-GUESSING BOARD — client helpers ──────────────────────────
   Pure functions the play view derives its state from. openSlots mirrors
   shared/pure.js (the client needs it without importing the engine). */

/** Indexes of the tiles in a word that are still open (not locked). */
export function openSlots(wordLen, locked) {
  const out = [];
  for (let i = 0; i < wordLen; i++) if ((locked || {})[i] === undefined) out.push(i);
  return out;
}

/** How many tiles across the phrase are still hidden. */
export function fullCount(words, locked) {
  return words.reduce((acc, n, wi) => acc + (n - Object.keys(locked[wi] || {}).length), 0);
}

/**
 * Keyboard colours: green = locked anywhere (anchors + earlier greens),
 * yellow = known to be in the phrase but not locked yet, absent = ruled out
 * in the ACTIVE word specifically — no claim about words not yet attempted.
 */
export function computeKeyStatus({ session, active, locked, presentGlobal, absentByWord }) {
  if (!session) return {};
  const status = {};
  (locked || []).forEach((lm) => {
    Object.values(lm || {}).forEach(L => { status[L] = "green"; });
  });
  (presentGlobal || []).forEach(L => { if (status[L] !== "green") status[L] = "yellow"; });
  if (active !== null && active !== undefined) {
    ((absentByWord || [])[active] || []).forEach(L => { if (!status[L]) status[L] = "absent"; });
  }
  return status;
}

/* Non-colour cues for the keyboard states — a glyph in the corner of the
   key and a suffix for the key's accessible name. */
export const KEY_STATE_INFO = {
  green:  { glyph: "✓", ariaSuffix: "confirmed in this word" },
  yellow: { glyph: "◆", ariaSuffix: "elsewhere in the phrase, not this word" },
  absent: { glyph: "✕", ariaSuffix: "not in this word" },
};

/**
 * Everything the player has deduced, at PHRASE level, for the read-out
 * under the grid.
 */
export function knowledgeSummary({ words, locked, wordSolved, busted, presentGlobal, attempts, attemptsMax, tokens }) {
  const ws = words || [];
  const totalWords = ws.length;
  const solvedWords = (wordSolved || []).filter(Boolean).length;
  const bustedWords = (busted || []).filter(Boolean).length;
  const totalLetters = ws.reduce((a, n) => a + n, 0);
  let knownLetters = 0;
  ws.forEach((n, wi) => { knownLetters += Object.keys((locked || [])[wi] || {}).length; });
  const lockedSet = new Set();
  (locked || []).forEach(lm => Object.values(lm || {}).forEach(L => lockedSet.add(L)));
  const floating = (presentGlobal || []).filter(L => !lockedSet.has(L)).length;
  const attemptsLeft = (attempts || []).reduce((a, n) => a + n, 0);
  const attemptsTotal = (attemptsMax || []).reduce((a, n) => a + n, 0);
  let bestTarget = null;
  ws.forEach((n, wi) => {
    if ((wordSolved || [])[wi] || (busted || [])[wi]) return;
    const known = Object.keys((locked || [])[wi] || {}).length;
    if (!bestTarget || known / n > bestTarget.known / bestTarget.len) bestTarget = { wi, known, len: n };
  });
  return { totalWords, solvedWords, bustedWords, totalLetters, knownLetters, floating, attemptsLeft, attemptsTotal, tokens: tokens || 0, bestTarget };
}

/** The guesses made on one word, oldest first. @param {Array<any>} guessLog @param {number} wi */
export function historyFor(guessLog, wi) {
  return (guessLog || []).filter(g => g && g.wi === wi && Array.isArray(g.feedback));
}

/* ── THE CATALOGUE, FOR MODERATORS ───────────────────────────────────
   Every approved phrase, grouped by category, phrase showing. This is
   the list the home page used to carry as "categories" of numbered
   "rounds" — a list of things a player could not see into, on a page
   whose only job is today's puzzle. Categories don't have rounds; they
   have phrases, and the people who need to see them are the ones who
   approve them. So it lives on /moderate, behind requireModerator, and
   each row is the phrase itself with a Preview link (`/play?play=<id>`)
   that opens that one puzzle without touching the daily or a streak.

   Markup strings rather than DOM because BOTH trees consume them —
   src/bn/server/render.js interpolates the result into the SSR
   template, and src/views/moderate.js assigns it as innerHTML — which
   is what keeps the two trees identical here instead of merely
   similar. */

/**
 * Group approved puzzles by category. Stable order: alphabetical by
 * category, ascending id within one.
 * @param {{ id: number, category: string, phrase: string, submittedBy: string }[] | null} rows
 */
export function groupCatalogue(rows) {
  if (!rows) return null;
  const map = new Map();
  for (const p of rows) {
    if (!map.has(p.category)) map.set(p.category, { category: p.category, puzzles: [] });
    map.get(p.category).puzzles.push(p);
  }
  return [...map.values()]
    .map(g => ({ ...g, puzzles: [...g.puzzles].sort((a, b) => a.id - b.id) }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

/**
 * The phrases inside one category.
 * @param {{ category: string, puzzles: { id: number, phrase: string, submittedBy: string }[] }} group
 */
export function renderCataloguePhrases(group) {
  const rows = group.puzzles.map((p) =>
    `<li data-bn-region="phrase-row">`
    + `<span data-bn-cell="phrase">${escapeText(p.phrase)}</span>`
    + `<small>#${escapeText(String(p.id))} · by ${escapeText(p.submittedBy || "?")}</small>`
    + `<a href="/play?play=${escapeAttr(String(p.id))}" data-bn-action="preview" data-puzzle-id="${escapeAttr(String(p.id))}"`
    + ` aria-label="${escapeAttr(`Preview ${group.category}: ${p.phrase}. Does not count toward a streak.`)}">Preview</a>`
    + `</li>`).join("");
  return `<ul role="list" data-bn-region="phrases">${rows}</ul>`;
}

/**
 * The whole catalogue: @basenative/components' accordion, one section
 * per category. The id is pinned rather than left to the package's
 * `nextId()` counter, which would otherwise hand the server and the
 * client different values and desynchronise the `name=` grouping that
 * makes the sections mutually exclusive.
 * @param {ReturnType<typeof groupCatalogue>} groups
 */
export function renderCatalogueShelf(groups) {
  const cats = groups || [];
  return renderAccordion({
    id: "mod-catalogue",
    attrs: 'data-bn-region="catalogue"',
    items: cats.map((g) => ({
      title: `${g.category} · ${g.puzzles.length} ${g.puzzles.length === 1 ? "phrase" : "phrases"}`,
      content: renderCataloguePhrases(g),
    })),
  });
}

/* The daily puzzle used to be picked HERE, in the browser, off the
   local calendar date (`dailySeed`/`dailyPuzzle`/`dailyFromGroups`,
   removed in this change). Nothing on the server agreed with that pick,
   so players in different time zones got different "dailies" and any
   client could POST /api/session with any id and clear the catalogue in
   one sitting. Selection now lives in shared/daily.js and is resolved
   server-side (`GET /api/daily`, `POST /api/session {mode:"daily"}`);
   the client only renders what the server says today is. */

export const isDev = () => !!(import.meta && import.meta.env && import.meta.env.DEV);
