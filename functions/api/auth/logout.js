import { json, getCookie, clearCookie, SESSION_COOKIE } from "../../_shared/util.js";
import { d1UserSessions } from "../../_shared/d1.js";

export const onRequestPost = async ({ request, env }) => {
  const tok = getCookie(request, SESSION_COOKIE);
  if (tok) await d1UserSessions(env.DB).destroy(tok);
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie(SESSION_COOKIE) });
};
