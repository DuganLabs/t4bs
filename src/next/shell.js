/* Page shell — wraps a view's body in the full <!doctype html> envelope.
   Mirrors index.html's meta/OG/font setup so SSR'd pages match the SPA's
   social previews and theme. The hydration bundle path is resolved from
   Vite's manifest (handed in by the worker) so we pick up cache-busted
   filenames after every build. */

import { esc, escJson, join } from "./util/escape.js";

/**
 * @typedef {{
 *   title: string,
 *   description?: string,
 *   canonicalPath?: string,
 *   bodyClass?: string,
 *   appHtml: string,
 *   ssrState: unknown,
 *   assets: { js: string, css: string[] },
 * }} ShellInput
 */

/** @param {ShellInput} input */
export function renderShell(input) {
  const {
    title, description, canonicalPath = "/",
    bodyClass, appHtml, ssrState, assets,
  } = input;

  const desc = description || "Pick a category. Solve the hidden phrase. Stake the letters you're sure about.";
  const url  = `https://t4bs.com${canonicalPath}`;

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0C0B09" />
    <meta name="color-scheme" content="dark" />
    <meta name="generator" content="BaseNative — basenative.dev" />

    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />

    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:image" content="https://t4bs.com/og/default.png" />
    <meta property="og:image:secure_url" content="https://t4bs.com/og/default.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:alt" content="Tabs — quick category puzzles" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:site_name" content="Tabs" />
    <meta property="og:locale" content="en_US" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@t4bs" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="https://t4bs.com/og/default.png" />
    <meta name="twitter:image:alt" content="Tabs — quick category puzzles" />

    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Tabs" />
    <meta name="format-detection" content="telephone=no" />

    <link rel="canonical" href="${esc(url)}" />
    <link rel="preload" as="image" href="/favicon.svg" type="image/svg+xml" imagesrcset="/favicon.svg" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/favicon.svg" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Bebas+Neue:wght@400&family=DM+Sans:wght@400;600&family=Caveat:wght@700&family=Inter:wght@400;600&display=swap"
    />
${assets.css.map(href => `    <link rel="stylesheet" href="${esc(href)}" />`).join("\n")}

    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Game",
        "name": "Tabs",
        "alternateName": "T4BS",
        "url": "https://t4bs.com/",
        "image": "https://t4bs.com/og/default.png",
        "description": "Pick a category. Solve the hidden phrase. Stake the letters you're sure about.",
        "genre": "Word puzzle",
        "applicationCategory": "GameApplication",
        "operatingSystem": "Any",
        "author": { "@type": "Organization", "name": "The Synonym Toast Bunch" },
        "publisher": { "@type": "Organization", "name": "BaseNative", "url": "https://basenative.dev" },
        "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
      }
    </script>
  </head>
  <body${join(bodyClass ? ` class="${esc(bodyClass)}"` : null)}>
    <div id="app" role="application" aria-label="Tabs word puzzle game">${appHtml}</div>
    <noscript>
      <div class="noscript-msg" role="alert">
        <h1>TABS</h1>
        <p>This game requires JavaScript to run. Please enable it in your browser settings and reload the page.</p>
      </div>
    </noscript>
    <script>window.__T4BS_SSR__=${escJson(ssrState)};</script>
    <script type="module" src="${esc(assets.js)}"></script>
  </body>
</html>`;
}
