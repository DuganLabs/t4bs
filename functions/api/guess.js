import { createEngine } from "../../shared/engine.js";
import { d1Puzzles, d1Sessions } from "../_shared/d1.js";
import { json, error, readJson } from "../_shared/util.js";

export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  if (!body.sessionId || typeof body.wordIndex !== "number" || !Array.isArray(body.letters)) {
    return error("bad-request", 400);
  }
  const engine = createEngine({ puzzles: d1Puzzles(env.DB), sessions: d1Sessions(env.DB) });
  const r = await engine.submitGuess(
    body.sessionId,
    body.wordIndex,
    body.letters.map(c => String(c).toUpperCase()),
    body.wagers || [],
  );
  return r.error ? error(r.error, 400) : json(r);
};
