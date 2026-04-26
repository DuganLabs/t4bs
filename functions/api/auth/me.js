import { json, currentUser, isAdmin, isModerator, getRole } from "../../_shared/util.js";

export const onRequestGet = async ({ request, env }) => {
  const u = await currentUser(request, env);
  if (!u) return json({ user: null });
  return json({
    user: {
      handle: u.handle,
      role: getRole(u),
      isAdmin: isAdmin(u),
      isModerator: isModerator(u),
    },
  });
};
