/* GET /og/score/{id}.png — render and cache PNG for a minted share card. */

import { d1ShareCards } from "../../_shared/d1.js";
import { renderPng, scoreCardScene, pngHeaders } from "../../_shared/og.js";

// v2: pip-based redesign (brand orange, non-Wordle). Bump invalidates
// any cached PNG using the old green/yellow tile palette.
const KV_PREFIX = "og:score:v2:";

export const onRequestGet = async ({ request, env, params }) => {
  const idParam = String(params.id || "");
  // Strip optional .png so /og/score/abc.png and /og/score/abc both work.
  const id = idParam.replace(/\.png$/i, "");
  if (!/^[a-z0-9]{4,16}$/i.test(id)) return new Response("bad id", { status: 400 });

  const cacheKey = `${KV_PREFIX}${id}`;
  const cache = env.OG_CACHE;

  // Cache hit
  if (cache) {
    const cached = await cache.get(cacheKey, "arrayBuffer");
    if (cached) {
      return new Response(cached, {
        headers: { ...pngHeaders(), "X-Cache": "HIT" },
      });
    }
  }

  const card = await d1ShareCards(env.DB).get(id);
  if (!card) return new Response("not found", { status: 404 });

  let png;
  try {
    png = await renderPng(scoreCardScene(card), env);
  } catch (e) {
    return new Response(`render-failed: ${e.message}`, { status: 500 });
  }

  if (cache) {
    // 30d — share cards are effectively immutable.
    await cache.put(cacheKey, png, { expirationTtl: 60 * 60 * 24 * 30 });
  }

  return new Response(png, {
    headers: { ...pngHeaders(), "X-Cache": "MISS" },
  });
};
