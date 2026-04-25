import { createEngine } from "../../shared/engine.js";
import { d1Puzzles, d1Sessions } from "../_shared/d1.js";
import { json } from "../_shared/util.js";

export const onRequestGet = async ({ env }) => {
  const engine = createEngine({ puzzles: d1Puzzles(env.DB), sessions: d1Sessions(env.DB) });
  return json(await engine.listPuzzles());
};
