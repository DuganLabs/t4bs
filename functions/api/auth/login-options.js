import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { json, error, readJson } from "../../_shared/util.js";
import { rp, normHandle, validHandle, stores } from "../../_shared/webauthn.js";

export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  const handle = normHandle(body.handle);
  const { rpID } = rp(env);
  const { users, credentials, challenges } = stores(env);

  let allowCredentials;
  let userId = null;
  if (handle && validHandle(handle)) {
    const u = await users.getByHandle(handle);
    if (!u) return error("user-not-found", 404);
    userId = u.id;
    const creds = await credentials.listByUser(u.id);
    allowCredentials = creds.map(c => ({ id: c.id, transports: c.transports }));
  }

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials,
  });

  await challenges.create({ challenge: options.challenge, userId, purpose: "authenticate" });

  return json(options);
};
