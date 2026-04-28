/* SSR: how-to-play modal. Hidden by default; the hydrator toggles
   `is-hidden` based on the helpOpen signal. Body content is static so
   crawlers can index the rules even before JS runs. */

export function ssrHelpModal() {
  return `<div class="lb-ov is-hidden" data-bn-bind="help-overlay" data-bn-action="help-close">
    <div class="lb-card" role="dialog" aria-modal="true" aria-labelledby="lb-help-title"
         data-bn-action="help-card">
      <div class="lb-ct help" id="lb-help-title">HOW TO PLAY</div>
      <div class="lb-cs">One subject. One phrase. No mercy.</div>
      <div class="lb-help-body">
        <p><b>1 · Type into tiles. </b>Pick a word, type its letters into the tiles. Press Enter or tap GO.</p>
        <p><b class="green">2 · Greens lock in. </b>Letters in the right spot stay revealed across attempts. Letters known to be in the phrase pile up below.</p>
        <p><b class="yellow">3 · Stake tiles 2×. </b>Tap any tile you've typed before submitting — right pays double, wrong costs double.</p>
        <p><b class="green">4 · Cold solves earn ⚡. </b>Solve a word with no wrong attempts → tap any unrevealed tile in any unsolved word for a free letter.</p>
        <p><b class="red">5 · ALL IN. </b>Shove the whole phrase. Right = +8 × every unrevealed tile. Wrong = game over.</p>
      </div>
      <button class="lb-btn lb-bp" type="button" data-bn-action="help-ok">Got it</button>
    </div>
  </div>`;
}
