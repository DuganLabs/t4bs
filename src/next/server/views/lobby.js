/* SSR: lobby view. Renders the puzzle list grouped by category from D1.
   Hydrator wires the click → start session flow + the personal-stats row
   (which reads from localStorage and so can only render client-side). */

import { esc, join } from "../../util/escape.js";
import { groupLobby } from "../../../lib/game.js";

/**
 * @param {{ lobby: Array<{id:number, category:string, submittedBy:string}> | null,
 *           error?: string | null }} ctx
 */
export function ssrLobby(ctx) {
  const groups = groupLobby(ctx.lobby);

  const list = !groups
    ? Array.from({ length: 6 }, () =>
        `<li><div class="lb-lobby-skel" aria-hidden="true"></div></li>`
      ).join("")
    : groups.map(group => {
        const credit = group.puzzles.length === 1
          ? `by ${group.puzzles[0].submittedBy}`
          : `${group.puzzles.length} puzzles`;
        const puzzleIds = group.puzzles.map(p => p.id).join(",");
        return `<li><button type="button" class="lb-lobby-item"
          aria-label="Play ${esc(group.category)} — ${esc(credit)}"
          data-bn-action="lobby-pick"
          data-puzzle-ids="${esc(puzzleIds)}">
          <span class="lb-lobby-cat">${esc(group.category)}</span>
          <span class="lb-lobby-by">${esc(credit)}</span>
        </button></li>`;
      }).join("");

  return `<main aria-labelledby="lb-page-title" data-bn-view="lobby">
    <h1 id="lb-page-title" class="sr-only">T4BS — pick a round</h1>
    <div class="lb-sticky lb-sticky-narrow">One subject. One phrase.<br>No mercy.</div>
    <div class="lb-tagline">Pick a round</div>
    <div class="lb-stats is-hidden" aria-label="Personal stats" data-bn-bind="lobby-stats"></div>
    <div class="lb-cred lb-cred-error${join(!ctx.error && " is-hidden")}" role="alert"
         data-bn-bind="lobby-error">${esc(ctx.error ? `error: ${ctx.error}` : "")}</div>
    <ul class="lb-lobby" aria-label="Available puzzles" data-bn-bind="lobby-list">${list}</ul>
    <button class="lb-fab" type="button" aria-label="Submit a phrase"
            data-bn-action="lobby-submit">+ SUBMIT A PHRASE</button>
  </main>`;
}
