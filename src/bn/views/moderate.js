/* moderate.html — exported as a string for both worker and vite
   bundling. Edit this file to change the template; the .js wrapper
   keeps it portable across the @basenative/server SSR worker and
   any node:test consumers.

   The forbidden notice is @basenative/components' renderAlert() — it
   picks role="alert" for the error variant, so the role is no longer
   asserted by hand. */

import { renderAlert } from "@basenative/components";

export default `<main aria-labelledby="moderate-title" data-bn-view="moderate">
  <h1 id="moderate-title">Moderation queue</h1>

  <template @if="forbidden">
    ${renderAlert(
      'You need moderator access to view the queue. <a href="/">Back to lobby</a>.',
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

    <!-- The way out of the queue, matching src/views/moderate.js (the
         hydrated client) in both wording and box. An <a> rather than a
         <button> because this is the pre-hydration surface, where only
         a real link works — the same split the lobby template uses for
         its round cards. It is deliberately NOT called "back": it goes
         to the lobby, which lists the APPROVED puzzles, whatever the
         moderator's history says. -->
    <a href="/" data-bn-action="to-lobby" data-bn-variant="leave"
       aria-label="Leave the moderation queue and go to the puzzle lobby, where approved puzzles are listed">Go to the puzzle lobby →</a>
  </template>
</main>
`;
