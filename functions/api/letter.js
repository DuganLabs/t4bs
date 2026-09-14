import { json, error, readJson } from "../_shared/util.js";
import { gameEngine, withDaily } from "../_shared/game.js";

/* POST /api/letter  { sessionId, letter }
   One letter against the whole phrase. The engine decides hit/miss/repeat
   and whether that ended the round; a finished daily gets its refreshed
   streak attached by withDaily on the same response. */
export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  if (!body.sessionId || typeof body.letter !== "string") {
    return error("bad-request", 400);
  }
  const r = await gameEngine(env).guessLetter(body.sessionId, body.letter);
  if (r.error) return error(r.error, 400);
  return json(await withDaily(request, env, r));
};
