/* Top-level middleware: BaseNative SSR dispatch (default) + ?legacy=1
   escape + security headers + no-store for API responses. */

import { shouldRenderSsr } from "../src/bn/route-table.js";
import { renderSsr } from "./_shared/ssr.js";

export const onRequest = async (ctx) => {
  const { request, next } = ctx;
  const url = new URL(request.url);

  // SSR is the default. `?legacy=1` is the escape hatch back to the
  // static SPA at dist/index.html. We only intercept GET — POSTs to
  // /api/* must flow through Functions.
  if (request.method === "GET" && shouldRenderSsr(url.pathname, url.searchParams)) {
    try {
      return decorate(await renderSsr(ctx), url);
    } catch (err) {
      // Surface the error in logs so it can actually be debugged. The
      // user reported reload as broken because the previous middleware
      // silently swallowed every SSR exception and fell through to the
      // static SPA, which can't initialize on deep routes. Now we log
      // and serve a 500 page rendered from the same SSR pipeline; the
      // SPA boots from there and recovers via client-side routing.
      try { console.error("SSR error", err?.stack || err); } catch { /* ignore */ }
      return decorate(await renderError(ctx, err), url);
    }
  }

  const res = await next();
  return decorate(res, url);
};

/** Render a graceful 500 page through the same template pipeline. */
async function renderError(ctx, err) {
  // Lazy-import so a bug inside renderSsr's imports can't shadow this
  // safety net.
  const { renderPage } = await import("../src/bn/server/render.js");
  const { loadAssets } = await import("../src/bn/server/manifest.js");
  const url = new URL(ctx.request.url);
  const assets = await loadAssets(ctx.env, url).catch(() => ({ js: "/src/main.js", css: [] }));
  const html = renderPage({
    route: "not-found",
    pathname: url.pathname,
    user: null,
    error: String(err?.message || err || "render failed"),
    lobby: null,
    play: null,
    submit: { existingCategories: [] },
    moderate: { pending: null, forbidden: false },
    admin: { elevated: null, currentHandle: null, forbidden: false },
  }, assets);
  return new Response(html, {
    status: 500,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-T4BS-SSR": "bn-error",
    },
  });
}

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
