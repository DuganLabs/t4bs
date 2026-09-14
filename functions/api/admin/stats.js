import { json, requireAdmin } from "../../_shared/util.js";
import { d1Stats } from "../../_shared/d1.js";
import { statsSummary } from "../../../shared/admin-stats.js";

/* GET /api/admin/stats — the table at the top of docs/PRD.md v2, live. */
export const onRequestGet = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  const stats = d1Stats(env.DB);
  const [totals, roundsByDay] = await Promise.all([stats.totals(), stats.roundsByDay(14)]);
  return json(statsSummary({ totals, roundsByDay }));
};
