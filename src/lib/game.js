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
export function keyStateFor(view) {
  if (!view) return {};
  const status = {};
  (view.revealed || []).forEach(L => { status[L] = "green"; });
  (view.missed || []).forEach(L => { status[L] = "absent"; });
  return status;
}

/* Non-colour cues for each tried-key state (WCAG 1.4.1): a glyph the CSS
   renders (see .bn-kb-key--<state>::after in styles.css) and an aria
   suffix. Values are unique on purpose — game.test.js checks. */
export const KEY_STATE_INFO = {
  green:  { glyph: "✓", ariaSuffix: "in the phrase, turned over" },
  absent: { glyph: "✕", ariaSuffix: "not in the phrase" },
};

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
