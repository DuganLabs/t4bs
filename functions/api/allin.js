import { json, error, readJson } from "../_shared/util.js";
import { gameEngine, withDaily } from "../_shared/game.js";

export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  const engine = gameEngine(env);
  const r = await engine.allIn(body.sessionId, body.wordsGuess);
  if (r.error) return error(r.error, 400);
  return json(await withDaily(request, env, r));
};
