/* HTTP helpers + auth context for Cloudflare Pages Functions. */

import { d1Users } from "./d1.js";
import { adapter } from "./webauthn.js";

export const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });

export const error = (message, status = 400, extra = {}, extraHeaders = {}) =>
  json({ error: message, ...extra }, status, extraHeaders);

export async function readJson(request) {
  try { return await request.json(); }
  catch { return {}; }
}

export async function currentUser(request, env) {
  const auth = adapter(env);
  return await auth.currentUser(request);
}

/* ─── Roles ─────────────────────────────────────────────────────
   user.role ∈ {'user','moderator','admin'}
   admin implies moderator. ADMIN_HANDLES is a seed list — when one of
   those handles authenticates and their DB role is below 'admin',
   `seedAdminRole` upgrades them. Set in [vars] in wrangler.toml. */

export function getRole(user)        { return user?.role || "user"; }
export function isAdmin(user)        { return getRole(user) === "admin"; }
export function isModerator(user)    { const r = getRole(user); return r === "admin" || r === "moderator"; }

export function adminHandles(env) {
  return (env.ADMIN_HANDLES || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function seedAdminRole(env, user) {
  if (!user) return user;
  if (user.role === "admin") return user;
  if (!adminHandles(env).includes(user.handle.toLowerCase())) return user;
  await d1Users(env.DB).setRole(user.id, "admin", "seed:ADMIN_HANDLES");
  return { ...user, role: "admin" };
}

export async function requireUser(request, env) {
  const u = await currentUser(request, env);
  if (!u) return { error: error("auth-required", 401) };
  return { user: u };
}

export async function requireModerator(request, env) {
  const r = await requireUser(request, env);
  if (r.error) return r;
  if (!isModerator(r.user)) return { error: error("moderator-only", 403) };
  return r;
}

export async function requireAdmin(request, env) {
  const r = await requireUser(request, env);
  if (r.error) return r;
  if (!isAdmin(r.user)) return { error: error("admin-only", 403) };
  return r;
}

/* ─── Player identity for the daily ─────────────────────────────────
   Tabs is account-optional, so the daily can't key off a user id alone.
   A signed-in player is `u:<user id>`; everyone else gets a random
   httpOnly id in a long-lived `t4bs_pid` cookie and is `a:<uuid>`.
   Clearing cookies resets the streak — that's the honest trade for not
   forcing an account, and signing in upgrades the key permanently. */

export const PLAYER_COOKIE = "t4bs_pid";

/** @param {Request} request @param {string} name */
export function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve the stable key this request's daily results hang off.
 * Returns `setCookie` when a fresh anonymous id had to be minted —
 * callers must pass it through to `json(..., { "Set-Cookie": ... })`.
 *
 * @param {Request} request
 * @param {any} env
 * @returns {Promise<{ key: string, setCookie: string | null, user: any }>}
 */
export async function playerIdentity(request, env) {
  let user = null;
  try { user = await currentUser(request, env); } catch { /* signed out or auth unavailable */ }
  if (user?.id) return { key: `u:${user.id}`, setCookie: null, user };

  const existing = readCookie(request, PLAYER_COOKIE);
  if (existing && UUID_RE.test(existing)) return { key: `a:${existing}`, setCookie: null, user };

  const id = crypto.randomUUID();
  // Secure is conditional so `wrangler pages dev` over plain http can
  // still set it; production is https and gets the flag.
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return {
    key: `a:${id}`,
    setCookie: `${PLAYER_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${60 * 60 * 24 * 400}`,
    user,
  };
}
