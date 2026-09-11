/* Response-hardening assertions for functions/_shared/security.js.

   Two jobs:

   1. The headers exist and say the right things. These assert the
      PROPERTY — "script-src allows the font-swap handler's hash",
      "frame-ancestors is 'none'" — by parsing the policy into a
      directive map, not by string-comparing a serialized header. A
      test that pins the exact string breaks every time the package
      reorders a directive, which trains people to update it without
      reading it.

   2. The inline-content hashes are not stale. This is the real risk of
      a hash-based CSP: edit the critical CSS and first paint silently
      goes unstyled in production while every local check still passes.
      Each hash below is recomputed from the artifact it claims to
      cover — the SSR templates as actually rendered, and the built
      dist/index.html — and the failure message prints the value to
      paste in. */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  harden,
  SSR_CRITICAL_STYLE_HASH,
  LEGACY_CRITICAL_STYLE_HASH,
  SHARE_PAGE_STYLE_HASH,
  SHARE_REDIRECT_SCRIPT_HASH,
  FONT_SWAP_HANDLER_HASH,
  KEYBOARD_WIDE_KEY_STYLE_HASH,
  ANALYTICS_REPORT_ORIGIN,
  ANALYTICS_SCRIPT_ORIGIN,
  FONT_CSS_ORIGIN,
  FONT_FILE_ORIGIN,
} from "../functions/_shared/security.js";
import { renderPage } from "../src/bn/server/render.js";

const ROOT = process.cwd();

