/* lobby.html — exported as a string for both worker and vite
   bundling. Edit this file to change the template; the .js wrapper
   keeps it portable across the @basenative/server SSR worker and
   any node:test consumers.

   Two shelves, and the distinction between them is the point:

     - TODAY'S PUZZLE is server-picked from the UTC day and recorded
       once (`/play?daily=1` → POST /api/session {mode:"daily"}). The
       streak lives here. It used to be a client-side date hash with
       nothing behind it.
     - FREE PLAY is every approved puzzle, replayable forever, and never
       touches the streak. Each round is a real <a href="/play?play={id}">
       so the lobby still works with JavaScript disabled (issue #24).

   When the SPA hydrates, mount() replaces #app's children with the
   imperative tree that uses <button> + signal-driven onclick — so the
   anchors are purely an SSR-time degradation surface.

   The error notice is @basenative/components' renderAlert(); the
   `{{ error }}` marker sits in its content slot and is interpolated —
   and escaped — by @basenative/server at render time, exactly as it was
   in the hand-written <p>. */

import { renderAlert } from "@basenative/components";

export default `<main aria-labelledby="lobby-title" data-bn-view="lobby">
  <h1 id="lobby-title">Pick a round</h1>
  <p>One subject. One phrase. No mercy.</p>

  <noscript>
    <p data-bn-region="noscript-hint">
      JavaScript enhances this experience but isn't required to play —
      pick a puzzle below to start a round.
    </p>
  </noscript>

  <template @if="daily">
    <section aria-labelledby="lobby-stats-title" data-bn-region="stats">
      <h2 id="lobby-stats-title" class="sr-only">Your run</h2>
      <p data-bn-region="stat"><strong>{{ daily.streakLabel }}</strong><small>STREAK</small></p>
      <p data-bn-region="stat"><strong>{{ daily.bestStreak }}</strong><small>BEST</small></p>
      <p data-bn-region="stat"><strong>{{ daily.daysPlayed }}</strong><small>DAYS</small></p>
    </section>
  </template>

  <template @if="error">
    ${renderAlert("{{ error }}", { variant: "error" })}
  </template>

  <!-- The daily is deliberately FIXED: the server picks one puzzle per
       UTC day, the same one for everybody, and refuses a second run —
       that is the whole basis of the streak. But the card looked exactly
       like the free-play cards below it, so it read as a category
       picker; the owner reported not being able to "change from film
       titles to motivational" from here. Nothing about the behaviour is
       wrong, so the fix is entirely in what the card says about itself:
       it states that today's category is set, and points at free play
       as the place where the choosing happens. -->
  <section aria-labelledby="lobby-daily-title" data-bn-region="daily">
    <h2 id="lobby-daily-title" data-bn-region="daily-label">Today's puzzle · set by the server</h2>
    <template @if="dailyOpen">
      <a href="/play?daily=1"
         data-bn-action="lobby-daily"
         data-bn-variant="daily"
         :aria-label="'Play today\\'s puzzle, ' + daily.category + '. This category is fixed for everyone today. One attempt — it counts toward your streak.'">
        <strong>{{ daily.category }}</strong>
        <small>{{ daily.day }} · one attempt · counts toward your streak</small>
      </a>
      <p data-bn-region="daily-note">
        Everyone gets this same category today — it isn't a choice.
        To pick your own, use free play below.
      </p>
    </template>
    <template @if="dailyDone">
      <div data-bn-region="daily-done">
        <p data-bn-region="daily-result">{{ daily.resultLabel }}</p>
        <p data-bn-region="daily-score">{{ daily.score }} pts</p>
        <p data-bn-region="daily-cat">{{ daily.category }}</p>
      </div>
      <p data-bn-region="daily-next">Next puzzle at 00:00 UTC · free play below</p>
    </template>
  </section>

  <p data-bn-region="rules-note">
    Four lives for the whole phrase — any word guess that isn't fully correct costs one.
  </p>

  <section aria-labelledby="lobby-list-title" data-bn-region="free-play">
    <h2 id="lobby-list-title">Free play · pick any category</h2>
    <p data-bn-region="free-note">
      This is where you choose. Every approved category, replayable as
      often as you like — they never touch your streak.
    </p>
    <ul role="list" data-bn-region="list">
      <template @for="group of groups; track group.category">
        <li>
          <a :href="group.playHref"
             data-bn-action="lobby-pick"
             :data-puzzle-ids="group.puzzleIds"
             :aria-label="'Free play: ' + group.category + ' — ' + group.credit + '. Does not count toward your streak.'">
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
