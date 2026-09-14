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
    <p><b>1 &middot; One category, one phrase. </b>The phrase is hidden, one row of tiles per word. A few tiles start turned over &mdash; those are your anchors, free.</p>
    <p><b>2 &middot; Type a word, press Enter. </b>Pick a word, type letters into its open tiles, press Enter or tap ENTER. Every tile comes back <b data-tone="green">green</b> (right letter, right place &mdash; it locks), <b data-tone="yellow">gold</b> (it&rsquo;s in this word, somewhere else) or dark (not in this word). Your attempts stay on the board, so you reason from the rows above.</p>
    <p><b>3 &middot; Attempts are per word. </b>Three for a short word, four for a middling one, five for a long one. A miss spends one of <em>that word&rsquo;s</em> attempts and nothing else. A word that runs out is <b data-tone="red">busted</b>: it&rsquo;s revealed, it scores nothing, and the round carries on to the rest of the phrase.</p>
    <p><b>4 &middot; Letters carry across words. </b>What you learn in one word narrows every other word: the keyboard marks letters known to be in the phrase (&#9670;), confirmed here (&check;) and ruled out of this word (&#10005;).</p>
    <p><b data-tone="yellow">5 &middot; Stake a tile. </b>Tap a tile you&rsquo;ve typed before submitting. Right pays double (+10). Wrong costs 5. No attempt is spent for the stake itself.</p>
    <p><b>6 &middot; Clean solves earn &#9889;. </b>Solve a word with no misses and you bank a reveal: tap any hidden tile in any open word for a free letter.</p>
    <p><b data-tone="red">7 &middot; ALL IN. </b>Type the whole rest of the phrase in one go. Right: +8 for every tile still hidden. Wrong: every open word is busted.</p>
    <p><b>8 &middot; Score. </b>+5 per new green, &minus;1 per wrong tile, +10 per word. Par is what a clean solve scores; beat it or don&rsquo;t. One daily puzzle per day, the same one for everyone, from 00:00 UTC &mdash; a Solved board (no busts) grows your streak. A preview from the catalogue never touches the streak.</p>
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