const sha256 = (text) =>
  `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

/** Strip HTML comments, repeating until the string stops changing.
 *  A single pass can leave a bare `<!--` behind when comments nest or
 *  overlap, which is what CodeQL's js/incomplete-multi-character-
 *  sanitization flags. Nothing here is rendered, so it is a parsing
 *  nicety rather than an injection fix — but a half-stripped document
 *  is exactly how an extractor silently grabs the wrong block. */
function stripComments(html) {
  let prev;
  let out = html;
  do {
    prev = out;
    out = out.replace(/<!--[\s\S]*?-->/g, "");
  } while (out !== prev);
  return out;
}

/** The text between <style data-bn-critical> and </style>, HTML comments
 *  stripped first (index.html's comment quotes the tag name).
 *
 *  Tag matching throughout this file is case-insensitive and tolerates
 *  anything HTML allows between an end tag's name and its `>` — so
 *  `<SCRIPT>`, `</script >` and `</script foo=bar>` all match, which is
 *  how a browser parses them.
 *
 *  That thoroughness is the point, not pedantry. These extractors feed
 *  assertions of the form "the shell ships no inline script this policy
 *  has not hashed". A pattern that fails to match does not fail the
 *  test — it reports success and moves on, which is the one failure
 *  mode a drift guard cannot have. */
function criticalStyle(html, label) {
  const m = stripComments(html).match(/<style data-bn-critical\s*>([\s\S]*?)<\/style[^>]*>/i);
  assert.ok(m, `${label}: no <style data-bn-critical> block found`);
  return m[1];
}

/** Parse a Content-Security-Policy header into directive -> source list. */
function parseCsp(header) {
  const out = {};
  for (const part of header.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) out[name] = sources;
  }
  return out;
}

const SSR_ROUTES = ["lobby", "play", "submit", "moderate", "admin", "not-found"];

const SSR_CONTEXT = {
  pathname: "/",
  user: null,
  error: null,
  lobby: null,
  daily: null,
  play: null,
  submit: { existingCategories: [] },
  moderate: { pending: null, forbidden: false },
  admin: { elevated: null, currentHandle: null, forbidden: false },
};
const SSR_ASSETS = { js: "/assets/bn-hydrate.js", css: ["/assets/play-boot.css"] };

describe("security headers", () => {
  let csp;
  let headers;

  before(() => {
    const res = harden(new Response("<!doctype html>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }), { request: new Request("https://t4bs.com/") });
    headers = res.headers;
    csp = parseCsp(headers.get("content-security-policy") ?? "");
  });

  it("sets the headers t4bs was missing, and keeps the ones it had", () => {
    // The gap this change closes: t4bs was the only DuganLabs site with
    // neither a CSP nor a COOP.
    assert.ok(headers.get("content-security-policy"), "Content-Security-Policy must be set");
    assert.equal(headers.get("cross-origin-opener-policy"), "same-origin");

    // Pre-existing headers must survive the migration off the
    // hand-rolled decorate().
    assert.equal(headers.get("x-content-type-options"), "nosniff");
    assert.equal(headers.get("x-frame-options"), "DENY");
    assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.match(headers.get("strict-transport-security") ?? "", /max-age=31536000/);
    assert.match(headers.get("strict-transport-security") ?? "", /includeSubDomains/);
  });

  it("keeps WebAuthn usable through Permissions-Policy", () => {
    // Omitting these blocks passkey sign-in outright.
    const pp = headers.get("permissions-policy") ?? "";
    assert.match(pp, /publickey-credentials-get=\(self\)/);
    assert.match(pp, /publickey-credentials-create=\(self\)/);
    // And the baseline's denials are still standing.
    assert.match(pp, /camera=\(\)/);
    assert.match(pp, /geolocation=\(\)/);
  });

  it("does not let product sources erode the baseline", () => {
    // The whole point of merging rather than replacing: adding a font
    // host must not drop the deny-by-default directives.
    assert.deepEqual(csp["frame-ancestors"], ["'none'"]);
    assert.deepEqual(csp["object-src"], ["'none'"]);
    assert.deepEqual(csp["base-uri"], ["'self'"]);
    assert.deepEqual(csp["form-action"], ["'self'"]);
    assert.deepEqual(csp["default-src"], ["'self'"]);
    assert.ok("upgrade-insecure-requests" in csp);
  });

  it("allows exactly the origins t4bs actually loads", () => {
    assert.ok(csp["style-src"].includes(FONT_CSS_ORIGIN), "Google Fonts CSS origin");
    assert.ok(csp["font-src"].includes(FONT_FILE_ORIGIN), "Google Fonts woff2 origin");

    // Every fetch this app makes is same-origin /api/*; the one cross-origin
    // fetch (cdn.jsdelivr.net in functions/_shared/og.js) runs inside the
    // Worker, where CSP does not apply. The one remote origin is where the
    // Web Analytics beacon reports to.
    assert.deepEqual(csp["connect-src"], ["'self'", ANALYTICS_REPORT_ORIGIN]);

    // An allowlist, not "no remote origins at all" — that assertion was true
    // right up until the moment a remote origin was needed, and then it only
    // said so after the policy had already shipped. Name the hosts instead, so
    // an unintended one still fails and an intended one is a one-line diff.
    const ALLOWED_SCRIPT_ORIGINS = [ANALYTICS_SCRIPT_ORIGIN];
    const remote = csp["script-src"].filter((s) => s.startsWith("http"));
    assert.deepEqual(remote, ALLOWED_SCRIPT_ORIGINS,
      "script-src must allow exactly the third-party origins t4bs loads");
  });

  it("never falls back to unsafe-inline or unsafe-eval", () => {
    for (const directive of ["script-src", "style-src", "default-src"]) {
      assert.ok(!csp[directive].includes("'unsafe-inline'"),
        `${directive} must not use 'unsafe-inline'`);
      assert.ok(!csp[directive].includes("'unsafe-eval'"),
        `${directive} must not use 'unsafe-eval'`);
    }
  });

  it("authorizes the font-swap handler with unsafe-hashes, scoped to that one string", () => {
    // 'unsafe-hashes' permits only handler text matching a listed hash.
    assert.ok(csp["script-src"].includes("'unsafe-hashes'"));
    assert.ok(csp["script-src"].includes(FONT_SWAP_HANDLER_HASH));
  });

  it("never emits 'none' alongside other sources", () => {
    // CSP allows 'none' only as a sole source expression. The package
    // merges rather than replaces, so asking for extra sources on a
    // directive the baseline set to 'none' produces a list Chromium
    // rejects with a console error on EVERY response. style-src-attr
    // is therefore removed outright and falls back to style-src.
    for (const [name, sources] of Object.entries(csp)) {
      if (sources.includes("'none'")) {
        assert.equal(sources.length, 1,
          `${name} lists 'none' with other sources; browsers ignore the 'none' and log an error`);
      }
    }
  });

  it("keeps /api/* out of shared caches", () => {
    const api = harden(new Response("{}", {
      headers: { "Content-Type": "application/json" },
    }), { request: new Request("https://t4bs.com/api/lobby") });
    assert.equal(api.headers.get("cache-control"), "no-store");

    // And leaves other routes' own caching alone.
    const share = harden(new Response("<!doctype html>", {
      headers: { "Content-Type": "text/html", "Cache-Control": "public, max-age=300" },
    }), { request: new Request("https://t4bs.com/s/abcd") });
    assert.equal(share.headers.get("cache-control"), "public, max-age=300");
  });

  it("preserves status and body of the response it hardens", () => {
    const res = harden(new Response("hello", { status: 404, statusText: "Not Found" }));
    assert.equal(res.status, 404);
    assert.equal(res.statusText, "Not Found");
  });
});

describe("inline-content hashes are current", () => {
  it("covers the SSR critical-CSS block on every route", () => {
    for (const route of SSR_ROUTES) {
      const html = renderPage({ ...SSR_CONTEXT, route }, SSR_ASSETS);
      const actual = sha256(criticalStyle(html, `SSR route ${route}`));
      assert.equal(
        actual, SSR_CRITICAL_STYLE_HASH,
        `SSR_CRITICAL_STYLE_HASH is stale for route "${route}".\n` +
          `  src/bn/views/layout.js changed; set it to: ${actual}`,
      );
    }
  });

  it("covers only executable inline scripts, and there are none", () => {
    // JSON-LD and #bn-ssr-state are data blocks, not scripts: CSP does
    // not govern them, which is why no hash covers them. If a real
    // inline <script> ever appears in the SSR shell it needs a hash,
    // so fail loudly here rather than in a browser console.
    // stripComments first: an HTML comment that merely mentions a <script>
    // tag is not a script, and this scanner used to read one as an unhashed
    // inline block whose body ran to the next real </script>.
    const html = stripComments(renderPage({ ...SSR_CONTEXT, route: "lobby" }, SSR_ASSETS));
    for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script[^>]*>/gi)) {
      const attrs = m[1];
      const isDataBlock = /type\s*=\s*["']application\/(ld\+)?json["']/.test(attrs);
      const isExternal = /\ssrc\s*=/.test(attrs);
      assert.ok(
        isDataBlock || isExternal,
        `unhashed executable inline <script${attrs}> in the SSR shell — ` +
          `add ${sha256(m[2])} to script-src in functions/_shared/security.js`,
      );
    }
  });

  it("covers every event-handler attribute the SSR shell emits", () => {
    const html = renderPage({ ...SSR_CONTEXT, route: "lobby" }, SSR_ASSETS);
    const handlers = new Set(
      [...html.matchAll(/\son[a-z]+\s*=\s*"([^"]*)"/gi)].map((m) => m[1]),
    );
    assert.deepEqual([...handlers], ["this.media='all'"],
      "a new inline event handler appeared; 'unsafe-hashes' only covers hashes listed in script-src");
    assert.equal(sha256("this.media='all'"), FONT_SWAP_HANDLER_HASH);
  });

  it("covers the share landing's style block and redirect script", () => {
    const src = readFileSync(join(ROOT, "functions/s/[id].js"), "utf8");

    const style = src.match(/const PAGE_STYLE = `([\s\S]*?)`;/);
    assert.ok(style, "PAGE_STYLE not found in functions/s/[id].js");
    const styleHash = sha256(style[1]);
    assert.equal(styleHash, SHARE_PAGE_STYLE_HASH,
      `SHARE_PAGE_STYLE_HASH is stale; set it to: ${styleHash}`);

    const script = src.match(/<script\s*>([\s\S]*?)<\/script[^>]*>/i);
    assert.ok(script, "redirect <script> not found in functions/s/[id].js");
    const scriptHash = sha256(script[1]);
    assert.equal(scriptHash, SHARE_REDIRECT_SCRIPT_HASH,
      `SHARE_REDIRECT_SCRIPT_HASH is stale; set it to: ${scriptHash}`);

    // The redirect script must stay a compile-time constant — a hash
    // cannot cover a body that varies per response.
    assert.ok(!script[1].includes("${"),
      "the redirect script interpolates a value; no hash can cover it");
  });

  it("covers every style attribute @basenative/keyboard emits", async () => {
    /* The one style="" attribute on the play route comes from inside a
       dependency, not from this repo — `style="flex:1.5;"` on the two
       wide keys. Nothing here changes when the package bumps its span
       value, so without this test a keyboard upgrade would collapse
       ENTER and BACKSPACE to single-key width in production with every
       local check still green. Render the real thing and require the
       policy to cover whatever it emits. */
    const { renderKeyboard } = await import("@basenative/keyboard");
    const html = renderKeyboard({ layout: "qwerty", primary: "ENTER" });
    const emitted = new Set([...html.matchAll(/\sstyle="([^"]*)"/gi)].map((m) => m[1]));

    assert.ok(emitted.size > 0, "keyboard emitted no style attribute — has the package changed shape?");
    for (const value of emitted) {
      const h = sha256(value);
      assert.equal(
        h, KEYBOARD_WIDE_KEY_STYLE_HASH,
        `@basenative/keyboard now emits style="${value}", which the CSP does not allow.\n` +
          `  add to style-src in functions/_shared/security.js: ${h}`,
      );
    }
  });

  it("covers the built legacy shell's critical-CSS block", () => {
    // Built, not source: vite owns dist/index.html, and if it ever
    // starts minifying inline <style> the hash must follow the output
    // the browser actually sees.
    execSync("npm run build --silent", { cwd: ROOT, stdio: "pipe" });
    const dist = readFileSync(join(ROOT, "dist/index.html"), "utf8");
    const actual = sha256(criticalStyle(dist, "dist/index.html"));
    assert.equal(
      actual, LEGACY_CRITICAL_STYLE_HASH,
      `LEGACY_CRITICAL_STYLE_HASH is stale.\n  set it to: ${actual}`,
    );
  });
});
