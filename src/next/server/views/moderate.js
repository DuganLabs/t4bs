/* SSR: moderation queue. We render the pending list when the request is
   made by an authenticated moderator/admin (server-side check); for
   anonymous or under-privileged callers we render a redirect notice and
   the hydrator bounces them to /. The approve/reject buttons are wired
   on hydration. */

import { esc } from "../../util/escape.js";

/**
 * @param {{
 *   pending: Array<{ id:number, category:string, phrase:string, submittedBy:string }> | null,
 *   forbidden?: boolean,
 * }} ctx
 */
export function ssrModerate(ctx) {
  if (ctx.forbidden) {
    return `<main aria-labelledby="lb-mod-title" data-bn-view="moderate" data-bn-forbidden="1">
      <h1 id="lb-mod-title" class="sr-only">Moderation queue</h1>
      <div class="lb-sticky lb-sticky-narrow">Moderation queue</div>
      <div class="lb-cred">Moderator access required.</div>
      <button class="lb-btn lb-bs lb-bs-back" type="button" data-bn-action="mod-back">← Back</button>
    </main>`;
  }

  const items = ctx.pending;
  let queue;
  if (items === null) {
    queue = `<div class="lb-cred">loading…</div>`;
  } else if (items.length === 0) {
    queue = `<div class="lb-cred">queue empty.</div>`;
  } else {
    queue = items.map(s => `<div class="lb-mod-item" data-mod-id="${esc(s.id)}">
        <div class="lb-mod-meta">
          <span class="lb-mod-cat">${esc(s.category)}</span>
          <span class="lb-mod-by">by ${esc(s.submittedBy)}</span>
        </div>
        <div class="lb-mod-phrase">${esc(s.phrase)}</div>
        <div class="lb-mod-actions">
          <button class="lb-mod-btn ok" type="button" data-bn-action="mod-approve">APPROVE</button>
          <button class="lb-mod-btn no" type="button" data-bn-action="mod-reject">REJECT</button>
        </div>
      </div>`).join("");
  }

  return `<main aria-labelledby="lb-mod-title" data-bn-view="moderate">
    <h1 id="lb-mod-title" class="sr-only">Moderation queue</h1>
    <div class="lb-sticky lb-sticky-narrow">Moderation queue</div>
    <div class="lb-tagline">Approve or reject pending phrases</div>
    <div class="lb-ferror is-hidden" data-bn-bind="mod-err"></div>
    <div class="lb-mod-list" data-bn-bind="mod-queue">${queue}</div>
    <button class="lb-btn lb-bs lb-bs-back" type="button" data-bn-action="mod-back">← Back</button>
  </main>`;
}
