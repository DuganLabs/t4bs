import { json, error, readJson } from "../../_shared/util.js";
import { adapter } from "../../_shared/webauthn.js";

export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  const auth = adapter(env);
  const result = await auth.verifyRegistration(body.attestation);

  if (result.error) return error(result.error, result.status ?? 400);

  return json({ ok: true }, 200, {
    "Set-Cookie": auth.cookie.set(result.token),
  });
};
