/* t4bs's response-hardening policy, in one place.

   The header set comes from @basenative/middleware's `securityHeaders()`
   — the org's single hardened baseline, adopted rather than hand-rolled.
   Eight sites across DuganLabs had each written their own copy of this
   finalizer and every one had drifted; t4bs is not becoming the ninth.
   The baseline supplies default-src/script-src/style-src/connect-src/
   font-src at 'self', object-src and frame-ancestors at 'none',
   style-src-attr 'none', img-src 'self' data:, base-uri/form-action at
   'self', upgrade-insecure-requests, HSTS, X-Frame-Options, nosniff,
   Referrer-Policy, COOP and the high-risk browser features denied.

   Before this file, functions/_middleware.js hand-set four of those
   (nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy) and
   no CSP and no COOP at all — the only DuganLabs site with neither.
   That gap matters more here than on a brochure site, because t4bs
   accepts user-submitted phrases into a moderation queue and renders
   them.

   Everything below is only what is genuinely t4bs-specific: the origins
   this site actually loads from, and the hashes of the inline blocks it
   actually ships. Product CSP sources are UNIONED into the baseline by
   the package, so adding a font host here cannot silently drop
   `frame-ancestors 'none'` on the way past.

   ── Why hashes and not a nonce ──────────────────────────────────────
   A nonce has to be minted per response and written into the body, and
   t4bs has three HTML surfaces, one of which cannot have one:

     - SSR pages (src/bn/views/layout.js) — could take a nonce, except
       @basenative/server deliberately refuses to process non-JSON
       <script> tags, so the template engine cannot bind one anyway.
     - /s/{id} share landings (functions/s/[id].js) — worker-generated,
       could take a nonce.
     - dist/index.html, the `?legacy=1` shell — a STATIC file served
       straight off Pages. There is no per-request step that could
       stamp a nonce into it, so a nonce-only policy would blank its
       first paint.

   Every inline block this site ships is a compile-time constant, so a
   hash covers all three surfaces uniformly with no per-request
   plumbing, and keeps working on cached and static responses where a
   nonce cannot. The cost of a hash is drift: edit the CSS and the hash
   is stale. tests/security-headers.test.js recomputes every hash below
   from the real rendered output and from the built dist/index.html, and
   fails if one is wrong — so drift is a red CI check rather than a
   silently unstyled first paint.

   ── What is NOT here, and why ───────────────────────────────────────
   No 'unsafe-eval': the built client bundles contain no eval() and no
   Function constructor (verified against dist/assets/*.js).
   No worker-src: nothing calls `new Worker` or `URL.createObjectURL`.
   No service worker exists in this repo at all.
   Cloudflare Web Analytics IS enabled on this zone. It was recorded here
   as "not enabled — verified against the production HTML", and that check
   was wrong in a way worth naming: Cloudflare injects the beacon at the
   EDGE, after the Worker has responded, so it appears in what a browser
   receives and never in what the origin emits. curl and a Worker-side
   render both show a clean page. A browser shows two blocked scripts.
   Check the delivered document, not the origin response.
   Both origins below are allowed, and today NEITHER is reached, because
   Web Analytics on this zone is on AUTOMATIC setup and its injected loader
   is inline — which no CSP admits without 'unsafe-inline' or a hash of text
   Cloudflare rotates with every beacon release.

   A hand-written external <script src> carrying the automatic-setup token
   was tried and reverted: the script loads, and then every report to
   cloudflareinsights.com/cdn-cgi/rum comes back without an
   Access-Control-Allow-Origin header, so the browser drops it. An
   automatic-setup token is not valid in a manual snippet. That shipped
   analytics that looked configured and recorded nothing, plus a failed
   request on every page load — strictly worse than no beacon.

   What actually fixes it is one dashboard action: Web Analytics -> add the
   site with MANUAL setup, which issues a token whose RUM endpoint answers
   with CORS headers, and turn automatic injection off. Then put that
   token in a <script src="https://static.cloudflareinsights.com/beacon.min.js"
   data-cf-beacon='{"token":"..."}'> in src/bn/views/layout.js. These two
   origins are what that will need, so they stay.
   The JSON-LD and `#bn-ssr-state` blocks are <script type="application/
   ld+json"> and <script type="application/json"> — HTML data blocks,
   never executed, so script-src does not apply and they need no hash. */

import { securityHeaders } from "@basenative/middleware/security-headers";

/* ── Inline content hashes ────────────────────────────────────────────
   Each is the sha256 of the EXACT text between the element's tags.
   tests/security-headers.test.js prints the correct value when one
   drifts. */

/** <style data-bn-critical> in src/bn/views/layout.js — the SSR shell's
 *  first-paint CSS. Without this the header renders at UA defaults
 *  until the external sheet lands (the 68px-vs-48px CLS that
 *  tests/header-parity.test.js exists to prevent). Verified identical
 *  across all six SSR routes. */
