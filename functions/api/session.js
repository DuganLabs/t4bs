import { json, error, readJson, playerIdentity } from "../_shared/util.js";
import { gameEngine, dailyStatus } from "../_shared/game.js";

/* POST /api/session
     { mode: "daily" }            → today's puzzle, server-picked, once per day
     { puzzleId, mode: "free" }   → free play: any approved puzzle, unlimited,
                                    never recorded and never moves a streak

   The daily branch is the whole point of the change: the puzzle id is
   chosen here from the server's day key (midnight in DAILY_ZONE — see
   shared/daily.js), not accepted from the client, and a finished result
   for today is a 409 instead of a fresh round. */
export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  const who = await playerIdentity(request, env);
  const engine = gameEngine(env);
  const headers = who.setCookie ? { "Set-Cookie": who.setCookie } : {};

  if (body.mode === "daily") {
    const status = await dailyStatus(env, who.key);
    if (!status.puzzleId) return error("no-puzzles", 503, {}, headers);
    if (status.playedToday) {
      return json({ error: "daily-done", daily: status }, 409, headers);
    }
    const r = await engine.startSession(status.puzzleId, {
      mode: "daily",
      day: status.day,
      playerKey: who.key,
    });
    return r.error ? error(r.error, 400, {}, headers) : json({ ...r, daily: status }, 200, headers);
  }

  const r = await engine.startSession(body.puzzleId, { mode: "free", playerKey: who.key });
  return r.error ? error(r.error, 400, {}, headers) : json(r, 200, headers);
};
