import { json, requireAdmin } from "../../_shared/util.js";
import { d1Submissions } from "../../_shared/d1.js";

export const onRequestGet = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  return json(await d1Submissions(env.DB).listPending());
};
