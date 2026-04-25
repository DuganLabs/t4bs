import { createEngine } from "../../shared/engine.js";
import { d1Puzzles, d1Sessions } from "../_shared/d1.js";
import { json, error, readJson } from "../_shared/util.js";

export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  const engine = createEngine({ puzzles: d1Puzzles(env.DB), sessions: d1Sessions(env.DB) });
  const r = await engine.allIn(body.sessionId, body.wordsGuess);
  return r.error ? error(r.error, 400) : json(r);
};
