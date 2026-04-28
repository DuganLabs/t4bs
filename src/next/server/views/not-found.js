/* SSR: 404. Reachable when ?next=1 is set on a path the table doesn't know. */

import { esc } from "../../util/escape.js";

/** @param {{ pathname: string }} ctx */
export function ssrNotFound(ctx) {
  return `<main aria-labelledby="lb-404-title" data-bn-view="not-found">
    <h1 id="lb-404-title" class="sr-only">Not found</h1>
    <div class="lb-sticky lb-sticky-narrow">404</div>
    <div class="lb-tagline">No page at <code>${esc(ctx.pathname)}</code>.</div>
    <button class="lb-btn lb-bp" type="button" data-bn-action="nf-home">Back to lobby</button>
  </main>`;
}
