/* play.html — exported as a string for both worker and vite bundling.

   v2 first paint: the category, the board with the anchor letters already
   turned over (an anchor reveals its letter in every tile — see
   shared/pure.js anchorLetters), the five lives, and the par. The keyboard
   and the Solve control mount on hydration; without JavaScript the page
   still shows the puzzle and says how to play it.

   `play.board` is built server-side by functions/_shared/ssr.js from the
   same boardFor() the engine uses, so the SSR tiles and the hydrated tiles
   are the same function of the same data. */

export default `<main aria-labelledby="play-title" data-bn-view="play">
  <template @if="play">
    <header data-bn-region="play-summary">
      <h1 id="play-title">{{ play.category }}</h1>
      <p data-bn-region="play-meta">{{ play.wordsLabel }} · {{ play.totalLetters }} letters · par {{ play.par }} · by {{ play.submittedBy }}</p>
    </header>

    <section aria-label="Phrase" data-bn-region="grid">
      <template @for="row of play.board; track $index">
        <div role="group" data-bn-region="word" :aria-label="'Word ' + ($index + 1)">
          <template @for="cell of row; track $index">
            <span role="img"
                  data-bn-region="tile"
                  :data-on="cell.letter ? '' : false"
                  :data-anchor="cell.anchor ? '' : false"
                  :aria-label="cell.letter ? cell.letter + ', position ' + ($index + 1) : 'hidden, position ' + ($index + 1)">{{ cell.letter }}</span>
          </template>
        </div>
      </template>
    </section>

    <p data-bn-region="status" role="status">
      <span data-bn-region="lives" aria-label="5 of 5 lives"><i aria-hidden="true">●</i><i aria-hidden="true">●</i><i aria-hidden="true">●</i><i aria-hidden="true">●</i><i aria-hidden="true">●</i></span>
      <span data-bn-region="now">Solve now for {{ play.scoreIfSolved }} · par {{ play.par }}</span>
    </p>

    <noscript>
      <p data-bn-region="noscript-hint">Tap letters to turn them over; solve when you know it. This round needs JavaScript to play.</p>
    </noscript>

    <section data-bn-region="keyboard" data-bn-bind="play-keyboard"></section>
  </template>

  <template @else>
    <h1 id="play-title">Loading round…</h1>
    <p role="status" aria-live="polite">Picking a puzzle for you. <a href="/">Back to lobby</a> if this hangs.</p>
  </template>
</main>
`;
