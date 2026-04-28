/* header.html — exported as a string for both worker and vite
   bundling. Edit this file to change the template; the .js wrapper
   keeps it portable across the @basenative/server SSR worker and
   any node:test consumers. */

export default `<header role="banner" data-bn-region="header">
  <nav aria-label="Tabs primary">
    <a href="/" data-bn-action="logo" aria-label="Tabs home">
      <strong>T<em>4</em>BS</strong>
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
          <button type="button" data-bn-action="account" :aria-label="'Signed in as ' + user.handle">
            {{ user.handle }}
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
