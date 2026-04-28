/* WebAuthn helpers shared between auth endpoints.
   Now wraps @basenative/auth-webauthn for portability and reuse. */

import {
  webauthnAdapter,
  d1WebAuthnStores,
  normHandle,
  validHandle,
  b64uToBytes,
  bytesToB64u,
  userIdBytes,
} from "@basenative/auth-webauthn";

export function rp(env) {
  return {
    rpName: env.RP_NAME || "TABS",
    rpID:   env.RP_ID   || "localhost",
    origin: env.RP_ORIGIN || "http://localhost:8788",
  };
}

// Re-export helpers from @basenative/auth-webauthn
export { normHandle, validHandle, b64uToBytes, bytesToB64u, userIdBytes };

export function stores(env) {
  return d1WebAuthnStores(env.DB);
}

export function adapter(env) {
  return webauthnAdapter({
    rp: rp(env),
    stores: stores(env),
  });
}