export const SSR_CRITICAL_STYLE_HASH =
  "'sha256-l73yp2ACAT+PHQaAZI5raKwIbsm+0PYecInlkyX8Cq0='";

/** <style data-bn-critical> in index.html — the same idea for the
 *  `?legacy=1` static shell. Deliberately a different block from the
 *  SSR one (it has no header rules and no @layer), so it is a different
 *  hash. Vite does not minify inline <style> in HTML, so the source and
 *  built blocks are byte-identical and one hash covers both. */
export const LEGACY_CRITICAL_STYLE_HASH =
  "'sha256-o7aJo0p0ZW6PhR0c2gTvnVbGh9nrkybiPR3Jc1AYsho='";

/** PAGE_STYLE in functions/s/[id].js — the share-landing chrome, used
 *  by both the real landing page and its not-found variant. */
export const SHARE_PAGE_STYLE_HASH =
  "'sha256-6iVEUOWWcxJGyQeabqBdSH4RueN9k86Le1VYt9wcyNM='";

/** The `onload="this.media='all'"` attribute on the Google Fonts
 *  stylesheet link, in BOTH view trees. This is the media=print swap
 *  that keeps the font CSS off the render-blocking path; dropping it
 *  would make the font sheet block first paint, which is the exact
 *  thing the critical-CSS block above exists to avoid.
 *
 *  An event-handler attribute cannot be authorized by a nonce — CSP
 *  requires 'unsafe-hashes' alongside the handler's hash. That keyword
 *  sounds worse than it is: it permits ONLY handler text matching a
 *  listed hash, so the single string `this.media='all'` is allowed and
 *  nothing else. It is scoped to script-src (no script-src-attr is set,
 *  so handlers fall back to it) and does not enable inline <script>. */
export const FONT_SWAP_HANDLER_HASH =
  "'sha256-MhtPZXr7+LpJUY5qtMutB+qWfQtMaPccfe7QXtCcEYc='";

/** `style="flex:1.5;"` — the inline style @basenative/keyboard puts on
 *  its two wide keys (ENTER and BACKSPACE in the `qwerty` layout that
 *  src/views/play.js asks for). Found by driving the play route in
 *  Chromium, not by reading the source: no template in this repo emits
 *  a style attribute, so static grep says the baseline's
 *  style-src-attr 'none' is free. It is not — this comes from inside a
 *  dependency's markup.
 *
 *  It is load-bearing, not decorative: the package's own
 *  `.bn-kb-key--wide` rule sets only max-width and typography, never
 *  flex, so blocking this collapses ENTER and BACKSPACE to single-key
 *  width. Allowing it needs 'unsafe-hashes', for the same reason the
 *  font-swap handler does — CSP does not apply plain hashes to style
 *  attributes. It authorizes this one declaration and nothing else;
 *  'unsafe-hashes' cannot enable an inline <style> block, which still
 *  needs its own hash. See the style-src comment below for why it is
 *  listed there rather than on style-src-attr.
 *
 *  This is a dependency's string, so it can change under a keyboard
 *  upgrade with nothing in this repo touched. tests/security-headers
 *  .test.js renders the real keyboard and fails if it emits a style
 *  attribute this policy does not cover. */
export const KEYBOARD_WIDE_KEY_STYLE_HASH =
  "'sha256-mRkHhRb0Qby6LiXaZ49+ZeVCyiTwRqnmQcae45Fz4Ds='";

/** Google Fonts serves the @font-face CSS from one origin and the woff2
 *  files from another; both <link>s are in layout.js and index.html. */
export const FONT_CSS_ORIGIN = "https://fonts.googleapis.com";
export const FONT_FILE_ORIGIN = "https://fonts.gstatic.com";
/* Cloudflare Web Analytics: the beacon is served from one host and reports to
   another. Both are required — see the script-src and connect-src notes below. */
export const ANALYTICS_SCRIPT_ORIGIN = "https://static.cloudflareinsights.com";
export const ANALYTICS_REPORT_ORIGIN = "https://cloudflareinsights.com";

/**
 * The finalizer. Stamps the hardened header set onto any Response.
 *
 * Configured once at module scope so a malformed directive throws at
 * Worker boot rather than on the first request that needs it.
 *
 * @type {(response: Response, context?: { request?: Request }) => Response}
 */
