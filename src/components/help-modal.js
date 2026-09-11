/* How-to-play — native <dialog> from @basenative/components'
   renderDialog(), holding a renderCard() <article> for the card chrome
   and a renderButton() for the close action. The title accent still
   comes from [data-bn-region="title"][data-tone="help"] and the body
   from [data-bn-region="help-body"] — T4BS's own attribute-driven CSS,
   passed to renderCard()'s `body` slot as-is (not renderDialog()'s
   `title`/`footer` slots) so the layout doesn't shift: this dialog has
   no dynamic content, so there's nothing signal-driven to lose by
   building the whole thing as one string. */

import { effect } from "@basenative/runtime";
import { renderButton, renderCard, renderDialog } from "@basenative/components";
import { fromHTML } from "../lib/dom.js";

const HELP_CONTENT = `
  <!-- Plain <div>, not <header>: a <header> not nested inside an
       article/aside/main/nav/section computes as a top-level "banner"
       landmark (axe landmark-banner-is-top-level) even while sitting
       inside an open dialog. -->
  <div>
    <h2 id="help-title" data-bn-region="title" data-tone="help">HOW TO PLAY</h2>
    <p data-bn-region="subtitle">One subject. One phrase. No mercy.</p>
  </div>
  <div data-bn-region="help-body">
    <p><b data-tone="red">1 &middot; Four lives. One phrase. </b>That's <b data-tone="red">four for the whole phrase</b>, not four per word — every word draws from the same pool. Any word you submit that isn't <em>fully</em> correct costs one, no matter which word it was or how close you got. Run out and the round is over.</p>
    <p><b>2 &middot; Type into tiles. </b>Pick a word, type its letters into the tiles. Press Enter or tap GO. A few letters start revealed — those are your anchors, free.</p>
    <p><b data-tone="green">3 &middot; Greens lock in. </b>Letters in the right spot stay revealed across attempts, and across words: what you learn in one word narrows every other word. The panel under the grid tracks where you stand.</p>
    <p><b data-tone="yellow">4 &middot; Read the keyboard. </b>Green key (&check;) = confirmed in this word. Gold key (&#9670;) = it's elsewhere in the phrase, not this word — still worth trying here. Dark key (&#10005;) = not in this word. Each state has its own mark as well as its own colour, and nothing is ever locked out for the next word.</p>
    <p><b data-tone="yellow">5 &middot; Stake a tile &mdash; a real bet. </b>Tap a tile you've typed before submitting. Right pays <b data-tone="yellow">double</b> points; if <em>any</em> staked letter comes back wrong it costs <b data-tone="red">one extra life</b> on top of the miss. Stake only the positions you'd bet the round on.</p>
    <p><b data-tone="green">6 &middot; Cold solves earn ⚡. </b>Solve a word with no wrong attempts → tap any unrevealed tile in any unsolved word for a free letter.</p>
    <p><b data-tone="red">7 &middot; ALL IN. </b>Shove the whole phrase. Right = +8 × every unrevealed tile. Wrong = game over.</p>
    <p><b>8 &middot; Daily vs free play. </b>One daily puzzle per day, the same one for everyone, from 00:00 UTC — solve it to grow your streak. Free play is unlimited practice and never touches the streak.</p>
  </div>
  ${renderButton("Got it", { variant: "primary", attrs: 'data-bn-action="help-close"' })}
`;

/**
 * The help dialog's full markup as a plain string — no signals, no DOM,
 * so it's testable on its own (renderDialog is a pure string renderer).
 * Exported so tests can assert on it without a document.
 */
export function helpDialogHtml() {
  return renderDialog({
    id: "help-dialog",
    modal: true,
    closable: false,
    content: renderCard({ body: HELP_CONTENT }),
  });
}

export function createHelpModal({ open, onClose }) {
  const dlg = /** @type {HTMLDialogElement} */ (fromHTML(helpDialogHtml()));
  /* renderDialog() emits aria-labelledby only for its own `title`
     slot; this dialog keeps its title inside the card (see above), so
     the label is pointed at that h2 here. */
  dlg.setAttribute("aria-labelledby", "help-title");
  dlg.addEventListener("close", onClose);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) onClose(); });
  dlg.querySelector('[data-bn-action="help-close"]').addEventListener("click", onClose);

  effect(() => {
    const isOpen = open();
    // Guard `isConnected` — see the matching comment in auth-modal.js.
    if (isOpen && !dlg.open && dlg.isConnected) dlg.showModal();
    else if (!isOpen && dlg.open) dlg.close();
  });

  return dlg;
}
