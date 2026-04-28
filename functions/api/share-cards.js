/* POST /api/share-cards
   Mints a short opaque id for a finished session and stores card metadata.
   Auth not required (a finished session is shareable by whoever played it).
   Body: { sessionId, puzzleId, category, score, won, grid }
   Response: { id, url } where url is /s/{id} on PUBLIC_ORIGIN.

   puzzleId is what makes /s/{id} useful — recipients land on a redirect
   that auto-starts THE SAME puzzle, instead of being dumped on the lobby.
*/
import { json, error, readJson, currentUser } from "../_shared/util.js";
import { d1ShareCards } from "../_shared/d1.js";

const ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"; // unambiguous
const ID_LEN = 8;

/* Generate an unbiased ID from a 31-char alphabet using rejection
   sampling. Naive `byte % 31` biases the first 8 chars upward by ~3.1%
   each because 256 isn't a multiple of 31; the upper [248..255] range
   maps onto chars 0..7 a second time. We discard those bytes and pull
   more from `crypto.getRandomValues` until we have ID_LEN unbiased
   draws. The over-allocation by 4 bytes amortizes the rare reloop. */
function shortId() {
  const A = ID_ALPHABET.length;       // 31
  const REJECT = 256 - (256 % A);     // 248 — bytes >= REJECT are in the biased tail
  const out = new Array(ID_LEN);
  let filled = 0;
  while (filled < ID_LEN) {
    const buf = new Uint8Array(ID_LEN - filled + 4);
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && filled < ID_LEN; i++) {
      const b = buf[i];
      if (b >= REJECT) continue;
      out[filled++] = ID_ALPHABET[b % A];
    }
  }
  return out.join("");
}

export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  const { sessionId, puzzleId, category, score, won, grid } = body || {};

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
    puzzleId: typeof puzzleId === "number" ? puzzleId : null,
    category: category.slice(0, 80),
    score: Math.trunc(score),
    won: !!won,
    grid: grid.slice(0, 1024),
  });

  const origin = env.PUBLIC_ORIGIN || env.RP_ORIGIN || "https://t4bs.com";
  return json({ id, url: `${origin}/s/${id}` });
};
