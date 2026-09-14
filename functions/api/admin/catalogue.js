import { json, requireAdmin } from "../../_shared/util.js";
import { d1Puzzles } from "../../_shared/d1.js";
import { catalogueRow } from "../../../shared/admin-stats.js";

/* GET /api/admin/catalogue — every puzzle with plays, wins, win rate,
   average winning score and effective par (docs/PRD.md §4.1). */
export const onRequestGet = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  const rows = await d1Puzzles(env.DB).listAllWithStats();
  return json(rows.map(catalogueRow));
};
