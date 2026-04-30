/* MODERATE view. Lists /api/moderate/pending submissions; approve / reject
   in place. Uses @basenative/admin's shared queue renderer so the markup
   matches the SSR first paint (and PendingBusiness once it migrates). */

import { signal, effect } from "@basenative/runtime";
import { renderAdminQueueList } from "@basenative/admin/components";
import { h } from "../lib/dom.js";
import { api } from "../lib/api.js";

export function createModerate({ toaster, onLobbyChange, goLobby }) {
  const list = signal(null);
  const err  = signal(null);

  function load() {
    api.modPending().then(list.set).catch(e => err.set(String(e.message || e)));
  }
  load();

  async function decide(id, status) {
    try {
      await api.modDecide(id, status);
      toaster(status === "approved" ? "APPROVED" : "REJECTED",
              status === "approved" ? "great" : "bad");
      load();
      onLobbyChange?.();
    } catch (e) {
      toaster(String(e.message || e), "bad");
    }
  }

  const errBox = h("div", { class: "lb-ferror", text: () => err() || "", hidden: () => !err() });

  const queueRoot = h("div");
  effect(() => {
    const items = list();
    if (err()) { queueRoot.innerHTML = ""; return; }
    if (items === null) {
      queueRoot.innerHTML = `<p data-bn-dialog-credit>loading…</p>`;
      return;
    }
    queueRoot.innerHTML = renderAdminQueueList({ items, actionHandler: "mod-decide" });
  });

  queueRoot.addEventListener("click", (e) => {
    const btn = e.target.closest('button[data-action="mod-decide"]');
    if (!btn) return;
    decide(Number(btn.dataset.id), btn.dataset.decision);
  });

  return h("main", { "aria-labelledby": "lb-mod-title" },
    h("h1", { id: "lb-mod-title", class: "sr-only" }, "Moderation queue"),
    h("div", { class: "lb-sticky lb-sticky-narrow" }, "Moderation queue"),
    h("div", { class: "lb-tagline" }, "Approve or reject pending phrases"),
    errBox,
    queueRoot,
    h("button", { "data-bn-button": "secondary", "data-bn-back": "", type: "button", onClick: goLobby }, "← Back"),
  );
}
