/* Top-level middleware: SSR dispatch (?next=1) + security headers +
   no-store for API responses. */

import { shouldRenderNext } from "../src/next/route-table.js";
import { renderSsr } from "./_shared/ssr.js";

export const onRequest = async (ctx) => {
  const { request, next } = ctx;
  const url = new URL(request.url);

  // ── SSR path: ?next=1 on a routable view ─────────────────────────────
  // Only intercept GET — POSTs to /api/* must still flow through Functions.
  if (request.method === "GET" && shouldRenderNext(url.pathname, url.searchParams)) {
    try {
      const ssr = await renderSsr(ctx);
      if (ssr) return decorate(ssr, url);
    } catch {
      // Hard fall-through: any SSR exception should NEVER serve a broken
      // page — let the static SPA take the request instead.
    }
  }

  const res = await next();
  return decorate(res, url);
};

/** @param {Response} res @param {URL} url */
function decorate(res, url) {
  const headers = new Headers(res.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "publickey-credentials-get=(self), publickey-credentials-create=(self)");
  if (url.pathname.startsWith("/api/")) {
    headers.set("Cache-Control", "no-store");
  }
  return new Response(res.body, { status: res.status, headers });
}