export const harden = securityHeaders({
  csp: {
    /* 'self' (baseline) covers the hydrate bundle and every lazily
       imported view chunk — all same-origin /assets/*.js. t4bs loads no
       third-party script at all. The one hash is the font-swap handler;
       the share landing carries no script any more. */
    "script-src": [
      "'unsafe-hashes'",
      FONT_SWAP_HANDLER_HASH,
      ANALYTICS_SCRIPT_ORIGIN,
    ],

    /* The Google Fonts stylesheet (both the <link rel=stylesheet> and
       its <link rel=preload as=style>, which style-src also governs),
       plus the three inline critical-CSS blocks. No 'unsafe-inline':
       with hashes present a CSP3 browser ignores it anyway, and every
       block here is known.

       'unsafe-hashes' + KEYBOARD_WIDE_KEY_STYLE_HASH ride here rather
       than on style-src-attr, and that is a workaround, so it is worth
       being explicit about why. The package merges a product's sources
       INTO the baseline — it never replaces them — which is exactly
       the property that stops a new font host from quietly dropping
       `frame-ancestors 'none'`. The cost is that a baseline directive
       set to 'none' cannot be narrowed: asking for
       `style-src-attr: ["'unsafe-hashes'", hash]` yields
       `style-src-attr 'none' 'unsafe-hashes' 'sha256-…'`, and CSP says
       'none' is only valid as a sole source expression, so Chromium
       ignores the 'none' AND logs a console error on every single
       response. Verified in a browser, not assumed.

       So style-src-attr is removed outright (below) and the attribute
       check falls back to style-src, per CSP's fallback chain. The
       security result is identical: 'unsafe-hashes' only ever relaxes
       style ATTRIBUTES, event handlers and javascript: URLs — it does
       not weaken the inline <style> rules above, which still need
       their own hashes. Worth reporting upstream: @basenative/
       middleware has no way to narrow a baseline directive, only to
       delete it. */
    "style-src": [
      FONT_CSS_ORIGIN,
      SSR_CRITICAL_STYLE_HASH,
      LEGACY_CRITICAL_STYLE_HASH,
      SHARE_PAGE_STYLE_HASH,
      "'unsafe-hashes'",
      KEYBOARD_WIDE_KEY_STYLE_HASH,
    ],

    /* Removed so the style-attribute check falls back to style-src
       above. Nothing in t4bs's own templates emits a style=""
       attribute — the one that exists comes from inside
       @basenative/keyboard. src/lib/confetti.js's canvas.style.cssText
       write is a CSSOM property assignment, which CSP does not
       govern at all. */
    "style-src-attr": null,

    /* woff2 files. */
    "font-src": [FONT_FILE_ORIGIN],

    /* Every fetch this app itself makes is same-origin /api/*
       (src/lib/api.js, and the /api/log error beacon in src/main.js +
       src/bn/client/hydrate.js). There is no WebSocket and no service
       worker. The one cross-origin fetch in the codebase —
       cdn.jsdelivr.net for the OG card's font, in functions/_shared/og.js
       — runs inside the Worker, where CSP does not apply, so it
       deliberately does NOT appear here.
       The one entry is where the Web Analytics beacon POSTs its page
       views. Loading beacon.min.js without it gets a script that runs and
       then has every report blocked, which looks like working analytics
       and reports nothing. */
    "connect-src": [ANALYTICS_REPORT_ORIGIN],

    /* img-src stays at the baseline 'self' data:. The OG cards are
       same-origin /og/*.png, the favicon is /favicon.svg, and nothing
       mints a blob: URL. */
  },

  /* Mirrors, byte for byte, the Strict-Transport-Security that
     t4bs.com's Cloudflare edge already sends today
     (max-age=31536000; includeSubDomains; preload). The edge is not the
     app: a request served from anywhere else would lose the header
     entirely, so the app asserts it too.

     NOTE for the owner: t4bs.com is NOT actually on the browser preload
     list (hstspreload.org reports status "unknown"), so the edge's
     `preload` token is currently an unbacked claim. This file
     deliberately reproduces it rather than silently dropping it — this
     PR is about adding CSP and COOP, and quietly changing the HSTS a
     site already serves does not belong in it. Either submit t4bs.com
     to the list or drop `preload: true` here and at the edge; both are
     one-line changes, but they are a separate decision. */
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },

  /* WebAuthn. @basenative/auth-webauthn calls navigator.credentials
     .get()/.create() from src/lib/auth.js, and a Permissions-Policy
     that omits them blocks passkey sign-in outright. 'self' only — no
     cross-origin RP. This reproduces exactly what _middleware.js set
     by hand before; the baseline additionally denies camera,
     microphone, geolocation, payment and usb. */
  permissions: {
    "publickey-credentials-get": ["self"],
    "publickey-credentials-create": ["self"],
  },

  /* Same-origin isolation. t4bs opens no cross-origin popups and is
     opened by none, so this is free. COEP/CORP stay off: the package
     omits them by default, and turning them on would be a separate
     decision about cross-subdomain asset serving. */
  coop: "same-origin",

  /* Preserves the pre-existing rule from _middleware.js's decorate():
     API responses are per-user and must never sit in a shared cache.
     Returning null leaves whatever the route chose — the SSR pages'
     private,no-cache and /s/{id}'s public,max-age=300 both still
     stand. */
  cache: ({ request }) => {
    if (!request) return null;
    return new URL(request.url).pathname.startsWith("/api/") ? "no-store" : null;
  },
});
