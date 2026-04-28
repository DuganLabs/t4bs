/* SSR: admin (mod management). Renders the elevated-users table so
   admins see the current state without waiting for a fetch. Search +
   promote/demote happen on hydration. Admin-only — non-admins get the
   same redirect notice pattern as /moderate. */

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

  const e = ctx.elevated;
  let elevated;
  if (e === null) {
    elevated = `<div class="lb-cred">loading…</div>`;
  } else if (e.length === 0) {
    elevated = `<div class="lb-cred">none yet — search above to promote someone.</div>`;
  } else {
    elevated = e.map(u => userRow(u, ctx.currentHandle)).join("");
  }

  return `<main aria-labelledby="lb-admin-title" data-bn-view="admin"
              data-bn-current-handle="${esc(ctx.currentHandle || "")}">
    <h1 id="lb-admin-title" class="sr-only">Moderator administration</h1>
    <div class="lb-sticky lb-sticky-narrow">Moderators</div>
    <div class="lb-tagline">Promote or demote · admins only</div>
    <div class="lb-adm">
      <input class="lb-adm-search" type="search"
             placeholder="Search users by handle…"
             autocorrect="off" autocapitalize="off"
             aria-label="Search users by handle"
             data-bn-bind="adm-search" />
      <div class="lb-ferror is-hidden" data-bn-bind="adm-err"></div>
      <div data-bn-bind="adm-results"></div>
      <div data-bn-bind="adm-elevated">
        <div class="lb-adm-section">Moderators &amp; admins</div>
        ${elevated}
      </div>
    </div>
    <button class="lb-btn lb-bs lb-bs-back" type="button" data-bn-action="adm-back">← Back</button>
  </main>`;
}

/** @param {{id:string, handle:string, role:string}} u @param {string|null|undefined} self */
function userRow(u, self) {
  const buttons = [];
  if (u.role !== "moderator") {
    buttons.push(`<button class="lb-adm-btn primary" type="button"
      data-bn-action="adm-set-mod" data-user-id="${esc(u.id)}">${u.role === "admin" ? "→ MOD" : "MAKE MOD"}</button>`);
  }
  if (u.role !== "admin") {
    buttons.push(`<button class="lb-adm-btn" type="button"
      data-bn-action="adm-set-admin" data-user-id="${esc(u.id)}">MAKE ADMIN</button>`);
  }
  if (u.role !== "user") {
    buttons.push(`<button class="lb-adm-btn danger" type="button"
      data-bn-action="adm-set-user" data-user-id="${esc(u.id)}"
      data-self="${u.handle === self ? "1" : "0"}">REMOVE</button>`);
  }
  return `<div class="lb-adm-row">
    <span class="lb-adm-handle">${esc(u.handle)}</span>
    <span class="lb-adm-role ${esc(u.role)}">${esc(u.role)}</span>
    <div class="lb-adm-actions">${buttons.join("")}</div>
  </div>`;
}
