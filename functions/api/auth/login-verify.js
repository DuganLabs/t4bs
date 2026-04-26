import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { json, error, readJson, setCookie, SESSION_COOKIE, seedAdminRole } from "../../_shared/util.js";
import { rp, stores, b64uToBytes } from "../../_shared/webauthn.js";
import { d1Users } from "../../_shared/d1.js";

const SESSION_TTL_DAYS = 30;

export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  const assertion = body.assertion;
  if (!assertion?.id) return error("missing-assertion", 400);

  const { rpID, origin } = rp(env);
  const { credentials, challenges, userSessions } = stores(env);

  const challengeFromResponse = JSON.parse(
    atob(assertion.response.clientDataJSON.replace(/-/g,"+").replace(/_/g,"/"))
  ).challenge;

  const ch = await challenges.consume(challengeFromResponse, "authenticate");
  if (!ch) return error("challenge-not-found", 400);

  const cred = await credentials.getById(assertion.id);
  if (!cred) return error("credential-not-found", 404);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: challengeFromResponse,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.id,
        publicKey: b64uToBytes(cred.publicKey),
        counter: cred.counter,
        transports: cred.transports,
      },
      requireUserVerification: false,
    });
  } catch (e) {
    return error(`verification-failed: ${e.message}`, 400);
  }

  if (!verification.verified) return error("not-verified", 400);

  const newCounter = verification.authenticationInfo?.newCounter ?? cred.counter;
  await credentials.updateCounter(cred.id, newCounter);

  const sessId = crypto.randomUUID();
  await userSessions.create({ id: sessId, userId: cred.userId, ttlSeconds: SESSION_TTL_DAYS * 86400 });

  // Seed admin role for handles in ADMIN_HANDLES on first login post-deploy.
  const u = await d1Users(env.DB).getById(cred.userId);
  await seedAdminRole(env, u);

  return json({ ok: true }, 200, {
    "Set-Cookie": setCookie(SESSION_COOKIE, sessId, { maxAgeSeconds: SESSION_TTL_DAYS * 86400 }),
  });
};
