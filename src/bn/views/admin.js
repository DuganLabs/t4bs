/* admin.html — exported as a string for both worker and vite
   bundling. Edit this file to change the template; the .js wrapper
   keeps it portable across the @basenative/server SSR worker and
   any node:test consumers. */

export default `<main aria-labelledby="admin-title" data-bn-view="admin">
  <h1 id="admin-title">Moderator administration</h1>

  <template @if="forbidden">
    <p role="alert">
      You need admin access. <a href="/">Back to lobby</a>.
    </p>
  </template>

  <template @else>
    <section aria-labelledby="admin-search-title" data-bn-region="search">
      <h2 id="admin-search-title">Find a user</h2>
      <p>
        <label for="admin-search">Search by handle</label>
        <input id="admin-search"
               type="search"
               name="q"
               autocomplete="off"
               placeholder="Search users by handle…"
               data-bn-bind="admin-search" />
      </p>
    </section>

    <section aria-labelledby="admin-elevated-title" data-bn-region="elevated">
      <h2 id="admin-elevated-title">Moderators &amp; admins</h2>
      <ul role="list" data-bn-bind="admin-elevated">
        <template @for="user of elevated; track user.handle">
          <li>
            <article :aria-label="user.handle + ' — ' + user.role">
              <p>
                <strong>{{ user.handle }}</strong>
                <small>{{ user.role }}</small>
              </p>
              <template @if="user.handle !== currentHandle">
                <p>
                  <button type="button"
                          data-bn-action="admin-set-role"
                          :data-handle="user.handle"
                          data-role="user">Demote to user</button>
                  <template @if="user.role === 'moderator'">
                    <button type="button"
                            data-bn-action="admin-set-role"
                            :data-handle="user.handle"
                            data-role="admin">Promote to admin</button>
                  </template>
                </p>
              </template>
            </article>
          </li>
        </template>
        <template @empty>
          <li><p>No elevated accounts yet — search above to promote someone.</p></li>
        </template>
      </ul>
    </section>

    <section aria-labelledby="admin-results-title" data-bn-region="results" hidden>
      <h2 id="admin-results-title">Search results</h2>
      <ul role="list" data-bn-bind="admin-results"></ul>
    </section>
  </template>
</main>
`;
