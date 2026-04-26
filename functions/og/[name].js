/* GET /og/{name} — single-segment OG image dispatcher.
   Currently handles only `default(.png)?`. Add more variants here as needed.
   Per-score cards live at /og/score/[id].js. */

import { renderPng, defaultCardScene, pngHeaders } from "../_shared/og.js";

// v3: replaced wordle-style tile row with brand-orange pip variants
// (filled / hollow ring / dim dot). New design language across both
// default and per-score cards.
const CACHE_KEY = "og:default:v3";

export const onRequestGet = async ({ env, params }) => {
  const raw = String(params.name || "");
  const name = raw.replace(/\.png$/i, "").toLowerCase();

  if (name !== "default") return new Response("not found", { status: 404 });

  const cache = env.OG_CACHE;
  if (cache) {
    const cached = await cache.get(CACHE_KEY, "arrayBuffer");
    if (cached) {
      return new Response(cached, {
        headers: { ...pngHeaders({ immutable: false }), "X-Cache": "HIT" },
      });
    }
  }

  let png;
  try {
    png = await renderPng(defaultCardScene(), env);
  } catch (e) {
    return new Response(`render-failed: ${e.message}`, { status: 500 });
  }

  if (cache) await cache.put(CACHE_KEY, png, { expirationTtl: 60 * 60 * 24 * 30 });
  return new Response(png, {
    headers: { ...pngHeaders({ immutable: false }), "X-Cache": "MISS" },
  });
};
