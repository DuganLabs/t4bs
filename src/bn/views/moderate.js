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
      <ul role="list" data-bn-bind="moderate-list">
        <template @for="item of pending; track item.id">
          <li>
            <article :aria-label="'Submission #' + item.id">
              <header>
                <p>
                  <strong>{{ item.category }}</strong>
                  <small>by {{ item.submittedBy }}</small>
                </p>
                <p>{{ item.phrase }}</p>
              </header>
              <footer>
                <button type="button"
                        data-bn-action="moderate-approve"
                        :data-id="item.id">Approve</button>
                <button type="button"
                        data-bn-action="moderate-reject"
                        :data-id="item.id">Reject</button>
              </footer>
            </article>
          </li>
        </template>
        <template @empty>
          <li><p>Nothing pending. The queue is empty.</p></li>
        </template>
      </ul>
    </section>
  </template>
</main>
`;
