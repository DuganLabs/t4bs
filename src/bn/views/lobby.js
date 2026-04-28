/* lobby.html — exported as a string for both worker and vite
   bundling. Edit this file to change the template; the .js wrapper
   keeps it portable across the @basenative/server SSR worker and
   any node:test consumers.

   Each round is rendered as a real <a href="/play?play={id}"> so the
   lobby is usable with JavaScript disabled (issue #24). When the SPA
   hydrates, mount() replaces #app's children with the imperative tree
   that uses <button> + signal-driven onclick — so the anchors are a
   purely SSR-time degradation surface, no hydration mismatch. */

export default `<main aria-labelledby="lobby-title" data-bn-view="lobby">
  <h1 id="lobby-title">Pick a round</h1>
  <p>One subject. One phrase. No mercy.</p>

  <noscript>
    <p data-bn-region="noscript-hint">
      JavaScript enhances this experience but isn't required to play —
      pick a puzzle below to start a round.
    </p>
  </noscript>

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
          <a :href="group.playHref"
             data-bn-action="lobby-pick"
             :data-puzzle-ids="group.puzzleIds"
             :aria-label="'Play ' + group.category + ' — ' + group.credit">
            <strong>{{ group.category }}</strong>
            <small>{{ group.credit }}</small>
          </a>
        </li>
      </template>
      <template @empty>
        <li><p>Loading puzzles…</p></li>
      </template>
    </ul>
  </section>

  <a href="/submit" data-bn-action="lobby-submit" aria-label="Submit a phrase">
    <span aria-hidden="true">+ </span>Submit a phrase
  </a>
</main>
`;
