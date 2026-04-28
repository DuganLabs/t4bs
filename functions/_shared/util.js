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

export const error = (message, status = 400, extra = {}) => json({ error: message, ...extra }, status);

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
