import { json, error, readJson, requireAdmin } from "../../_shared/util.js";
import { d1Users } from "../../_shared/d1.js";

const VALID_ROLES = ["user", "moderator", "admin"];

export const onRequestPost = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const body = await readJson(request);
  const { userId, role } = body || {};
  if (!userId || typeof userId !== "string") return error("bad-userId", 400);
  if (!VALID_ROLES.includes(role)) return error("bad-role", 400);

  const users = d1Users(env.DB);
  const target = await users.getById(userId);
  if (!target) return error("not-found", 404);

  // No-op if role already matches.
  if (target.role === role) return json({ ok: true, user: target, changed: false });

  await users.setRole(userId, role, auth.user.handle);
  const updated = await users.getById(userId);
  return json({ ok: true, user: updated, changed: true });
};
