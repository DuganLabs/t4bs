/* How-to-play — native <dialog> with <article> body. Eliminates the
   manual overlay/card div soup and gets focus management, ::backdrop
   styling, and Esc-to-close from the platform. */

import { effect } from "@basenative/runtime";
import { h } from "../lib/dom.js";

export function createHelpModal({ open, onClose }) {
  /* No `class="lb-ov"` here — that class was for the old positioned
     overlay div. <dialog> handles top-layer + backdrop natively, and
     the `.lb-ov { display: flex }` rule would force render even when
     closed. CSS targets `dialog[open]` instead. */
  const dlg = h("dialog", {
    "aria-labelledby": "help-title",
    onClose,
    onClick: (e) => { if (e.target === dlg) onClose(); },
  },
    h("article", { class: "lb-card", onClick: (e) => e.stopPropagation() },
      h("header", null,
        h("h2", { id: "help-title", class: "lb-ct help" }, "HOW TO PLAY"),
        h("p", { class: "lb-cs" }, "One subject. One phrase. No mercy."),
      ),
      h("div", { "data-bn-region": "help-body" },
        h("p", null,
          h("b", null, "1 · Type into tiles. "),
          "Pick a word, type its letters into the tiles. Press Enter or tap GO.",
        ),
        h("p", null,
          h("b", { "data-tone": "green" }, "2 · Greens lock in. "),
          "Letters in the right spot stay revealed across attempts. Letters known to be in the phrase pile up below.",
        ),
        h("p", null,
          h("b", { "data-tone": "yellow" }, "3 · Stake tiles 2×. "),
          "Tap any tile you've typed before submitting — right pays double, wrong costs double.",
        ),
        h("p", null,
          h("b", { "data-tone": "green" }, "4 · Cold solves earn ⚡. "),
          "Solve a word with no wrong attempts → tap any unrevealed tile in any unsolved word for a free letter.",
        ),
        h("p", null,
          h("b", { "data-tone": "red" }, "5 · ALL IN. "),
          "Shove the whole phrase. Right = +8 × every unrevealed tile. Wrong = game over.",
        ),
      ),
      h("button", { class: "lb-btn lb-bp", type: "button", onClick: onClose }, "Got it"),
    ),
  );

  effect(() => {
    const isOpen = open();
    if (isOpen && !dlg.open) dlg.showModal();
    else if (!isOpen && dlg.open) dlg.close();
  });

  return dlg;
}
