/* home.html — the page at "/", which is today's puzzle.

   There is no lobby. The whole game is one phrase a day, the same one for
   everyone, so the page you land on IS that phrase: the category, the
   board with its anchors turned over, the lives, the number under Solve.
   Sharing "t4bs.com" therefore always lands people on the right game —
   nobody needs the exact link the sender had.

   Three states, decided by the server (functions/_shared/game.js
   dailyStatus) before the first byte:

     dailyOpen — today's puzzle, not yet played by this visitor. The board
                 is painted here from the puzzle row; the client starts (or
                 resumes) the real round in place on hydration.
     dailyDone — this visitor already played today: the result, the streak,
                 and when the next one lands. The share button mounts on
                 hydration.
     neither   — no puzzle could be scheduled (empty catalogue, D1 down):
                 say so, don't show a blank.

   The catalogue — every phrase by category — is a moderator's surface
   (/moderate), not a player's. Nothing here lists it. */

import { renderAlert } from "@basenative/components";
import { DAILY_ZONE_LABEL } from "../../../shared/daily.js";
import playBoardHtml from "./play-board.js";

export default `<main aria-labelledby="home-title" data-bn-view="home">
  <h1 id="home-title" class="sr-only">Tabs — today's puzzle</h1>

  <template @if="daily">
    <section aria-labelledby="home-stats-title" data-bn-region="stats">
      <h2 id="home-stats-title" class="sr-only">Your run</h2>
      <p data-bn-region="stat"><strong>{{ daily.streakLabel }}</strong><small>Streak</small></p>
      <p data-bn-region="stat"><strong>{{ daily.bestStreak }}</strong><small>Best</small></p>
      <p data-bn-region="stat"><strong>{{ daily.daysPlayed }}</strong><small>Days</small></p>
    </section>
  </template>

  <template @if="error">
    ${renderAlert("{{ error }}", { variant: "error" })}
  </template>

  <template @if="dailyOpen">
    <p data-bn-region="day-label">Today · {{ daily.day }}</p>
    ${playBoardHtml}
  </template>

  <template @if="dailyDone">
    <section aria-labelledby="home-done-title" data-bn-region="daily-done">
      <h2 id="home-done-title" data-bn-region="daily-result">{{ daily.resultLabel }}</h2>
      <p data-bn-region="daily-score"><strong>{{ daily.score }}</strong> points</p>
      <p data-bn-region="daily-cat">{{ daily.category }} · {{ daily.day }}</p>
      <p data-bn-region="daily-next">Next puzzle at midnight ${DAILY_ZONE_LABEL}</p>
    </section>
  </template>

  <template @if="noDaily">
    <section aria-labelledby="home-none-title" data-bn-region="daily-none">
      <h2 id="home-none-title">No puzzle today</h2>
      <p>Nothing is scheduled yet. Check back in a bit.</p>
    </section>
  </template>

  <noscript>
    <p data-bn-region="noscript-hint">Tabs needs JavaScript to turn letters over. The puzzle is above; the rest of the game arrives with it.</p>
  </noscript>

  <p data-bn-region="home-foot">
    <a href="/submit" data-bn-action="home-submit">Submit a phrase</a>
  </p>
</main>
`;
