/* moderate.html — exported as a string for both worker and vite
   bundling. Edit this file to change the template; the .js wrapper
   keeps it portable across the @basenative/server SSR worker and
   any node:test consumers.

   Two sections: the pending queue, and the catalogue — every approved
   phrase by category, phrase showing, with a Preview link per row. The
   catalogue used to be the home page's "free play" list of numbered
   rounds; it is a moderator's surface, so it lives here (src/lib/game.js
   renderCatalogueShelf, the same helper the client calls).

   The forbidden notice is @basenative/components' renderAlert() — it
   picks role="alert" for the error variant, so the role is no longer
   asserted by hand. */

import { renderAlert } from "@basenative/components";

export default `<main aria-labelledby="moderate-title" data-bn-view="moderate">
  <h1 id="moderate-title">Moderation</h1>

  <template @if="forbidden">
    ${renderAlert(
      'You need moderator access to view the queue. <a href="/">Play today&#39;s puzzle</a>.',
      { variant: "error" },
    )}
  </template>

  <template @else>
    <section aria-labelledby="moderate-pending-title" data-bn-region="queue">
      <h2 id="moderate-pending-title">Pending submissions</h2>
      <!-- Markup owned by @basenative/admin's renderAdminQueueList (see
           src/bn/server/render.js) — same renderer + same
           actionHandler ("mod-decide") the client calls in
           src/views/moderate.js, so SSR and post-hydration markup
           match. -->
      <div data-bn-bind="moderate-list">{{ queueListHtml }}</div>
    </section>

    <section aria-labelledby="moderate-catalogue-title" data-bn-region="catalogue-section">
      <h2 id="moderate-catalogue-title">Catalogue</h2>
      <p data-bn-region="catalogue-note">Every approved phrase, by category. Preview opens one puzzle without touching the daily or anyone's streak.</p>
      <div data-bn-bind="moderate-catalogue">
        <template @if="hasCatalogue">
          {{ catalogueHtml }}
        </template>
        <template @else>
          <p data-bn-region="status">No approved phrases yet.</p>
        </template>
      </div>
    </section>

    <a href="/" data-bn-action="to-home" data-bn-variant="leave"
       aria-label="Leave moderation and play today's puzzle">Play today's puzzle →</a>
  </template>
</main>
`;
