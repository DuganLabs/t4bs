/* Single-file component: ephemeral status toast.
   Subscribes to a `toast` signal — { text, type, id } — and renders an
   `aria-live` region. Auto-dismisses after 1950ms. Hosts pass through
   (the host can pass any role/id; we just attach class + role). */

import { effect } from "@basenative/runtime";
import { h } from "../lib/dom.js";

export function createToast(toastSignal) {
  const wrap = h("div", { role: "status", "aria-live": "polite" });

  effect(() => {
    const t = toastSignal();
    if (!t) {
      wrap.replaceChildren();
      return;
    }
    const el = h("div", {
      class: `lb-toast ${t.type || "good"}`,
      role: "status",
      "aria-live": "polite",
      text: t.text,
    });
    wrap.replaceChildren(el);
  });

  return wrap;
}

/* Helper to set + auto-clear the toast signal. */
export function makeToaster(toastSignal) {
  let timer = null;
  return (text, type = "good") => {
    clearTimeout(timer);
    toastSignal.set(null);
    requestAnimationFrame(() => {
      toastSignal.set({ text, type, id: Date.now() });
      timer = setTimeout(() => toastSignal.set(null), 1950);
    });
  };
}
