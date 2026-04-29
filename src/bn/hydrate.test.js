/* SSR pipeline tests for the BaseNative-driven render path.

   These exercise the templates + render orchestrator using the real
   @basenative/server `render()` — no jsdom required, the renderer
   parses HTML strings via node-html-parser. Run with:

     node --test src/bn/hydrate.test.js
*/

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { matchRoute, shouldRenderSsr } from "./route-table.js";
import { renderPage } from "./server/render.js";
import { decidePlayBoot, withTimeout, isResumable } from "./client/play-boot.js";

const ASSETS = { js: "/assets/bn-hydrate.js", css: ["/assets/app.css"] };

function baseCtx(overrides = {}) {
  return {
    route: "lobby",
    pathname: "/",
    user: null,
    error: null,
    lobby: null,
    play: null,
    submit: { existingCategories: [] },
    moderate: { pending: null, forbidden: false },
    admin: { elevated: null, currentHandle: null, forbidden: false },
    ...overrides,
  };
}

describe("matchRoute", () => {
  it("matches the canonical paths", () => {
    assert.equal(matchRoute("/"),         "lobby");
    assert.equal(matchRoute("/play"),     "play");
    assert.equal(matchRoute("/submit"),   "submit");
    assert.equal(matchRoute("/moderate"), "moderate");
    assert.equal(matchRoute("/admin"),    "admin");
  });

  it("normalizes trailing slashes", () => {
    assert.equal(matchRoute("/admin/"), "admin");
  });

  it("returns not-found for unknown paths", () => {
    assert.equal(matchRoute("/wat"),      "not-found");
    assert.equal(matchRoute("/play/123"), "not-found");
  });
});

describe("shouldRenderSsr", () => {
  it("opts out for ?legacy=1", () => {
    assert.equal(shouldRenderSsr("/", new URLSearchParams("legacy=1")), false);
  });

  it("never intercepts /api, /og, /s, /assets, manifest, favicon", () => {
    const empty = new URLSearchParams();
    assert.equal(shouldRenderSsr("/api/me",            empty), false);
    assert.equal(shouldRenderSsr("/og/score/1.png",    empty), false);
    assert.equal(shouldRenderSsr("/s/abc",             empty), false);
    assert.equal(shouldRenderSsr("/assets/main.js",    empty), false);
    assert.equal(shouldRenderSsr("/asset-manifest.json", empty), false);
    assert.equal(shouldRenderSsr("/favicon.svg",       empty), false);
    assert.equal(shouldRenderSsr("/robots.txt",        empty), false);
    assert.equal(shouldRenderSsr("/sitemap.xml",       empty), false);
  });

  it("renders SSR for canonical routes", () => {
    const empty = new URLSearchParams();
    assert.equal(shouldRenderSsr("/",         empty), true);
    assert.equal(shouldRenderSsr("/play",     empty), true);
    assert.equal(shouldRenderSsr("/admin",    empty), true);
  });
});

