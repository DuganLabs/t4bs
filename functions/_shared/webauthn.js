/* WebAuthn helpers shared between auth endpoints. */

import { d1Users, d1Credentials, d1Challenges, d1UserSessions } from "./d1.js";

export function rp(env) {
  return {
    rpName: env.RP_NAME || "TABS",
    rpID:   env.RP_ID   || "localhost",
    origin: env.RP_ORIGIN || "http://localhost:8788",
  };
}

const HANDLE_RX = /^[a-z0-9_-]{2,24}$/;

export function normHandle(h) {
  return String(h || "").trim().toLowerCase();
}
export function validHandle(h) {
  return HANDLE_RX.test(h);
}

/* base64url ↔ bytes */
export function b64uToBytes(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToB64u(bytes) {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function userIdBytes(uuid) {
  // pack the uuid (hex with dashes) to 16 bytes
  const hex = uuid.replace(/-/g, "");
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.substr(i*2, 2), 16);
  return out;
}

export function stores(env) {
  return {
    users:        d1Users(env.DB),
    credentials:  d1Credentials(env.DB),
    challenges:   d1Challenges(env.DB),
    userSessions: d1UserSessions(env.DB),
  };
}
