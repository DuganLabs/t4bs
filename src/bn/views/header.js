/* header.html — exported as a string for both worker and vite
   bundling. Edit this file to change the template; the .js wrapper
   keeps it portable across the @basenative/server SSR worker and
   any node:test consumers. */

/* axe \`label-content-name-mismatch\`: where a control has visible
   text, its accessible name must contain that text. The previous
   aria-label values ("Tabs home", "Signed in as wmd") replaced
   visible "T4BS" / handle entirely. The fixed shape uses visible
   text + a <span class="sr-only"> suffix so the accessible name is
   a superset of what the user sees. */
export default `<header role="banner" data-bn-region="header">
  <nav aria-label="Tabs primary">
    <a href="/" data-bn-action="logo">
      <strong>T<em>4</em>BS</strong>
      <span class="sr-only"> — Tabs home</span>
    </a>

    <template @if="route === 'play' &amp;&amp; play">
      <output aria-label="Score">{{ play.score }}</output>
      <output aria-label="Lives">♥ {{ play.lives }}</output>
      <output aria-label="Tokens">⚡ {{ play.tokens }}</output>
    </template>

    <ul role="list">
      <template @if="user &amp;&amp; user.isModerator">
        <li><a href="/moderate" :aria-current="route === 'moderate' ? 'page' : false">Moderate</a></li>
      </template>
      <template @if="user &amp;&amp; user.isAdmin">
        <li><a href="/admin" :aria-current="route === 'admin' ? 'page' : false">Admin</a></li>
      </template>
      <li>
        <button type="button" data-bn-action="help" aria-label="How to play">?</button>
      </li>
      <template @if="user">
        <li>
          <button type="button" data-bn-action="account">
            {{ user.handle }}
            <span class="sr-only"> — open account menu</span>
          </button>
        </li>
      </template>
      <template @else>
        <li>
          <button type="button" data-bn-action="auth">Sign in</button>
        </li>
      </template>
    </ul>
  </nav>
</header>
`;
