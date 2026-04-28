/* ADMIN view (mod management). Search + promote/demote. Uses
   @basenative/admin's shared user-list renderer so the markup matches
   the SSR first paint (and PendingBusiness once it migrates). */

import { signal, effect } from "@basenative/runtime";
import { renderAdminUserList } from "@basenative/admin/components";
import { h } from "../lib/dom.js";
import { api } from "../lib/api.js";

const LABELS = {
  search: "Search users by handle…",
  currentSection: "Moderators & admins",
  resultsSection: "Search results",
  none: "none yet — search above to promote someone.",
};

export function createAdmin({ currentHandle, toaster, goLobby }) {
  const elevated = signal(null);
  const q        = signal("");
  const results  = signal(null);
  const err      = signal(null);

  function loadElevated() {
    api.modUsers("").then(elevated.set).catch(e => err.set(String(e.message || e)));
  }
  loadElevated();

  let timer = null;
  effect(() => {
    const term = q().trim();
    if (timer) clearTimeout(timer);
    if (!term) { results.set(null); return; }
    timer = setTimeout(() => {
      api.modUsers(term).then(results.set).catch(e => err.set(String(e.message || e)));
    }, 200);
  });

  async function setRole(u, role) {
    if (u.handle === currentHandle && role === "user") {
      if (!window.confirm("Demote yourself? You'll lose admin access immediately.")) return;
    }
    try {
      await api.modPromote(u.id, role);
      toaster(role === "user" ? "DEMOTED" : role.toUpperCase(),
              role === "user" ? "bad" : "great");
      loadElevated();
      const term = q().trim();
      if (term) api.modUsers(term).then(results.set).catch(() => {});
    } catch (e) {
      toaster(String(e.message || e), "bad");
    }
  }

  const errBox = h("div", { class: "lb-ferror", text: () => err() || "", hidden: () => !err() });

  const root = h("div");
  effect(() => {
    const r = results();
    const u = elevated();
    if (u === null) {
      root.innerHTML = `<div class="lb-cred">loading…</div>`;
      return;
    }
    root.innerHTML = renderAdminUserList({
      users: u,
      results: r,
      query: q(),
      currentHandle: currentHandle || "",
      labels: LABELS,
      actionHandler: "adm-set-role",
      searchHandler: "adm-search",
    });
  });

  root.addEventListener("input", (e) => {
    const input = e.target.closest('input[data-action="adm-search"]');
    if (!input) return;
    q.set(input.value);
  });

  root.addEventListener("click", (e) => {
    const btn = e.target.closest('button[data-action="adm-set-role"]');
    if (!btn) return;
    const userId = btn.dataset.userId;
    const handle = btn.dataset.handle;
    const role = btn.dataset.role;
    const all = [...(elevated() || []), ...(results() || [])];
    const user = all.find(x => x.id === userId) || { id: userId, handle, role: "" };
    setRole(user, role);
  });

  return h("main", { "aria-labelledby": "lb-admin-title" },
    h("h1", { id: "lb-admin-title", class: "sr-only" }, "Moderator administration"),
    h("div", { class: "lb-sticky lb-sticky-narrow" }, "Moderators"),
    h("div", { class: "lb-tagline" }, "Promote or demote · admins only"),
    errBox,
    root,
    h("button", { class: "lb-btn lb-bs lb-bs-back", type: "button", onClick: goLobby }, "← Back"),
  );
}
