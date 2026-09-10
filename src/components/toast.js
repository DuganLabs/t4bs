/* Single-file component: ephemeral status toast.
   Subscribes to a `toast` signal — { text, type } — and renders an
   `aria-live` region. Auto-dismisses after 1950ms. Hosts pass through
   (the host can pass any role/id; we just attach class + role).

   Built on @basenative/components' toast queue (createToaster /
   showToast / dismissToast) for id generation + the auto-dismiss
   timer, instead of a hand-rolled setTimeout/clearTimeout dance.
   T4BS's toast is visually a single branded top-center pill with four
   bespoke tones (good/bad/great/cascade — see [data-bn-region="toast"]
   in src/styles.css), not the package's top-right stacked-card look
   (@basenative/components' [data-bn="toast-container"] / [data-bn=
   "toast"][data-variant] markup), so this deliberately does NOT adopt
   renderToastContainer()'s container/CSS — doing so would mean either
   forking that CSS or restyling T4BS's notification pattern, both out
   of scope here (see the PR description for the toast-visual-parity
   note). `message`/`variant` are plain fields on the library's toast
   object; nothing stops rendering them with T4BS's own markup + the
   existing `data-tone` attribute, which is what this file does. */

import { effect } from "@basenative/runtime";
import { createToaster, showToast, dismissToast } from "@basenative/components";
import { h } from "../lib/dom.js";

/* Matches the previous hand-rolled implementation's timing exactly.
   @basenative/components' showToast()/createToaster() both accept an
   equivalent `duration` option (ms; the per-call value wins over the
   toaster's default), so this constant plugs straight into that
   instead of a manual setTimeout. */
const TOAST_DURATION_MS = 1950;

export function createToast(toastSignal) {
  const wrap = h("div", { role: "status", "aria-live": "polite" });

  effect(() => {
    const t = toastSignal();
    if (!t) {
      wrap.replaceChildren();
      return;
    }
    const el = h("p", {
      role: "status",
      "aria-live": "polite",
      "data-bn-region": "toast",
      "data-tone": t.type || "good",
      text: t.text,
    });
    wrap.replaceChildren(el);
  });

  return wrap;
}

/* Helper to set + auto-clear the toast signal, now backed by
   @basenative/components' toast queue. Only ever one toast is shown at
   a time (matching the previous behaviour): showing a new one dismisses
   whatever's currently up first, then waits a frame before showing the
   new one — same as before — so the aria-live region sees a genuine
   null-then-value transition and re-announces + re-triggers any CSS
   entrance animation instead of silently mutating text in place. */
export function makeToaster(toastSignal) {
  const toaster = createToaster({ duration: TOAST_DURATION_MS });
  let currentId = null;

  effect(() => {
    const active = toaster.toasts();
    const last = active.length ? active[active.length - 1] : null;
    toastSignal.set(last ? { text: last.message, type: last.variant } : null);
  });

  return (text, type = "good") => {
    if (currentId != null) dismissToast(toaster, currentId);
    currentId = null;
    requestAnimationFrame(() => {
      currentId = showToast(toaster, { message: text, variant: type });
    });
  };
}
