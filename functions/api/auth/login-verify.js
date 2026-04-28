import { json, error, readJson, seedAdminRole } from "../../_shared/util.js";
import { adapter } from "../../_shared/webauthn.js";
import { d1Users } from "../../_shared/d1.js";

export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  const auth = adapter(env);
  const result = await auth.verifyAuthentication(body.assertion);

  if (result.error) return error(result.error, result.status ?? 400);

  // Seed admin role for handles in ADMIN_HANDLES on first login post-deploy.
  const u = await d1Users(env.DB).getById(result.userId);
  await seedAdminRole(env, u);

  return json({ ok: true }, 200, {
    "Set-Cookie": auth.cookie.set(result.token),
  });
};
