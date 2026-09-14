/* GET /s/{id} — share landing page.

   Serves HTML with per-share OG/Twitter meta so crawlers (Facebook,
   Twitter, iMessage, Discord, LinkedIn) render the dynamic score card
   from /og/score/{id}.png.

   Real users get an immediate JS redirect to the home page. We deliberately
   do NOT use <meta http-equiv="refresh"> because that interferes with
   crawler scraping on some platforms.
*/

import { d1ShareCards } from "../_shared/d1.js";

const esc = (s) => String(s)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

/* Shared "wrap" chrome for both the real share landing page below and
   the not-found page — same brand shell so an expired/typo'd link
   doesn't dead-end on a bare plain-text response with no way back. */
const PAGE_STYLE = `html,body{margin:0;min-height:100%;background:#0C0B09;color:#F0EDE4;font-family:-apple-system,BlinkMacSystemFont,"Inter",sans-serif;}
    .wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:18px;padding:24px;text-align:center;box-sizing:border-box;}
    h1{margin:0;font-size:clamp(40px,9vw,96px);letter-spacing:-2px;color:#E8920A;font-weight:800;}
    p{margin:0;font-size:18px;color:#988570;}
    img{display:block;width:min(100%,640px);height:auto;aspect-ratio:1200/630;border-radius:14px;border:1px solid #2C2926;}
    a{color:#E8920A;text-decoration:none;font-weight:700;}
    a.play{display:inline-block;background:#E8920A;color:#1A0A00;border-radius:100px;padding:14px 28px;font-size:16px;letter-spacing:.5px;}`;

/* No redirect. This page IS the share: the card image, the category, and
   one button to play today's puzzle. It used to bounce every human to "/"
   the instant JavaScript ran — which also ran inside iOS's link-metadata
   fetcher, so the share sheet and Messages captured the destination of
   the redirect (a bare "t4bs.com") instead of this page's card. */

function notFoundPage(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0C0B09" />
  <title>Tabs — Link not found</title>
  <meta name="robots" content="noindex" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <style>${PAGE_STYLE}</style>
</head>
<body>
  <div class="wrap">
    <h1>Tabs</h1>
    <p>${esc(message)}</p>
    <p><a href="/">Play today's puzzle</a></p>
  </div>
</body>
</html>`;
}

export const onRequestGet = async ({ request: _request, env, params }) => {
  const id = String(params.id || "");
  if (!/^[a-z0-9]{4,16}$/i.test(id)) {
    return new Response(notFoundPage("This share link looks broken."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const card = await d1ShareCards(env.DB).get(id);
  if (!card) {
    return new Response(notFoundPage("This share link has expired — the round it pointed to is gone."), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const origin = env.PUBLIC_ORIGIN || env.RP_ORIGIN || "https://t4bs.com";
  const title = `Tabs — Try this ${card.category} puzzle`;
  const description = card.won
    ? `Someone just solved "${card.category}" for ${card.score} points on Tabs. Think you can match it?`
    : `Someone just played "${card.category}" on Tabs. Your turn — solve the hidden phrase.`;
  const ogImage = `${origin}/og/score/${id}.png`;
  const shareUrl = `${origin}/s/${id}`;
  // If the share card has a puzzle_id, recipients land directly on that
  // puzzle. If not (legacy cards minted before migration 0002), fall back
  // to the lobby.
  /* Always home: the game is one puzzle a day, so whoever opens a share
     link plays TODAY'S puzzle — not the one the sender played. Nobody
     needs the exact link the sender had. */
  const playUrl = "/";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0C0B09" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${esc(ogImage)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Tabs — try this ${esc(card.category)} puzzle (last player got ${card.score}pts)" />
  <meta property="og:url" content="${esc(shareUrl)}" />
  <meta property="og:site_name" content="Tabs" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(ogImage)}" />
  <meta name="twitter:image:alt" content="Tabs — try this ${esc(card.category)} puzzle" />

  <meta property="og:image:secure_url" content="${esc(ogImage)}" />
  <meta property="og:image:type" content="image/png" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="apple-touch-icon" href="${esc(origin)}/og/default.png" />
  <style>${PAGE_STYLE}</style>
</head>
<body>
  <div class="wrap">
    <h1>Tabs</h1>
    <img src="${esc(ogImage)}" width="1200" height="630" alt="${esc(card.category)} — ${card.score} points, ${card.won ? "solved" : "played"}" />
    <p>${esc(card.category)} — your turn</p>
    <p><a class="play" href="${esc(playUrl)}">Play today's puzzle</a></p>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Short cache so crawlers re-fetch and pick up any meta corrections.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
};
