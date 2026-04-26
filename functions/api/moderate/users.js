import { json, requireAdmin } from "../../_shared/util.js";
import { d1Users } from "../../_shared/d1.js";

/* GET /api/moderate/users
   ?q=<search>            search handles (LIKE %q%)
   ?roles=moderator,admin list users with elevated roles (default: all elevated)
*/
export const onRequestGet = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const rolesParam = (url.searchParams.get("roles") || "").trim();

  const users = d1Users(env.DB);

  if (q) return json(await users.search(q, 25));

  const roles = rolesParam
    ? rolesParam.split(",").map(s => s.trim()).filter(Boolean)
    : ["moderator", "admin"];
  return json(await users.listByRoles(roles, 100));
};
