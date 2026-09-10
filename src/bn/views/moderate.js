/* moderate.html — exported as a string for both worker and vite
   bundling. Edit this file to change the template; the .js wrapper
   keeps it portable across the @basenative/server SSR worker and
   any node:test consumers. */

export default `<main aria-labelledby="moderate-title" data-bn-view="moderate">
  <h1 id="moderate-title">Moderation queue</h1>

  <template @if="forbidden">
    <p role="alert">
      You need moderator access to view the queue.
      <a href="/">Back to lobby</a>.
    </p>
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
  </template>
</main>
`;
