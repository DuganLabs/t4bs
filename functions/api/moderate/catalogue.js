import { json, requireModerator } from "../../_shared/util.js";
import { d1Puzzles } from "../../_shared/d1.js";

/* GET /api/moderate/catalogue — every approved puzzle WITH its phrase,
   grouped by the client (src/lib/game.js groupCatalogue).

   This is the list the home page used to show as "categories" with
   numbered "rounds" — a list of things the player could not see the
   content of, on a page whose only job is today's puzzle. It is a
   moderator's surface: the people who approve phrases need to see what
   is in each category, phrased how, submitted by whom. Moderators
   already read every pending phrase in the queue, so showing them the
   approved ones adds nothing they could not see before. */
export const onRequestGet = async ({ request, env }) => {
  const auth = await requireModerator(request, env);
  if (auth.error) return auth.error;
  return json(await d1Puzzles(env.DB).listApprovedWithPhrases());
};
