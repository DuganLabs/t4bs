import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { json, error, readJson, setCookie, SESSION_COOKIE } from "../../_shared/util.js";
import { rp, stores, bytesToB64u } from "../../_shared/webauthn.js";

const SESSION_TTL_DAYS = 30;

export const onRequestPost = async ({ request, env }) => {
  const body = await readJson(request);
  const attestation = body.attestation;
  if (!attestation) return error("missing-attestation", 400);

  const { rpID, origin } = rp(env);
  const { credentials, challenges, userSessions } = stores(env);

  // Pull challenge from the response and consume it
  const challengeFromResponse = attestation.response?.clientDataJSON
    ? JSON.parse(atob(attestation.response.clientDataJSON.replace(/-/g,"+").replace(/_/g,"/"))).challenge
    : null;
  if (!challengeFromResponse) return error("bad-challenge", 400);

  const ch = await challenges.consume(challengeFromResponse, "register");
  if (!ch) return error("challenge-not-found", 400);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: attestation,
      expectedChallenge: challengeFromResponse,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (e) {
    return error(`verification-failed: ${e.message}`, 400);
  }

  if (!verification.verified || !verification.registrationInfo) return error("not-verified", 400);

  const ri = verification.registrationInfo;
  const credId = ri.credential?.id || ri.credentialID;
  const pubKey = ri.credential?.publicKey || ri.credentialPublicKey;

  await credentials.create({
    id: typeof credId === "string" ? credId : bytesToB64u(credId),
    userId: ch.userId,
    publicKey: bytesToB64u(pubKey),
    counter: ri.credential?.counter ?? ri.counter ?? 0,
    transports: attestation.response?.transports || undefined,
  });

  const sessId = crypto.randomUUID();
  await userSessions.create({ id: sessId, userId: ch.userId, ttlSeconds: SESSION_TTL_DAYS * 86400 });

  return json({ ok: true }, 200, {
    "Set-Cookie": setCookie(SESSION_COOKIE, sessId, { maxAgeSeconds: SESSION_TTL_DAYS * 86400 }),
  });
};
