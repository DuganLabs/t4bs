/* Single-file component: ADMIN view (mod management).
   Search + promote/demote. Mirrors @basenative/admin promote patterns. */

import { signal, effect } from "@basenative/runtime";
import { h, reactiveList } from "../lib/dom.js";
import { api } from "../lib/api.js";

export function createAdmin({ currentHandle, toaster, goLobby }) {
  const elevated = signal(null);
  const q        = signal("");
  const results  = signal(null);
  const busy     = signal(null);
  const err      = signal(null);

  function loadElevated() {
    api.modUsers("").then(elevated.set).catch(e => err.set(String(e.message || e)));
  }
  loadElevated();

  // Debounced search
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
    if (u.handle === currentHandle && role !== "admin") {
      if (!window.confirm("Demote yourself? You'll lose admin access immediately.")) return;
    }
    busy.set(u.id);
    try {
      await api.modPromote(u.id, role);
      toaster(role === "user" ? "DEMOTED" : role.toUpperCase(),
              role === "user" ? "bad" : "great");
      loadElevated();
      const term = q().trim();
      if (term) api.modUsers(term).then(results.set).catch(() => {});
    } catch (e) {
      toaster(String(e.message || e), "bad");
    } finally {
      busy.set(null);
    }
  }

  function row(u) {
    const actions = h("div", { class: "lb-adm-actions" });
    if (u.role !== "moderator") {
      actions.append(h("button", {
        class: "lb-adm-btn primary",
        type: "button",
        disabled: () => busy() === u.id,
        onClick: () => setRole(u, "moderator"),
      }, u.role === "admin" ? "→ MOD" : "MAKE MOD"));
    }
    if (u.role !== "admin") {
      actions.append(h("button", {
        class: "lb-adm-btn",
        type: "button",
        disabled: () => busy() === u.id,
        onClick: () => setRole(u, "admin"),
      }, "MAKE ADMIN"));
    }
    if (u.role !== "user") {
      actions.append(h("button", {
        class: "lb-adm-btn danger",
        type: "button",
        disabled: () => busy() === u.id,
        onClick: () => setRole(u, "user"),
      }, "REMOVE"));
    }
    return h("div", { class: "lb-adm-row" },
      h("span", { class: "lb-adm-handle" }, u.handle),
      h("span", { class: `lb-adm-role ${u.role}` }, u.role),
      actions,
    );
  }

  const search = h("input", {
    class: "lb-adm-search",
    type: "search",
    placeholder: "Search users by handle…",
    autocorrect: "off",
    autocapitalize: "off",
    "aria-label": "Search users by handle",
    onInput: (e) => q.set(e.target.value),
  });

  const errBox = h("div", { class: "lb-ferror", text: () => err() || "", hidden: () => !err() });

  const resultsSection = h("div");
  reactiveList(resultsSection, () => {
    const r = results();
    if (!r) return [];
    return [
      h("div", { class: "lb-adm-section" }, "Search results"),
      ...(r.length === 0
        ? [h("div", { class: "lb-cred" }, "no matches.")]
        : r.map(row)),
    ];
  });

  const elevatedSection = h("div");
  reactiveList(elevatedSection, () => {
    const e = elevated();
    const heading = results() ? "Current moderators & admins" : "Moderators & admins";
    if (e === null) {
      return [h("div", { class: "lb-adm-section" }, heading), h("div", { class: "lb-cred" }, "loading…")];
    }
    if (e.length === 0) {
      return [h("div", { class: "lb-adm-section" }, heading),
              h("div", { class: "lb-cred" }, "none yet — search above to promote someone.")];
    }
    return [h("div", { class: "lb-adm-section" }, heading), ...e.map(row)];
  });

  return h("main", { "aria-labelledby": "lb-admin-title" },
    h("h1", { id: "lb-admin-title", class: "sr-only" }, "Moderator administration"),
    h("div", { class: "lb-sticky lb-sticky-narrow" }, "Moderators"),
    h("div", { class: "lb-tagline" }, "Promote or demote · admins only"),
    h("div", { class: "lb-adm" },
      search,
      errBox,
      resultsSection,
      elevatedSection,
    ),
    h("button", { class: "lb-btn lb-bs lb-bs-back", type: "button", onClick: goLobby }, "← Back"),
  );
}