describe("renderPage — emits a complete BaseNative-rendered HTML document for every route", () => {
  for (const route of ["lobby", "play", "submit", "moderate", "admin", "not-found"]) {
    it(`route=${route} produces a doctype + <html> + #app`, () => {
      const html = renderPage(baseCtx({ route, pathname: route === "lobby" ? "/" : `/${route}` }), ASSETS);
      assert.ok(html.startsWith("<!DOCTYPE html>"), `expected doctype, got: ${html.slice(0, 40)}`);
      assert.match(html, /<html lang="en"/);
      assert.match(html, /<div id="app"/);
      assert.match(html, /<script type="module" src="\/assets\/bn-hydrate\.js"/);
    });
  }

  it("inlines SSR state as JSON in #bn-ssr-state", () => {
    const html = renderPage(baseCtx({ user: { handle: "warren", role: "admin", isAdmin: true, isModerator: true } }), ASSETS);
    assert.match(html, /<script type="application\/json" id="bn-ssr-state"/);
    assert.match(html, /"handle":"warren"/);
  });

  // The script-block JSON dump is the only sink we control here. Body
  // text interpolated via {{ … }} is set as raw HTML by
  // @basenative/server (node-html-parser rawText), so the t4bs DB layer
  // is responsible for keeping HTML-significant characters out of
  // category/handle fields before they reach SSR.
  it("escapes </script> in the inlined SSR-state JSON block", () => {
    const ctx = baseCtx({
      lobby: [{ id: 1, category: "evil-cat", submittedBy: "</script><img/onerror=alert(1)>" }],
    });
    const html = renderPage(ctx, ASSETS);
    const start = html.indexOf("<script type=\"application/json\" id=\"bn-ssr-state\">");
    const end = html.indexOf("</script>", start);
    const jsonBlock = html.slice(start, end);
    assert.ok(!jsonBlock.includes("</script>"), "raw </script> must not survive in the SSR-state JSON");
    assert.match(jsonBlock, /\\u003c\/script\\u003e|\\u003c\\u002fscript\\u003e/);
  });

  it("renders semantic <main aria-labelledby> + <h1> for each view", () => {
    for (const route of ["lobby", "play", "submit", "moderate", "admin", "not-found"]) {
      const html = renderPage(baseCtx({ route, pathname: route === "lobby" ? "/" : `/${route}` }), ASSETS);
      assert.match(html, /<main[^>]*aria-labelledby/, `${route}: expected <main aria-labelledby>`);
      assert.match(html, /<h1/, `${route}: expected <h1>`);
    }
  });

  it("lobby view renders @for puzzle groups using BaseNative directives", () => {
    const lobby = [
      { id: 1, category: "ANIMALS", submittedBy: "wmd" },
      { id: 2, category: "ANIMALS", submittedBy: "warren" },
      { id: 3, category: "FOODS",   submittedBy: "wmd" },
    ];
    const html = renderPage(baseCtx({ lobby }), ASSETS);
    assert.match(html, /ANIMALS/);
    assert.match(html, /FOODS/);
    assert.match(html, /data-puzzle-ids="1,2"/);
    assert.match(html, /data-puzzle-ids="3"/);
  });

  /* issue #24 — the lobby must work with JavaScript disabled. Each
     puzzle group renders an <a href="/play?play=ID"> the SPA can
     enhance after hydration, plus a <noscript> hint pitched at the
     no-JS user. */
  it("lobby renders anchor links to /play?play=<id> for each group", () => {
    const lobby = [
      { id: 7, category: "ANIMALS", submittedBy: "wmd" },
      { id: 3, category: "ANIMALS", submittedBy: "warren" },
      { id: 4, category: "FOODS",   submittedBy: "wmd" },
    ];
    const html = renderPage(baseCtx({ lobby }), ASSETS);
    /* Multi-puzzle group: deterministic lowest-id pick (3 not 7). */
    assert.match(html, /href="\/play\?play=3"/);
    /* Single-puzzle group: the only id is the link target. */
    assert.match(html, /href="\/play\?play=4"/);
    /* No <button> for picking a round in the SSR markup — the
       degradation contract is anchors only. */
    const lobbyHtml = html.split("data-bn-view=\"lobby\"")[1] ?? "";
    assert.ok(
      !/<button[^>]*data-bn-action="lobby-pick"/.test(lobbyHtml),
      "lobby SSR must not emit a <button> for picking — anchors only",
    );
  });

  it("lobby includes a <noscript> hint about JS-optional play", () => {
    const html = renderPage(baseCtx({
      lobby: [{ id: 1, category: "ANIMALS", submittedBy: "wmd" }],
    }), ASSETS);
    assert.match(html, /<noscript>[\s\S]*JavaScript enhances[\s\S]*<\/noscript>/);
  });

  it("submit FAB degrades to an anchor for no-JS users", () => {
    const html = renderPage(baseCtx({
      lobby: [{ id: 1, category: "ANIMALS", submittedBy: "wmd" }],
    }), ASSETS);
    assert.match(html, /<a[^>]*href="\/submit"[^>]*data-bn-action="lobby-submit"/);
  });

  it("play view shows word-length skeleton with anchor letters", () => {
    const play = {
      id: 42,
      category: "GREETINGS",
      submittedBy: "wmd",
      words: [5, 5],
      totalLetters: 10,
      anchors: [{ wi: 0, li: 0, letter: "H" }, { wi: 1, li: 4, letter: "D" }],
    };
    const html = renderPage(baseCtx({ route: "play", pathname: "/play", play }), ASSETS);
    assert.match(html, /GREETINGS/);
    assert.match(html, /data-locked="true"/);
    assert.match(html, />\s*H\s*</);
    assert.match(html, />\s*D\s*</);
  });

  it("admin view honors forbidden flag", () => {
    const html = renderPage(baseCtx({
      route: "admin", pathname: "/admin",
      admin: { elevated: null, currentHandle: null, forbidden: true },
    }), ASSETS);
    assert.match(html, /You need admin access/);
  });

  it("moderate view honors forbidden flag", () => {
    const html = renderPage(baseCtx({
      route: "moderate", pathname: "/moderate",
      moderate: { pending: null, forbidden: true },
    }), ASSETS);
    assert.match(html, /You need moderator access/);
  });

  it("not-found view shows the requested pathname", () => {
    const html = renderPage(baseCtx({ route: "not-found", pathname: "/wat" }), ASSETS);
    assert.match(html, /<code>\/wat<\/code>/);
  });

  it("emits the hashed JS + CSS asset paths", () => {
    const assets = { js: "/assets/bn-hydrate-abc123.js", css: ["/assets/app-def.css", "/assets/bundle-456.css"] };
    const html = renderPage(baseCtx(), assets);
    assert.match(html, /\/assets\/bn-hydrate-abc123\.js/);
    assert.match(html, /\/assets\/app-def\.css/);
    assert.match(html, /\/assets\/bundle-456\.css/);
  });

  it("inlines the route name in SSR state for the hydrator", () => {
    const html = renderPage(baseCtx({ route: "play", pathname: "/play" }), ASSETS);
    const start = html.indexOf('<script type="application/json" id="bn-ssr-state">');
    const end = html.indexOf("</script>", start);
    const json = JSON.parse(html.slice(start, end).split(">")[1]);
    assert.equal(json.route, "play");
  });

  /* Lighthouse network-dependency-tree-insight flagged the hydrate
     bundle as a late-discovered critical-path resource. The fix
     emits a <link rel="modulepreload"> in the head so the browser
     can start the fetch in parallel with stylesheet + font requests. */
  it("preloads the hydrate bundle via <link rel=\"modulepreload\">", () => {
    const assets = { js: "/assets/bn-hydrate-abc123.js", css: [] };
    const html = renderPage(baseCtx(), assets);
    assert.match(
      html,
      /<link[^>]*rel="modulepreload"[^>]*href="\/assets\/bn-hydrate-abc123\.js"/,
      "expected a modulepreload link for the hydrate bundle in <head>",
    );
  });
});

