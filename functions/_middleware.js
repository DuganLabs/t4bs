/* Top-level middleware: security headers + no-store for API responses. */

export const onRequest = async ({ request, next }) => {
  const res = await next();
  const headers = new Headers(res.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "publickey-credentials-get=(self), publickey-credentials-create=(self)");
  if (new URL(request.url).pathname.startsWith("/api/")) {
    headers.set("Cache-Control", "no-store");
  }
  return new Response(res.body, { status: res.status, headers });
};
