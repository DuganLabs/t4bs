/* GET /api/daily — the server's answer to "what is today's puzzle, and
   where does this player stand?". The client no longer picks the daily;
   it renders this. */

import { json, playerIdentity, visitorZone } from "../_shared/util.js";
import { dailyStatus } from "../_shared/game.js";

export const onRequestGet = async ({ request, env }) => {
  const who = await playerIdentity(request, env);
  /* The zone comes off `request.cf` (the edge's read of the visitor's
     location) and never off a param, header or body — see visitorZone(). */
  const status = await dailyStatus(env, who.key, { zone: visitorZone(request) });
  return json(status, 200, who.setCookie ? { "Set-Cookie": who.setCookie } : {});
};
