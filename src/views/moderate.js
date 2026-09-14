/* MODERATE view — semantic mirror of src/bn/views/moderate.js (SSR).

   <main data-bn-view="moderate"> with <header>, <section data-bn-region="queue">,
   and a back-to-lobby button. The queue list itself is rendered by
   @basenative/admin's renderAdminQueueList (shared across BaseNative
   admin surfaces), so its inner markup is owned by that package; this
   file only wires the outer shell + click delegation. */

import { signal, effect } from "@basenative/runtime";
import { renderAdminQueueList } from "@basenative/admin/components";
import { bnAlert, bnButton, h } from "../lib/dom.js";
import { bindHidden, bindText } from "../lib/bind.js";
import { api } from "../lib/api.js";

export function createModerate({ toaster, onLobbyChange, goLobby }) {
  const list = signal(null);
  const err  = signal(null);

  function load() {
    api.modPending().then(list.set).catch(e => err.set(String(e.message || e)));
  }
  load();

  /* Reject asks first, and asks why (T4-021). It used to commit on the
     first tap, ten pixels from Approve on a phone, with nothing recorded
     and the row gone from every list. The reason is stored on the row and
     shown in the admin queue's decided list. */
  async function decide(id, status) {
    let reason = "";
    if (status === "rejected") {
      reason = (window.prompt("Reject this phrase? Say why — the submitter sees this in the decided list.", "") || "").trim();
      if (!reason) { toaster("NOT REJECTED — no reason given", "bad"); return; }
    }
    try {
      await api.modDecide(id, status, reason);
      toaster(status === "approved" ? "APPROVED" : "REJECTED",
              status === "approved" ? "great" : "bad");
      load();
      onLobbyChange?.();
    } catch (e) {
      toaster(String(e.message || e), "bad");
    }
  }

  /* @basenative/components' alert: role="alert" comes from the error
     variant, and the message goes into its escaped text slot. */
  const errAlert = bnAlert({ variant: "error" });
  const errBox = errAlert.el;
  bindText(errAlert.content, () => err() || "");
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
      h("p", { "data-bn-region": "sticky", "data-bn-variant": "narrow" }, "Moderation queue"),
      h("p", { "data-bn-region": "tagline" }, "Approve or reject pending phrases"),
    ),
    errBox,
    queueRoot,
    /* Not a back action — it goes to the lobby, which is where APPROVED
       puzzles live, and it goes there regardless of how the moderator
       reached the queue. The old "← Back" label promised history
       navigation and delivered a different view; this names the
       destination and points forward. */
    bnButton("Go to the puzzle lobby →", {
      variant: "secondary",
      attrs: 'data-bn-variant="leave" data-bn-action="to-lobby" '
        + 'aria-label="Leave the moderation queue and go to the puzzle lobby, where approved puzzles are listed"',
      onClick: goLobby,
    }),
  );
}
