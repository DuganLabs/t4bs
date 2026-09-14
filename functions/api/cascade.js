import { json, error, readJson } from "../_shared/util.js";
import { gameEngine, withDaily } from "../_shared/game.js";

/* POST /api/cascade { sessionId, wordIndex, letterIndex } — spend an earned
   token to reveal one tile. A reveal can complete the phrase, so the daily
   snapshot rides along the same way /guess's does. */
export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  const r = await gameEngine(env).spendCascade(body.sessionId, body.wordIndex, body.letterIndex);
  return r.error ? error(r.error, 400) : json(await withDaily(request, env, r));
};
