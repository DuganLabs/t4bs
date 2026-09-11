import { json, error, readJson } from "../_shared/util.js";
import { gameEngine } from "../_shared/game.js";

export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  const engine = gameEngine(env);
  const r = await engine.spendCascade(body.sessionId, body.wordIndex, body.letterIndex);
  return r.error ? error(r.error, 400) : json(r);
};
