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

export const onRequestGet = async ({ request, env, params }) => {
  const id = String(params.id || "");
  if (!/^[a-z0-9]{4,16}$/i.test(id)) return new Response("bad id", { status: 400 });

  const card = await d1ShareCards(env.DB).get(id);
  if (!card) return new Response("not found", { status: 404 });

  const origin = env.PUBLIC_ORIGIN || env.RP_ORIGIN || "https://t4bs.com";
  const verdict = card.won ? "Solved" : "Busted";
  const title = `T4BS — ${verdict} ${card.category} for ${card.score}pts`;
  const description = `${verdict} a t4bs round on "${card.category}" for ${card.score} points. Five-letter battle of bullshit.`;
  const ogImage = `${origin}/og/score/${id}.png`;
  const shareUrl = `${origin}/s/${id}`;

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
  <meta property="og:image:alt" content="T4BS score card: ${esc(verdict)} ${esc(card.category)} for ${card.score}pts" />
  <meta property="og:url" content="${esc(shareUrl)}" />
  <meta property="og:site_name" content="T4BS" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(ogImage)}" />
  <meta name="twitter:image:alt" content="T4BS score card" />

  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <style>
    html,body{margin:0;height:100%;background:#0C0B09;color:#F0EDE4;font-family:-apple-system,BlinkMacSystemFont,"Inter",sans-serif;}
    .wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:18px;padding:24px;text-align:center;}
    h1{margin:0;font-size:clamp(40px,9vw,96px);letter-spacing:-2px;color:#E8920A;font-weight:800;}
    p{margin:0;font-size:18px;color:#988570;}
    a{color:#E8920A;text-decoration:none;font-weight:700;}
  </style>
  <script>
    // Instant redirect for human visitors. Crawlers do not run JS.
    window.location.replace("/");
  </script>
</head>
<body>
  <div class="wrap">
    <h1>T4BS</h1>
    <p>${esc(verdict)} ${esc(card.category)} for ${card.score}pts</p>
    <p><a href="/">Play t4bs</a></p>
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
