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
import { api, errorMessage } from "../lib/api.js";
import { groupCatalogue, renderCatalogueShelf } from "../lib/game.js";

export function createModerate({ toaster, goHome, onPreview }) {
  const list      = signal(null);
  const catalogue = signal(null);
  const err       = signal(null);

  function load() {
    api.modPending().then(list.set).catch(e => err.set(String(e.message || e)));
    api.modCatalogue().then(catalogue.set).catch(e => err.set(String(e.message || e)));
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
    } catch (e) {
      toaster(String(e.message || e), "bad");
    }
  }

  /* @basenative/components' alert: role="alert" comes from the error
     variant, and the message goes into its escaped text slot. */
  const errAlert = bnAlert({ variant: "error" });
  const errBox = errAlert.el;
  bindText(errAlert.content, () => errorMessage(err()));
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

  /* The catalogue — same string helper the SSR template uses, so the
     repaint is byte-identical to the first paint. Preview is a real
     link (works before hydration); after it, the click starts the
     preview round in place instead of a full navigation. */
  const catalogueHost = h("div", { "data-bn-bind": "moderate-catalogue" });
  effect(() => {
    if (err()) { catalogueHost.replaceChildren(); return; }
    const rows = catalogue();
    if (rows === null) {
      catalogueHost.replaceChildren(
        h("p", { "data-bn-region": "status", role: "status", "aria-live": "polite" }, "loading…"),
      );
      return;
    }
    if (rows.length === 0) {
      catalogueHost.replaceChildren(h("p", { "data-bn-region": "status" }, "No approved phrases yet."));
      return;
    }
    catalogueHost.innerHTML = renderCatalogueShelf(groupCatalogue(rows));
  });
  catalogueHost.addEventListener("click", (e) => {
    const a = e.target.closest('a[data-bn-action="preview"]');
    if (!a) return;
    const id = Number(a.dataset.puzzleId);
    if (!Number.isFinite(id)) return;
    e.preventDefault();
    e.stopPropagation();
    onPreview(id);
  });

  const catalogueSection = h("section", {
    "aria-labelledby": "moderate-catalogue-title",
    "data-bn-region": "catalogue-section",
  },
    h("h2", { id: "moderate-catalogue-title" }, "Catalogue"),
    h("p", { "data-bn-region": "catalogue-note" },
      "Every approved phrase, by category. Preview opens one puzzle without touching the daily or anyone's streak."),
    catalogueHost,
  );

  return h("main", {
    "aria-labelledby": "moderate-title",
    "data-bn-view": "moderate",
  },
    h("header", null,
      h("h1", { id: "moderate-title", class: "sr-only" }, "Moderation"),
      h("p", { "data-bn-region": "sticky", "data-bn-variant": "narrow" }, "Moderation"),
      h("p", { "data-bn-region": "tagline" }, "Approve or reject pending phrases"),
    ),
    errBox,
    queueRoot,
    catalogueSection,
    bnButton("Play today's puzzle →", {
      variant: "secondary",
      attrs: 'data-bn-variant="leave" data-bn-action="to-home" '
        + 'aria-label="Leave moderation and play today\'s puzzle"',
      onClick: goHome,
    }),
  );
}
