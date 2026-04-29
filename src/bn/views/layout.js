/* layout.html — exported as a string for both worker and vite
   bundling. Edit this file to change the template; the .js wrapper
   keeps it portable across the @basenative/server SSR worker and
   any node:test consumers. */

export default `<!DOCTYPE html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0C0B09" />
    <meta name="color-scheme" content="dark" />
    <meta name="generator" content="BaseNative — basenative.dev" />

    <title>{{ title }}</title>
    <meta name="description" content="{{ description }}" />
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />

    <meta property="og:type" content="website" />
    <meta property="og:title" content="{{ title }}" />
    <meta property="og:description" content="{{ description }}" />
    <meta property="og:image" content="https://t4bs.com/og/default.png" />
    <meta property="og:image:secure_url" content="https://t4bs.com/og/default.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:alt" content="Tabs — quick category puzzles" />
    <meta property="og:url" content="{{ canonicalUrl }}" />
    <meta property="og:site_name" content="Tabs" />
    <meta property="og:locale" content="en_US" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@t4bs" />
    <meta name="twitter:title" content="{{ title }}" />
    <meta name="twitter:description" content="{{ description }}" />
    <meta name="twitter:image" content="https://t4bs.com/og/default.png" />
    <meta name="twitter:image:alt" content="Tabs — quick category puzzles" />

    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Tabs" />
    <meta name="format-detection" content="telephone=no" />

    <style data-bn-critical>:where(svg):not([width]):not([height]){width:1em;height:1em}svg{display:block}</style>

    <link rel="canonical" :href="canonicalUrl" />
    <link rel="preload" as="image" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/favicon.svg" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Bebas+Neue:wght@400&amp;family=DM+Sans:wght@400;600&amp;family=Caveat:wght@700&amp;family=Inter:wght@400;600&amp;display=swap" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue:wght@400&amp;family=DM+Sans:wght@400;600&amp;family=Caveat:wght@700&amp;family=Inter:wght@400;600&amp;display=swap" media="print" onload="this.media='all'" />
    <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue:wght@400&amp;family=DM+Sans:wght@400;600&amp;family=Caveat:wght@700&amp;family=Inter:wght@400;600&amp;display=swap" /></noscript>

    <template @for="href of cssAssets">
      <link rel="stylesheet" :href="href" />
    </template>

    <!-- The hydrate bundle is the longest critical-path JS request.
         Discovered late by the browser (script tag is at end of body),
         which Lighthouse flags as a network-dependency-tree depth
         problem. modulepreload lets the browser start fetching as soon
         as the head is parsed, parallel with stylesheet + font fetches. -->
    <link rel="modulepreload" :href="jsAsset" />

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
  <body :data-route="route">
    <div id="app" role="application" aria-label="Tabs word puzzle game">
      <!--BN_VIEW-->
    </div>
    <noscript>
      <p role="alert">
        Tabs needs JavaScript for the interactive game. The page above is the static round preview;
        enable JavaScript to play.
      </p>
    </noscript>
    <script type="application/json" id="bn-ssr-state">{{ ssrStateJson }}</script>
    <!--BN_HYDRATE_SCRIPT-->
  </body>
</html>
`;
