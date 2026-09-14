/* play.html — exported as a string for both worker and vite bundling.

   /play is the preview route: `/play?play=<id>` opens one puzzle from the
   catalogue (the moderator's "Preview" link) without touching the daily
   or the streak. Today's puzzle is played on the home page itself
   (src/bn/views/home.js); a bare /play has nothing to show and the client
   sends it home.

   The board markup is src/bn/views/play-board.js, shared with the home
   page so the two first paints are the same function of the same row. */

import playBoardHtml from "./play-board.js";

export default `<main aria-labelledby="play-title" data-bn-view="play">
  <template @if="play">
    <h1 id="play-title" class="sr-only">{{ play.category }} — preview</h1>
    <p data-bn-region="preview-note">Preview · does not count toward a streak</p>
    ${playBoardHtml}
  </template>

  <template @else>
    <h1 id="play-title">Nothing to preview</h1>
    <p role="status" aria-live="polite">This link doesn't name a puzzle. <a href="/">Play today's puzzle</a> instead.</p>
  </template>
</main>
`;
