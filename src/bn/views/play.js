/* play.html — exported as a string for both worker and vite
   bundling. Edit this file to change the template; the .js wrapper
   keeps it portable across the @basenative/server SSR worker and
   any node:test consumers. */

export default `<main aria-labelledby="play-title" data-bn-view="play">
  <template @if="play">
    <header data-bn-region="play-summary">
      <h1 id="play-title">{{ play.category }}</h1>
      <p>
        <small>#{{ play.id }}</small>
        <small>{{ play.wordsLabel }} · {{ play.totalLetters }} letters</small>
        <small>by <strong>{{ play.submittedBy }}</strong></small>
      </p>
      <p role="status" aria-live="polite" data-bn-bind="play-hint"></p>
      <p role="status" aria-live="polite" data-bn-bind="play-cbar" hidden></p>
    </header>

    <section aria-label="Phrase grid" data-bn-region="grid">
      <template @for="word of play.words; track $index">
        <div role="group" :aria-label="'Word ' + ($index + 1)" :data-word-index="$index">
          <template @for="cell of word.cells; track $index">
            <span role="img"
                  :data-locked="cell.anchor ? 'true' : false"
                  :aria-label="cell.anchor ? cell.anchor + ' at position ' + ($index + 1) + ', locked' : 'Empty at position ' + ($index + 1)">
              {{ cell.anchor }}
            </span>
          </template>
        </div>
      </template>
    </section>

    <section aria-label="Letter bank" data-bn-region="bank" data-bn-bind="play-bank"></section>
    <section aria-label="On-screen keyboard" data-bn-region="keyboard" data-bn-bind="play-keyboard"></section>
    <section aria-label="Round result" data-bn-region="result" data-bn-bind="play-result" hidden></section>
  </template>

  <template @else>
    <h1 id="play-title">Loading round…</h1>
    <p role="status" aria-live="polite">Picking a puzzle for you. <a href="/">Back to lobby</a> if this hangs.</p>
  </template>
</main>
`;
