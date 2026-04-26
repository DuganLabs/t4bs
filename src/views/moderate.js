/* Single-file component: MODERATE view.
   Lists /api/moderate/pending submissions; approve / reject in place.
   Mirrors @basenative/admin queue patterns. */

import { signal } from "@basenative/runtime";
import { h, reactiveList } from "../lib/dom.js";
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

  const queue = h("div", { class: "lb-mod-list" });
  reactiveList(queue, () => {
    const items = list();
    if (err()) return [];
    if (items === null) return [h("div", { class: "lb-cred" }, "loading…")];
    if (items.length === 0) return [h("div", { class: "lb-cred" }, "queue empty.")];
    return items.map(s =>
      h("div", { class: "lb-mod-item" },
        h("div", { class: "lb-mod-meta" },
          h("span", { class: "lb-mod-cat" }, s.category),
          h("span", { class: "lb-mod-by" }, `by ${s.submittedBy}`),
        ),
        h("div", { class: "lb-mod-phrase" }, s.phrase),
        h("div", { class: "lb-mod-actions" },
          h("button", { class: "lb-mod-btn ok", type: "button", onClick: () => decide(s.id, "approved") }, "APPROVE"),
          h("button", { class: "lb-mod-btn no", type: "button", onClick: () => decide(s.id, "rejected") }, "REJECT"),
        ),
      ),
    );
  });

  return h("main", { "aria-labelledby": "lb-mod-title" },
    h("h1", { id: "lb-mod-title", class: "sr-only" }, "Moderation queue"),
    h("div", { class: "lb-sticky lb-sticky-narrow" }, "Moderation queue"),
    h("div", { class: "lb-tagline" }, "Approve or reject pending phrases"),
    errBox,
    queue,
    h("button", { class: "lb-btn lb-bs lb-bs-back", type: "button", onClick: goLobby }, "← Back"),
  );
}
