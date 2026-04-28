/* SSR: admin (mod management). Uses @basenative/admin's shared user-list
   renderer for visual parity across DuganLabs apps. Renders the elevated
   users so admins see current state without waiting for a fetch. Search +
   promote/demote happen on hydration. Admin-only — non-admins get the
   same redirect notice pattern as /moderate. */

import { renderAdminUserList } from "@basenative/admin/components";
import { esc } from "../../util/escape.js";

/**
 * @param {{
 *   elevated: Array<{ id:string, handle:string, role:string }> | null,
 *   currentHandle?: string | null,
 *   forbidden?: boolean,
 * }} ctx
 */
export function ssrAdmin(ctx) {
  if (ctx.forbidden) {
    return `<main aria-labelledby="lb-admin-title" data-bn-view="admin" data-bn-forbidden="1">
      <h1 id="lb-admin-title" class="sr-only">Moderator administration</h1>
      <div class="lb-sticky lb-sticky-narrow">Moderators</div>
      <div class="lb-cred">Admin access required.</div>
      <button class="lb-btn lb-bs lb-bs-back" type="button" data-bn-action="adm-back">← Back</button>
    </main>`;
  }

  const users = ctx.elevated;
  const userList = users === null
    ? `<div class="lb-cred">loading…</div>`
    : renderAdminUserList({
        users,
        currentHandle: ctx.currentHandle || "",
        labels: {
          search: "Search users by handle…",
          currentSection: "Moderators & admins",
          resultsSection: "Search results",
          none: "none yet — search above to promote someone.",
        },
        actionHandler: "adm-set-role",
        searchHandler: "adm-search",
      });

  return `<main aria-labelledby="lb-admin-title" data-bn-view="admin"
              data-bn-current-handle="${esc(ctx.currentHandle || "")}">
    <h1 id="lb-admin-title" class="sr-only">Moderator administration</h1>
    <div class="lb-sticky lb-sticky-narrow">Moderators</div>
    <div class="lb-tagline">Promote or demote · admins only</div>
    <div class="lb-ferror is-hidden" data-bn-bind="adm-err"></div>
    <div data-bn-bind="adm-root">${userList}</div>
    <button class="lb-btn lb-bs lb-bs-back" type="button" data-bn-action="adm-back">← Back</button>
  </main>`;
}
