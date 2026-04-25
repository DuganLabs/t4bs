import { generateRegistrationOptions } from "@simplewebauthn/server";
import { json, error, readJson } from "../../_shared/util.js";
import { rp, normHandle, validHandle, userIdBytes, stores } from "../../_shared/webauthn.js";

export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  const handle = normHandle(body.handle);
  if (!validHandle(handle)) return error("bad-handle", 400);

  const { users, credentials, challenges } = stores(env);
  const { rpName, rpID } = rp(env);

  // Get-or-create the user record (passkey-only, no password).
  let user = await users.getByHandle(handle);
  if (!user) user = await users.create({ id: crypto.randomUUID(), handle });

  // Avoid duplicate credentials on the same authenticator
  const existing = await credentials.listByUser(user.id);
  const excludeCredentials = existing.map(c => ({
    id: c.id,
    transports: c.transports,
  }));

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: userIdBytes(user.id),
    userName: handle,
    attestationType: "none",
    excludeCredentials,
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await challenges.create({ challenge: options.challenge, userId: user.id, purpose: "register" });

  return json(options);
};
