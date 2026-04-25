import { createEngine } from "../../../shared/engine.js";
import { d1Puzzles, d1Sessions } from "../../_shared/d1.js";
import { json, error } from "../../_shared/util.js";

export const onRequestGet = async ({ params, env }) => {
  const engine = createEngine({ puzzles: d1Puzzles(env.DB), sessions: d1Sessions(env.DB) });
  const r = await engine.resumeSession(params.id);
  return r.error ? error(r.error, 404) : json(r);
};
