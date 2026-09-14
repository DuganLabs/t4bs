/* admin.html — exported as a string for both worker and vite bundling.

   Admin v2 (docs/PRD.md §4): one route, five tabs. The first paint carries
   the Catalogue table server-rendered ({{ catalogueHtml }} is
   renderCatalogueTable() marked raw, the same call the client makes) and
   the People list; Daily, Queue and Stats load on hydration. The tabs are
   @basenative/components' renderTabs, so the roving tabindex and the
   aria wiring are the package's; initTabs() on the client makes them
   switch. The forbidden notice is renderAlert. */

import { renderAlert, renderButton, renderTabs } from "@basenative/components";

const people = `
      <section aria-labelledby="admin-search-title" data-bn-region="search">
        <h2 id="admin-search-title">Find a user</h2>
        <p>
          <label for="admin-search">Search by handle</label>
          <input id="admin-search" type="search" name="q" autocomplete="off"
                 placeholder="Search users by handle…" data-bn-bind="admin-search" />
        </p>
      </section>
      <section aria-labelledby="admin-elevated-title" data-bn-region="elevated">
        <h2 id="admin-elevated-title">Moderators &amp; admins</h2>
        <ul role="list" data-bn-bind="admin-elevated">
          <template @for="user of elevated; track user.handle">
            <li>
              <article :aria-label="user.handle + ' — ' + user.role">
                <p><strong>{{ user.handle }}</strong> <small>{{ user.role }}</small></p>
                <template @if="user.handle !== currentHandle">
                  <p>
                    ${renderButton("Demote to user", { variant: "secondary", attrs: 'data-bn-action="admin-set-role" :data-handle="user.handle" data-role="user"' })}
                    <template @if="user.role === 'moderator'">
                      ${renderButton("Promote to admin", { variant: "primary", attrs: 'data-bn-action="admin-set-role" :data-handle="user.handle" data-role="admin"' })}
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
      </section>`;

const loading = (what) => `<p data-bn-region="status" role="status" aria-live="polite">Loading ${what}…</p>`;

export default `<main aria-labelledby="admin-title" data-bn-view="admin">
  <h1 id="admin-title">Admin</h1>

  <template @if="forbidden">
    ${renderAlert('You need admin access. <a href="/">Back to lobby</a>.', { variant: "error" })}
  </template>

  <template @else>
    <p data-bn-region="tagline">{{ catalogueCount }} puzzles in the catalogue · docs/PRD.md §4</p>
    ${renderTabs({
      id: "admin-tabs",
      attrs: 'data-bn-region="admin-tabs"',
      tabs: [
        { id: "catalogue", label: "Catalogue", content: `<div data-bn-region="tab-body" data-bn-bind="admin-catalogue"><div data-bn-region="scroll">{{ catalogueHtml }}</div></div>` },
        { id: "daily",     label: "Daily",     content: `<div data-bn-region="tab-body" data-bn-bind="admin-daily">${loading("the schedule")}</div>` },
        { id: "queue",     label: "Queue",     content: `<div data-bn-region="tab-body" data-bn-bind="admin-queue">${loading("the queue")}</div>` },
        { id: "people",    label: "People",    content: `<div data-bn-region="tab-body" data-bn-bind="admin-people">${people}</div>` },
        { id: "stats",     label: "Stats",     content: `<div data-bn-region="tab-body" data-bn-bind="admin-stats">${loading("the numbers")}</div>` },
      ],
    })}

    <a href="/" data-bn-action="to-lobby" data-bn-variant="leave"
       aria-label="Leave admin and go to the puzzle lobby">Go to the puzzle lobby →</a>
  </template>
</main>
`;
