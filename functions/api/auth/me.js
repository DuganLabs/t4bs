import { json, isAdmin, isModerator, getRole } from "../../_shared/util.js";
import { adapter } from "../../_shared/webauthn.js";

export const onRequestGet = async ({ request, env }) => {
  const auth = adapter(env);
  const u = await auth.currentUser(request);
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
