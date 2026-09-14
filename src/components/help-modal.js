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
    <p><b>1 &middot; One category, one phrase. </b>The phrase is hidden, word by word. A few letters start turned over &mdash; those are your anchors, and an anchor letter shows wherever it appears.</p>
    <p><b data-tone="green">2 &middot; Tap a letter. </b>If it's in the phrase, every one of it turns over, for free. If it isn't, the key goes dark and you lose <b data-tone="red">one of five lives</b>. Green key (&check;) = in the phrase, turned over. Dark key (&#10005;) = not in the phrase. A tried key is final &mdash; nothing to re-guess.</p>
    <p><b data-tone="yellow">3 &middot; Solve when you know it. </b>Tap SOLVE and type the whole phrase. Right ends the round. Wrong costs one life and reveals nothing &mdash; a wrong solve is an attempt, not the end.</p>
    <p><b data-tone="yellow">4 &middot; The score is the bet. </b>Every letter still hidden when you solve is worth <b data-tone="yellow">10</b>; every life you kept is worth 5. Turn over another letter and the number under SOLVE drops by ten a tile. That number is the whole decision.</p>
    <p><b>5 &middot; Par. </b>Every puzzle has a par &mdash; what a strong player scores on it. Beat it or don't; the daily shows where everyone else landed.</p>
    <p><b data-tone="red">6 &middot; Out of lives </b>and the phrase is shown, for nothing. Turn every letter over without solving and you score only the lives you kept.</p>
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
