import { json, error, readJson } from "../_shared/util.js";
import { gameEngine, withDaily } from "../_shared/game.js";

/* POST /api/solve  { sessionId, phrase }
   The whole phrase, typed. Right ends the round and scores; wrong costs a
   life and reveals nothing. The answer is compared server-side and only
   ever returned once the round is finished. */
export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  if (!body.sessionId || typeof body.phrase !== "string") {
    return error("bad-request", 400);
  }
  const r = await gameEngine(env).solve(body.sessionId, body.phrase);
  if (r.error) return error(r.error, 400);
  return json(await withDaily(request, env, r));
};
