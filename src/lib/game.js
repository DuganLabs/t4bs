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

/* ── FREE-PLAY BROWSE SHELF ──────────────────────────────────────────
   The lobby used to print ONE row per category, labelled with whatever
   `groupLobby` collapsed into it — "BY HOUSE" for a single-puzzle
   category, "2 PUZZLES" for Movie Quotes — and clicking it started a
   deterministic pick. So the rounds inside a category were unreachable
   and, worse, invisible: there was no way to tell from the lobby that
   Movie Quotes had two of them or what either one was.

   The owner's ask, clarified twice, was to "see games from other
   categories than today's puzzle on this specific screen". So each
   category is now a collapsible section listing every round it holds,
   and every round is individually startable.

   The daily is untouched and stays fixed: it is server-picked per UTC
   day, recorded once, and that is the only thing that makes the streak
   mean anything. Browsing is a free-play affordance only.

   These helpers return markup strings rather than DOM because BOTH
   trees consume them — src/bn/server/render.js interpolates the result
   into the SSR template, and src/views/lobby.js assigns it as
   innerHTML — which is what keeps the two trees identical here instead
   of merely similar. The `tag` split is the one deliberate difference
   and it is the project's established pattern: SSR emits real
   <a href="/play?play={id}"> so the shelf works with JavaScript off,
   and the hydrated SPA emits <button> because a client-side navigation
   to /play?play=… never re-runs the boot resolver that reads the query
   string. */

/**
 * Shape each category group into the rounds the browse shelf lists.
 * Rounds are sorted by puzzle id so the server and the client number
 * them identically.
 *
 * @param {{ category: string, puzzles: { id: number, submittedBy: string }[] }[] | null} groups
 */
export function browseCategories(groups) {
  if (!groups) return null;
  return groups.map((group) => {
    const sorted = [...group.puzzles].sort((a, b) => a.id - b.id);
    return {
      category: group.category,
      count: sorted.length,
      /* Summary line. @basenative/components escapes the accordion
         title as text, so the count rides in the same string rather
         than in its own element. */
      title: `${group.category} · ${sorted.length} ${sorted.length === 1 ? "round" : "rounds"}`,
      rounds: sorted.map((p, i) => ({
        id: p.id,
        label: `Round ${i + 1}`,
        credit: `by ${p.submittedBy}`,
        playHref: `/play?play=${p.id}`,
        ariaLabel: `Free play: ${group.category}, round ${i + 1}, by ${p.submittedBy}`
          + ". Practice — does not count toward your streak.",
      })),
    };
  });
}

/**
 * The rounds inside one category, as a list of start controls.
 *
 * @param {{ rounds: { id: number, label: string, credit: string, playHref: string, ariaLabel: string }[] }} cat
 * @param {"a"|"button"} tag
 */
export function renderBrowseRounds(cat, tag) {
  const rows = cat.rounds.map((r) => {
    const specific = tag === "a"
      ? `href="${escapeAttr(r.playHref)}"`
      : `type="button"`;
    return `<li><${tag} ${specific}`
      + ` data-bn-action="lobby-pick"`
      + ` data-puzzle-id="${escapeAttr(String(r.id))}"`
      + ` aria-label="${escapeAttr(r.ariaLabel)}">`
      + `<strong>${escapeText(r.label)}</strong>`
      + `<small>${escapeText(r.credit)}</small>`
      + `</${tag}></li>`;
  }).join("");
  return `<ul role="list" data-bn-region="rounds">${rows}</ul>`;
}

/**
 * The whole shelf: @basenative/components' accordion, one section per
 * category. The id is pinned rather than left to the package's
 * `nextId()` counter, which would otherwise hand the server and the
 * client different values and desynchronise the `name=` grouping that
 * makes the sections mutually exclusive.
 *
 * @param {{ category: string, puzzles: { id: number, submittedBy: string }[] }[] | null} groups
 * @param {"a"|"button"} tag
 */
export function renderBrowseShelf(groups, tag) {
  const cats = browseCategories(groups) || [];
  return renderAccordion({
    id: "lobby-browse",
    attrs: 'data-bn-region="browse"',
    items: cats.map((cat) => ({
      title: cat.title,
      content: renderBrowseRounds(cat, tag),
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
