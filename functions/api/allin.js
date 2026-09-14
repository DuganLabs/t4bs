import { json, error, readJson } from "../_shared/util.js";
import { gameEngine, withDaily } from "../_shared/game.js";

/* POST /api/allin { sessionId, wordsGuess } — the whole remaining phrase. */
export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  const r = await gameEngine(env).allIn(body.sessionId, body.wordsGuess);
  return r.error ? error(r.error, 400) : json(await withDaily(request, env, r));
};