describe("decidePlayBoot", () => {
  it("starts a new round on ?play=<id>", () => {
    const intent = decidePlayBoot({ search: "?play=42" }, null);
    assert.deepEqual(intent, { kind: "start", puzzleId: 42 });
  });

  it("ignores ?play=<not-a-positive-int>", () => {
    assert.equal(decidePlayBoot({ search: "?play=0" }, null).kind, "home");
    assert.equal(decidePlayBoot({ search: "?play=-3" }, null).kind, "home");
    assert.equal(decidePlayBoot({ search: "?play=abc" }, null).kind, "home");
    assert.equal(decidePlayBoot({ search: "?play=" }, null).kind, "home");
  });

  it("resumes when a saved session id is present", () => {
    const intent = decidePlayBoot({ search: "" }, { sessionId: "abc-123" });
    assert.deepEqual(intent, { kind: "resume", sessionId: "abc-123" });
  });

  it("?play=<id> beats a saved session — explicit user intent wins", () => {
    const intent = decidePlayBoot({ search: "?play=7" }, { sessionId: "abc-123" });
    assert.deepEqual(intent, { kind: "start", puzzleId: 7 });
  });

  it("treats empty / malformed saved state as no resume", () => {
    assert.equal(decidePlayBoot({ search: "" }, null).kind, "home");
    assert.equal(decidePlayBoot({ search: "" }, undefined).kind, "home");
    assert.equal(decidePlayBoot({ search: "" }, {}).kind, "home");
    assert.equal(decidePlayBoot({ search: "" }, { sessionId: "" }).kind, "home");
    assert.equal(decidePlayBoot({ search: "" }, { sessionId: 42 }).kind, "home");
  });
});

describe("withTimeout", () => {
  it("resolves when the inner promise resolves first", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 1000);
    assert.equal(result, "ok");
  });

  it("rejects with code=ETIMEOUT when the deadline elapses", async () => {
    const stalled = new Promise(() => { /* never resolves */ });
    await assert.rejects(
      () => withTimeout(stalled, 20, "test-timeout"),
      (err) => {
        assert.equal(err.code, "ETIMEOUT");
        assert.equal(err.message, "test-timeout");
        return true;
      },
    );
  });

  it("propagates inner-promise rejection unchanged", async () => {
    const inner = Promise.reject(new Error("boom"));
    await assert.rejects(
      () => withTimeout(inner, 1000),
      /boom/,
    );
  });
});

describe("isResumable", () => {
  const valid = {
    sessionId: "x",
    words: [5, 5],
    anchors: [{ wi: 0, li: 0, letter: "H" }],
    lives: 4,
    score: 0,
    locked: { 0: { 0: "H" } },
    presentGlobal: [],
    absentByWord: [[], []],
    wordSolved: [false, false],
    finished: false,
  };

  it("accepts an in-progress session", () => {
    assert.equal(isResumable(valid), true);
  });

  it("rejects engine errors", () => {
    assert.equal(isResumable({ error: "no-session" }), false);
    assert.equal(isResumable({ error: "puzzle-gone" }), false);
  });

  it("rejects finished sessions (game already over)", () => {
    assert.equal(isResumable({ ...valid, finished: "won" }), false);
    assert.equal(isResumable({ ...valid, finished: "lost" }), false);
    assert.equal(isResumable({ ...valid, finished: true }), false);
  });

  it("rejects malformed shapes", () => {
    assert.equal(isResumable(null), false);
    assert.equal(isResumable(undefined), false);
    assert.equal(isResumable("nope"), false);
    assert.equal(isResumable({ ...valid, words: undefined }), false);
    assert.equal(isResumable({ ...valid, words: [] }), false);
    assert.equal(isResumable({ ...valid, anchors: undefined }), false);
  });
});
