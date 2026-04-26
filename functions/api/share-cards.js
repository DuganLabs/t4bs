/* POST /api/share-cards
   Mints a short opaque id for a finished session and stores card metadata.
   Auth not required (a finished session is shareable by whoever played it).
   Body: { sessionId, category, score, won, grid }
   Response: { id, url } where url is /s/{id} on PUBLIC_ORIGIN.

   GET /api/share-cards/:id is provided by [id].js — see neighbour file.
*/
import { json, error, readJson, currentUser } from "../_shared/util.js";
import { d1ShareCards } from "../_shared/d1.js";

const ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"; // unambiguous
const ID_LEN = 8;

function shortId() {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LEN));
  let out = "";
  for (let i = 0; i < ID_LEN; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return out;
}

export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  const { sessionId, category, score, won, grid } = body || {};

  if (typeof category !== "string" || !category) return error("bad-category", 400);
  if (typeof score !== "number" || !Number.isFinite(score)) return error("bad-score", 400);
  if (typeof grid !== "string" || grid.length === 0 || grid.length > 1024) return error("bad-grid", 400);

  const u = await currentUser(request, env);
  const id = shortId();
  const cards = d1ShareCards(env.DB);

  await cards.create({
    id,
    sessionId: typeof sessionId === "string" ? sessionId : null,
    userId: u?.id || null,
    category: category.slice(0, 80),
    score: Math.trunc(score),
    won: !!won,
    grid: grid.slice(0, 1024),
  });

  const origin = env.PUBLIC_ORIGIN || env.RP_ORIGIN || "https://t4bs.com";
  return json({ id, url: `${origin}/s/${id}` });
};
