/* lobby.html — exported as a string for both worker and vite
   bundling. Edit this file to change the template; the .js wrapper
   keeps it portable across the @basenative/server SSR worker and
   any node:test consumers. */

export default `<main aria-labelledby="lobby-title" data-bn-view="lobby">
  <h1 id="lobby-title">Pick a round</h1>
  <p>One subject. One phrase. No mercy.</p>

  <section aria-labelledby="lobby-stats-title" data-bn-region="stats" hidden>
    <h2 id="lobby-stats-title">Your run</h2>
  </section>

  <template @if="error">
    <p role="alert" data-bn-region="error">{{ error }}</p>
  </template>

  <section aria-labelledby="lobby-list-title">
    <h2 id="lobby-list-title">Available puzzles</h2>
    <ul role="list" data-bn-region="list">
      <template @for="group of groups; track group.category">
        <li>
          <button type="button"
                  data-bn-action="lobby-pick"
                  :data-puzzle-ids="group.puzzleIds"
                  :aria-label="'Play ' + group.category + ' — ' + group.credit">
            <strong>{{ group.category }}</strong>
            <small>{{ group.credit }}</small>
          </button>
        </li>
      </template>
      <template @empty>
        <li><p>Loading puzzles…</p></li>
      </template>
    </ul>
  </section>

  <button type="button" data-bn-action="lobby-submit" aria-label="Submit a phrase">
    + Submit a phrase
  </button>
</main>
`;
