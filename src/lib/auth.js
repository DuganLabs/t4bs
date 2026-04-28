/* Browser-side passkey helpers + a dev-mode fallback when WebAuthn isn't available. */

import {
  isPasskeySupported,
  registerPasskey as baseRegisterPasskey,
  loginPasskey as baseLoginPasskey,
  me,
} from "@basenative/auth-webauthn/client";
import { api } from "./api.js";

export { isPasskeySupported };

export async function registerPasskey(handle) {
  return await baseRegisterPasskey(handle, {
    paths: {
      registerOptions: "/api/auth/register-options",
      registerVerify: "/api/auth/register-verify",
      me: "/api/auth/me",
    },
  });
}

export async function loginPasskey(handle) {
  return await baseLoginPasskey(handle, {
    paths: {
      loginOptions: "/api/auth/login-options",
      loginVerify: "/api/auth/login-verify",
      me: "/api/auth/me",
    },
  });
}

/* Dev-only: skip WebAuthn entirely and just set a session cookie. The mock
   API exposes /auth/dev-login; the production endpoint does not. */
export async function devLogin(handle) {
  await api.devLogin(handle);
  return await me({
    paths: { me: "/api/auth/me" },
  });
}
