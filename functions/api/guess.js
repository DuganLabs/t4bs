import { json, error, readJson } from "../_shared/util.js";
import { gameEngine, withDaily } from "../_shared/game.js";

export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  if (!body.sessionId || typeof body.wordIndex !== "number" || !Array.isArray(body.letters)) {
    return error("bad-request", 400);
  }
  const engine = gameEngine(env);
  const r = await engine.submitGuess(
    body.sessionId,
    body.wordIndex,
    body.letters.map(c => String(c).toUpperCase()),
    body.wagers || [],
  );
  if (r.error) return error(r.error, 400);
  /* A finished daily was just recorded by the engine's onFinish hook —
     withDaily hands the fresh streak back on the same response. */
  return json(await withDaily(request, env, r));
};
