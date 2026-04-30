/* Single-file component: HOW TO PLAY modal. */

import { h } from "../lib/dom.js";
import { trapFocus } from "../lib/focus-trap.js";

export function createHelpModal({ open, onClose }) {
  const card = h("div", {
    "data-bn-dialog": "help",
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "bn-help-title",
    onClick: (e) => e.stopPropagation(),
  },
    h("h2", { "data-bn-dialog-title": "", "data-tone": "help", id: "bn-help-title" }, "HOW TO PLAY"),
    h("p", { "data-bn-dialog-sub": "" }, "One subject. One phrase. No mercy."),
    h("div", { "data-bn-region": "help-body" },
      h("p", null,
        h("b", null, "1 · Type into tiles. "),
        "Pick a word, type its letters into the tiles. Press Enter or tap GO."
      ),
      h("p", null,
        h("b", { "data-tone": "green" }, "2 · Greens lock in. "),
        "Letters in the right spot stay revealed across attempts. Letters known to be in the phrase pile up below."
      ),
      h("p", null,
        h("b", { "data-tone": "yellow" }, "3 · Stake tiles 2×. "),
        "Tap any tile you've typed before submitting — right pays double, wrong costs double."
      ),
      h("p", null,
        h("b", { "data-tone": "green" }, "4 · Cold solves earn ⚡. "),
        "Solve a word with no wrong attempts → tap any unrevealed tile in any unsolved word for a free letter."
      ),
      h("p", null,
        h("b", { "data-tone": "red" }, "5 · ALL IN. "),
        "Shove the whole phrase. Right = +8 × every unrevealed tile. Wrong = game over."
      ),
    ),
    h("button", { "data-bn-button": "primary", type: "button", onClick: onClose }, "Got it"),
  );

  const overlay = h("div", {
    "data-bn-overlay": "",
    onClick: onClose,
    hidden: () => !open(),
  }, card);

  trapFocus(overlay, open);

  return overlay;
}
