import { json, error, readJson } from "../../_shared/util.js";
import { adapter } from "../../_shared/webauthn.js";

export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  const auth = adapter(env);
  const result = await auth.getAuthenticationOptions(body.handle);

  if (result.error) return error(result.error, result.status ?? 400);
  return json(result.options);
};
