/* Browser-side passkey helpers + a dev-mode fallback when WebAuthn isn't available. */

import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { api } from "./api.js";

export const isPasskeySupported = () =>
  typeof window !== "undefined" &&
  !!window.PublicKeyCredential &&
  typeof window.PublicKeyCredential === "function";

export async function registerPasskey(handle) {
  const options = await api.registerOptions(handle);
  const attestation = await startRegistration({ optionsJSON: options });
  await api.registerVerify(attestation);
  return await api.me();
}

export async function loginPasskey(handle) {
  const options = await api.loginOptions(handle);
  const assertion = await startAuthentication({ optionsJSON: options });
  await api.loginVerify(assertion);
  return await api.me();
}

/* Dev-only: skip WebAuthn entirely and just set a session cookie. The mock
   API exposes /auth/dev-login; the production endpoint does not. */
export async function devLogin(handle) {
  await api.devLogin(handle);
  return await api.me();
}
