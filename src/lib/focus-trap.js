/* Modal focus management. When `openSignal()` becomes true:
   - move focus to the first focusable element inside `el`
   - trap Tab inside the dialog
   - close on Escape (via `onClose` callback)
   When the signal flips back to false, focus is restored to the previously
   active element. */

import { effect } from "@basenative/runtime";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function trapFocus(el, openSignal, onClose) {
  let previouslyFocused = null;

  const onKey = (e) => {
    if (!openSignal()) return;
    if (e.key === "Escape" && onClose) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = el.querySelectorAll(FOCUSABLE);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  };

  document.addEventListener("keydown", onKey);

  effect(() => {
    if (openSignal()) {
      previouslyFocused = document.activeElement;
      // Defer focus until after the show paint.
      requestAnimationFrame(() => {
        const target = el.querySelector(FOCUSABLE);
        target?.focus();
      });
    } else if (previouslyFocused && typeof previouslyFocused.focus === "function") {
      previouslyFocused.focus();
      previouslyFocused = null;
    }
  });
}
