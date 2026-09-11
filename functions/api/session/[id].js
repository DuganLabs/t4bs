import { json, error } from "../../_shared/util.js";
import { gameEngine } from "../../_shared/game.js";

export const onRequestGet = async ({ params, env }) => {
  const r = await gameEngine(env).resumeSession(params.id);
  return r.error ? error(r.error, 404) : json(r);
};
