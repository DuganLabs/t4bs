/* HTTP helpers + auth context for Cloudflare Pages Functions. */

import { d1Users, d1UserSessions } from "./d1.js";

export const SESSION_COOKIE = "t4bs_sess";

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

export function getCookie(request, name) {
  const c = request.headers.get("cookie") || "";
  const m = c.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function setCookie(name, value, opts = {}) {
  const parts = [`${name}=${value}`, `Path=/`, `HttpOnly`, `SameSite=Lax`];
  if (opts.secure !== false) parts.push("Secure");
  if (opts.maxAgeSeconds) parts.push(`Max-Age=${opts.maxAgeSeconds}`);
  return parts.join("; ");
}

export function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`;
}

export async function currentUser(request, env) {
  const tok = getCookie(request, SESSION_COOKIE);
  if (!tok) return null;
  const sessions = d1UserSessions(env.DB);
  return await sessions.getUser(tok);
}

export function isAdmin(env, user) {
  if (!user) return false;
  const list = (env.ADMIN_HANDLES || "").split(",").map(s => s.trim().toLowerCase());
  return list.includes(user.handle.toLowerCase());
}

export async function requireUser(request, env) {
  const u = await currentUser(request, env);
  if (!u) return { error: error("auth-required", 401) };
  return { user: u };
}

export async function requireAdmin(request, env) {
  const r = await requireUser(request, env);
  if (r.error) return r;
  if (!isAdmin(env, r.user)) return { error: error("admin-only", 403) };
  return r;
}
