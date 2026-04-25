import { json } from "../../_shared/util.js";
import { currentUser, isAdmin } from "../../_shared/util.js";

export const onRequestGet = async ({ request, env }) => {
  const u = await currentUser(request, env);
  if (!u) return json({ user: null });
  return json({ user: { handle: u.handle, isAdmin: isAdmin(env, u) } });
};
