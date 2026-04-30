/* MODERATE view — semantic mirror of src/bn/views/moderate.js (SSR).

   <main data-bn-view="moderate"> with <header>, <section data-bn-region="queue">,
   and a back-to-lobby button. The queue list itself is rendered by
   @basenative/admin's renderAdminQueueList (shared across BaseNative
   admin surfaces), so its inner markup is owned by that package; this
   file only wires the outer shell + click delegation. */

import { signal, effect } from "@basenative/runtime";
import { renderAdminQueueList } from "@basenative/admin/components";
import { h } from "../lib/dom.js";
import { bindHidden, bindText } from "../lib/bind.js";
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

  const errBox = h("p", { role: "alert", "data-bn-region": "error" });
  bindText(errBox, () => err() || "");
  bindHidden(errBox, () => !err());

  const queueRoot = h("section", {
    class: "bn-admin-queue-host",
    "aria-label": "Pending submissions",
    "data-bn-region": "queue",
    "data-bn-bind": "moderate-list",
  });
  effect(() => {
    if (err()) { queueRoot.replaceChildren(); return; }
    const items = list();
    if (items === null) {
      queueRoot.replaceChildren(
        h("p", { "data-bn-region": "status", role: "status", "aria-live": "polite" }, "loading…"),
      );
      return;
    }
    queueRoot.innerHTML = renderAdminQueueList({ items, actionHandler: "mod-decide" });
  });

  queueRoot.addEventListener("click", (e) => {
    const btn = e.target.closest('button[data-action="mod-decide"]');
    if (!btn) return;
    decide(Number(btn.dataset.id), btn.dataset.decision);
  });

  return h("main", {
    "aria-labelledby": "moderate-title",
    "data-bn-view": "moderate",
  },
    h("header", null,
      h("h1", { id: "moderate-title", class: "sr-only" }, "Moderation queue"),
      h("p", { class: "lb-sticky lb-sticky-narrow" }, "Moderation queue"),
      h("p", { class: "lb-tagline" }, "Approve or reject pending phrases"),
    ),
    errBox,
    queueRoot,
    h("button", {
      type: "button",
      "data-bn-button": "secondary",
      "data-bn-variant": "back",
      "data-bn-action": "back",
      onClick: goLobby,
    }, "← Back"),
  );
}
