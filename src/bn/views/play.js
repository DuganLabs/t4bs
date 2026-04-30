/* play.html — exported as a string for both worker and vite
   bundling. Edit this file to change the template; the .js wrapper
   keeps it portable across the @basenative/server SSR worker and
   any node:test consumers.

   Structure mirrors the client view in src/views/play.js — semantic
   elements + data-bn-* attributes, no `lb-*` classes (except `.sr-only`,
   which is a util). The CSS rules in src/styles.css under
   main[data-bn-view="play"] style both sides identically. */

export default `<main aria-labelledby="play-title" data-bn-view="play">
  <template @if="play">
    <h1 id="play-title" class="sr-only">{{ play.category }}</h1>
    <output class="sr-only" role="status" aria-live="polite" aria-atomic="true"></output>

    <header data-bn-region="meta">
      <p data-bn-bind="num">#{{ play.id }} · {{ play.categoryLower }}</p>
      <p data-bn-region="category">{{ play.category }}</p>
      <p data-bn-bind="sub">{{ play.wordsLabel }} · {{ play.totalLetters }} letters · by <b>{{ play.submittedBy }}</b></p>
      <p role="status" aria-live="polite" data-bn-bind="hint"></p>
      <output role="status" aria-live="polite" data-bn-bind="cbar" hidden></output>
    </header>

    <section aria-label="Phrase grid" data-bn-region="grid">
      <ol data-bn-region="words">
        <template @for="word of play.words; track $index">
          <li data-bn-region="word" :aria-label="'Word ' + ($index + 1)" :data-word-index="$index">
            <template @for="cell of word.cells; track $index">
              <output data-bn-region="tile"
                      :data-locked="cell.anchor ? '' : false"
                      :aria-label="cell.anchor ? cell.anchor + ' at position ' + ($index + 1) + ', locked' : 'Empty at position ' + ($index + 1)">
                {{ cell.anchor }}
              </output>
            </template>
          </li>
        </template>
      </ol>
    </section>

    <aside aria-label="Letter bank" data-bn-region="bank" data-bn-bind="bank"></aside>
    <section aria-label="On-screen keyboard" data-bn-region="keyboard" data-bn-bind="keyboard"></section>
    <section aria-label="Round result" data-bn-region="result" data-bn-bind="result" hidden></section>
  </template>

  <template @else>
    <h1 id="play-title">Loading round…</h1>
    <p role="status" aria-live="polite">Picking a puzzle for you. <a href="/">Back to lobby</a> if this hangs.</p>
  </template>
</main>
`;
