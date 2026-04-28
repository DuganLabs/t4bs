/* not-found.html — exported as a string for both worker and vite
   bundling. Edit this file to change the template; the .js wrapper
   keeps it portable across the @basenative/server SSR worker and
   any node:test consumers. */

export default `<main aria-labelledby="notfound-title" data-bn-view="not-found">
  <h1 id="notfound-title">Not found</h1>
  <p>No page at <code>{{ pathname }}</code>.</p>
  <p><a href="/">← Back to the lobby</a></p>
</main>
`;
