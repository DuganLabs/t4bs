/* SSR smoke tests — exercise the escape helpers, route table, and the
   per-route render orchestrator without a worker or DOM. Run with:
     node --test src/next/next.test.js */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { esc, escJson, join } from "./util/escape.js";
import { matchRoute, shouldRenderNext } from "./route-table.js";
import { renderPage } from "./server/render.js";

const ASSETS = { js: "/assets/next-hydrate.js", css: ["/assets/app.css"] };

describe("esc", () => {
  it("escapes the five HTML-significant characters", () => {
    assert.equal(esc(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });
  it("coerces null/undefined to empty string", () => {
    assert.equal(esc(null), "");
    assert.equal(esc(undefined), "");
  });
});

describe("escJson", () => {
  it("escapes < > & so JSON can sit safely in a <script> tag", () => {
    const out = escJson({ x: "</script><b>" });
    assert.ok(!out.includes("</script>"), "raw </script> must not survive");
    assert.ok(out.includes("\\u003c"));
  });
  it("round-trips structurally via JSON.parse", () => {
    const obj = { a: 1, b: [2, 3], c: "ok" };
    assert.deepEqual(JSON.parse(escJson(obj).replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&")), obj);
  });
});

describe("join", () => {
  it("drops false / null / undefined", () => {
    assert.equal(join("a", false, null, "b", undefined, "c"), "abc");
  });
  it("flattens nested arrays", () => {
    assert.equal(join(["a", ["b", "c"]], "d"), "abcd");
  });
});

describe("matchRoute", () => {
  it("maps known paths", () => {
    assert.equal(matchRoute("/"),         "lobby");
    assert.equal(matchRoute("/play"),     "play");
    assert.equal(matchRoute("/submit"),   "submit");
    assert.equal(matchRoute("/moderate"), "moderate");
    assert.equal(matchRoute("/admin"),    "admin");
  });
  it("normalizes trailing slashes", () => {
    assert.equal(matchRoute("/play/"), "play");
  });
  it("returns 'not-found' for unknowns", () => {
    assert.equal(matchRoute("/nope"), "not-found");
  });
});

describe("shouldRenderNext", () => {
  it("requires ?next=1", () => {
    assert.equal(shouldRenderNext("/", new URLSearchParams()), false);
    assert.equal(shouldRenderNext("/", new URLSearchParams("next=1")), true);
  });
  it("opts out for API/OG/share/asset paths", () => {
    const qs = new URLSearchParams("next=1");
    assert.equal(shouldRenderNext("/api/puzzles",   qs), false);
    assert.equal(shouldRenderNext("/og/default.png",qs), false);
    assert.equal(shouldRenderNext("/s/abc",         qs), false);
    assert.equal(shouldRenderNext("/assets/x.js",   qs), false);
    assert.equal(shouldRenderNext("/favicon.svg",   qs), false);
  });
});

const baseCtx = () => ({
  route: "lobby",
  pathname: "/",
  user: null,
  lobby: null,
  error: null,
  play: null,
  submit: { existingCategories: [] },
  moderate: { pending: null, forbidden: false },
  admin: { elevated: null, currentHandle: null, forbidden: false },
});

describe("renderPage — every route emits a complete HTML document", () => {
  for (const route of ["lobby", "play", "submit", "moderate", "admin", "not-found"]) {
    it(`route=${route}`, () => {
      const html = renderPage({ ...baseCtx(), route, pathname: route === "lobby" ? "/" : `/${route}` }, ASSETS);
      assert.ok(html.startsWith("<!DOCTYPE html>"));
      assert.ok(html.includes("</html>"));
      assert.ok(html.includes(`data-bn-view="${route}"`), `expected data-bn-view="${route}" marker`);
      assert.ok(html.includes(ASSETS.js), "hydration JS reference missing");
      assert.ok(html.includes("window.__T4BS_SSR__="), "SSR state hand-off missing");
      assert.ok(html.includes(`<script type="module" src="${ASSETS.js}">`));
    });
  }

  it("lobby renders puzzle groups when populated", () => {
    const ctx = {
      ...baseCtx(),
      lobby: [
        { id: 1, category: "PIZZA",     submittedBy: "wmd"   },
        { id: 2, category: "PIZZA",     submittedBy: "alice" },
        { id: 3, category: "ICE CREAM", submittedBy: "bob"   },
      ],
    };
    const html = renderPage(ctx, ASSETS);
    assert.ok(html.includes(">PIZZA<"));
    assert.ok(html.includes("2 puzzles"));
    assert.ok(html.includes("by bob"));
  });

  it("play with a session renders word lengths + anchor letters", () => {
    const ctx = {
      ...baseCtx(),
      route: "play",
      pathname: "/play",
      play: {
        id: 42,
        category: "ANIMALS",
        submittedBy: "wmd",
        words: [3, 4],
        totalLetters: 7,
        anchors: [{ wi: 0, li: 1, letter: "A" }],
      },
    };
    const html = renderPage(ctx, ASSETS);
    assert.ok(html.includes("ANIMALS"));
    assert.ok(html.includes("locked-green"));
    assert.ok(html.includes(`>A<`));
    assert.ok(html.includes(`data-bn-session-id="42"`));
  });

  it("moderate (forbidden) emits the gated shell instead of the queue", () => {
    const ctx = {
      ...baseCtx(),
      route: "moderate", pathname: "/moderate",
      moderate: { pending: null, forbidden: true },
    };
    const html = renderPage(ctx, ASSETS);
    assert.ok(html.includes("data-bn-forbidden=\"1\""));
    assert.ok(html.includes("Moderator access required"));
    assert.ok(!html.includes("APPROVE"), "approve button must not leak to non-mods");
  });

  it("admin rendered list shows promote/demote controls", () => {
    const ctx = {
      ...baseCtx(),
      route: "admin", pathname: "/admin",
      admin: {
        currentHandle: "wmd",
        forbidden: false,
        elevated: [
          { id: "u1", handle: "wmd",  role: "admin"     },
          { id: "u2", handle: "mary", role: "moderator" },
        ],
      },
    };
    const html = renderPage(ctx, ASSETS);
    assert.ok(html.includes(">wmd<"));
    // wmd is admin → shows "→ MOD" demote button + REMOVE
    assert.ok(html.includes("→ MOD"));
    // mary is moderator → only "MAKE ADMIN" + "REMOVE" available
    assert.ok(html.includes("MAKE ADMIN"));
    assert.ok(html.includes("REMOVE"));
  });

  it("escapes a hostile category string in the lobby list", () => {
    const ctx = {
      ...baseCtx(),
      lobby: [{ id: 1, category: '<script>alert(1)</script>', submittedBy: "x" }],
    };
    const html = renderPage(ctx, ASSETS);
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  });
});
