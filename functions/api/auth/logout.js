import { json } from "../../_shared/util.js";
import { adapter } from "../../_shared/webauthn.js";

export const onRequestPost = async ({ request, env }) => {
  const auth = adapter(env);
  const cookieValue = request.headers.get("cookie")
    ? (() => {
      const c = request.headers.get("cookie") || "";
      const m = c.match(new RegExp(`(?:^|; )${auth.cookieName}=([^;]*)`));
      return m ? decodeURIComponent(m[1]) : null;
    })()
    : null;

  if (cookieValue) await auth.destroySession(cookieValue);
  return json({ ok: true }, 200, { "Set-Cookie": auth.cookie.clear() });
};
