/* SSR pipeline tests for the BaseNative-driven render path.

   These exercise the templates + render orchestrator using the real
   @basenative/server `render()` — no jsdom required, the renderer
   parses HTML strings via node-html-parser. Run with:

     node --test src/bn/hydrate.test.js
*/

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { renderAdminQueueList } from "@basenative/admin/components";

import { matchRoute, routeToView, shouldRenderSsr } from "./route-table.js";
import { renderPage } from "./server/render.js";
import { decidePlayBoot, withTimeout, isResumable } from "./client/play-boot.js";

const ASSETS = { js: "/assets/bn-hydrate.js", css: ["/assets/app.css"] };

const DAILY_OPEN = {
        day: "2026-09-11", puzzleId: 9, category: "FAIRY TALES", submittedBy: "house",
        playedToday: false, outcome: null, score: null,
        streak: 3, bestStreak: 5, daysPlayed: 12, msUntilNext: 3600000,
      };
const PLAY9 = {
        id: 9, category: "FAIRY TALES", submittedBy: "house",
        words: [4, 3], totalLetters: 7, par: 60,
        anchors: [{ wi: 0, li: 0, letter: "O" }],
        attemptsMax: [4, 3],
      };

function baseCtx(overrides = {}) {
  return {
    route: "home",
    pathname: "/",
    user: null,
    error: null,
    daily: null,
    play: null,
    submit: { existingCategories: [] },
    moderate: { pending: null, forbidden: false },
    admin: { elevated: null, currentHandle: null, forbidden: false },
    ...overrides,
  };
}

describe("matchRoute", () => {
  it("matches the canonical paths", () => {
    assert.equal(matchRoute("/"),         "home");
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

describe("routeToView", () => {
  it("maps the five known routes to their client views", () => {
    assert.equal(routeToView("home"),     "home");
    assert.equal(routeToView("play"),     "playing");
    assert.equal(routeToView("submit"),   "submit");
    assert.equal(routeToView("moderate"), "moderate");
    assert.equal(routeToView("admin"),    "admin");
  });

  it("keeps not-found as not-found — the client must not boot the game over the server's 404 (T4-031)", () => {
    assert.equal(routeToView("not-found"), "not-found");
    assert.equal(routeToView(matchRoute("/wat")), "not-found");
  });

  it("falls back to home only for an unknown or missing route name", () => {
    assert.equal(routeToView(undefined), "home");
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
  for (const route of ["home", "play", "submit", "moderate", "admin", "not-found"]) {
    it(`route=${route} produces a doctype + <html> + #app`, () => {
      const html = renderPage(baseCtx({ route, pathname: route === "home" ? "/" : `/${route}` }), ASSETS);
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
      user: { handle: "</script><img/onerror=alert(1)>", role: "user", isAdmin: false, isModerator: false },
    });
    const html = renderPage(ctx, ASSETS);
    const start = html.indexOf("<script type=\"application/json\" id=\"bn-ssr-state\">");
    const end = html.indexOf("</script>", start);
    const jsonBlock = html.slice(start, end);
    assert.ok(!jsonBlock.includes("</script>"), "raw </script> must not survive in the SSR-state JSON");
    assert.match(jsonBlock, /\\u003c\/script\\u003e|\\u003c\\u002fscript\\u003e/);
  });

  it("renders semantic <main aria-labelledby> + <h1> for each view", () => {
    for (const route of ["home", "play", "submit", "moderate", "admin", "not-found"]) {
      const html = renderPage(baseCtx({ route, pathname: route === "home" ? "/" : `/${route}` }), ASSETS);
      assert.match(html, /<main[^>]*aria-labelledby/, `${route}: expected <main aria-labelledby>`);
      assert.match(html, /<h1/, `${route}: expected <h1>`);
    }
  });

  /* ── HOME — the page at "/" IS today's puzzle ────────────────────
     There is no lobby. A visitor who has not played today sees the
     board of the scheduled puzzle on first paint; one who has sees the
     result and when the next one lands. Nothing on the page lists
     categories or "rounds" — that is the moderator's catalogue. */
  it("home SSRs today's board — category, anchors locked, attempts per word", () => {
    const html = renderPage(baseCtx({ daily: DAILY_OPEN, play: PLAY9 }), ASSETS);
    assert.match(html, /data-bn-view="home"/);
    assert.match(html, /FAIRY TALES/);
    assert.match(html, /Today · 2026-09-11/);
    assert.match(html, /data-locked[\s>]/, "the anchor tile is locked");
    assert.match(html, />O</, "the anchor letter is shown");
    assert.match(html, /4 attempts/);
    assert.match(html, /3 attempts/);
    assert.match(html, /data-bn-region="knowledge"/);
    assert.match(html, /data-bn-region="bank"/);
    assert.doesNotMatch(html, /data-bn-region="scoreboard"/, "the reveal-a-letter scoreboard is gone");
    // Streak strip, rendered from the server's numbers.
    assert.match(html, /Streak/);
    assert.match(html, />5</, "best streak");
    assert.match(html, />12</, "days played");
  });

  it("home paints the keyboard on the server — QWERTY with ENTER and backspace, disabled until hydration", () => {
    const html = renderPage(baseCtx({ daily: DAILY_OPEN, play: PLAY9 }), ASSETS);
    assert.match(html, /data-bn="keyboard"/);
    assert.match(html, /data-kb-key="Q"/);
    assert.match(html, /data-kb-key="ENTER"/, "you type a word and submit it");
    assert.match(html, /data-kb-key="BACKSPACE"/, "and you can take a letter back");
  });

  it("home lists no categories and no rounds — the catalogue is a moderator surface", () => {
    const html = renderPage(baseCtx({ daily: DAILY_OPEN, play: PLAY9 }), ASSETS);
    const main = html.split('data-bn-view="home"')[1] ?? "";
    assert.doesNotMatch(main, /data-bn-region="free-play"/);
    assert.doesNotMatch(main, /data-bn="accordion-item"/);
    assert.doesNotMatch(main, /Round \d/);
    assert.doesNotMatch(main, /Free play/i);
    assert.doesNotMatch(main, /Pick a round/i);
  });

  it("home SSRs the done state instead of a board once today is recorded", () => {
    const html = renderPage(baseCtx({
      daily: {
        day: "2026-09-11", puzzleId: 9, category: "FAIRY TALES", submittedBy: "house",
        playedToday: true, outcome: "won", score: 96,
        streak: 1, bestStreak: 1, daysPlayed: 1, msUntilNext: 3600000,
      },
      play: PLAY9,
    }), ASSETS);
    assert.doesNotMatch(html, /data-bn-region="grid"/, "a finished daily must not offer a board — the server would refuse a second run");
    assert.match(html, /data-bn-region="daily-done"/);
    assert.match(html, />Solved</);
    assert.match(html, /<strong>96<\/strong> points/);
    /* No zone is named: the daily rolls at the PLAYER's midnight, so the
       old "midnight Central Time" was wrong for everyone outside it. */
    assert.match(html, /Next puzzle at your midnight/);
    assert.doesNotMatch(html, /Central Time/);
  });

  it("home says so when nothing is scheduled, rather than a blank", () => {
    const html = renderPage(baseCtx({ daily: { day: "2026-09-11", puzzleId: null, playedToday: false, streak: 0, bestStreak: 0, daysPlayed: 0 }, play: null }), ASSETS);
    assert.match(html, /No puzzle today/);
    assert.doesNotMatch(html, /data-bn-region="grid"/);
  });

  it("home renders without a daily at all (D1 hiccup) rather than throwing", () => {
    assert.doesNotThrow(() => renderPage(baseCtx({ daily: null }), ASSETS));
  });

  it("home keeps the submit link as a plain in-flow anchor — no floating button", () => {
    const html = renderPage(baseCtx({ daily: DAILY_OPEN, play: PLAY9 }), ASSETS);
    assert.match(html, /<a[^>]*href="\/submit"[^>]*data-bn-action="home-submit"/);
    assert.doesNotMatch(html, /data-bn-action="lobby-submit"/);
  });

  /* ── PLAY — the preview route ─────────────────────────────────── */
  it("play view is labelled a preview and shows the board with anchor letters", () => {
    const html = renderPage(baseCtx({ route: "play", pathname: "/play", play: PLAY9 }), ASSETS);
    assert.match(html, /data-bn-view="play"/);
    assert.match(html, /Preview · does not count/);
    assert.match(html, /data-locked[\s>]/);
  });

  it("play without a puzzle points home instead of a loader", () => {
    const html = renderPage(baseCtx({ route: "play", pathname: "/play", play: null }), ASSETS);
    assert.match(html, /Nothing to preview/);
    assert.match(html, /href="\/"/);
  });

  it("play view shows word-length skeleton with anchor letters", () => {
    const play = {
      id: 42, category: "GREETINGS", submittedBy: "wmd",
      words: [5, 5], totalLetters: 10, attemptsMax: [4, 4],
      anchors: [{ wi: 0, li: 0, letter: "H" }, { wi: 1, li: 4, letter: "D" }],
    };
    const html = renderPage(baseCtx({ route: "play", pathname: "/play", play }), ASSETS);
    assert.match(html, /GREETINGS/);
    assert.match(html, /data-locked[\s>]/);
    assert.match(html, />H</);
    assert.match(html, />D</);
    // Ten tiles across two words, each individually labelled.
    assert.equal((html.match(/data-bn-region="tile"/g) || []).length, 10);
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

  describe("moderate view — queue markup matches the client renderer", () => {
    /* src/views/moderate.js (client) renders the pending queue with
       `renderAdminQueueList({ items, actionHandler: "mod-decide" })`.
       The SSR path (src/bn/server/render.js) calls the exact same
       function with the exact same actionHandler, so first paint and
       the post-hydration client repaint agree. Proven here by literally
       re-deriving the expected markup with the same renderer + the same
       inputs the SSR context carries, and asserting it appears verbatim
       in renderPage()'s output — not just a loose structural fuzz check. */
    const SAMPLE_QUEUE = [
      { id: 1, category: "Movies", submittedBy: "wmd", phrase: "the empire strikes back" },
      { id: 2, category: "Sports", submittedBy: "ada", phrase: "hail mary" },
    ];

    it("embeds the exact renderAdminQueueList output for a non-empty queue", () => {
      const html = renderPage(baseCtx({
        route: "moderate", pathname: "/moderate",
        moderate: { pending: SAMPLE_QUEUE, forbidden: false },
      }), ASSETS);
      const expected = renderAdminQueueList({ items: SAMPLE_QUEUE, actionHandler: "mod-decide" });
      assert.ok(
        html.includes(expected),
        "SSR output should embed renderAdminQueueList's markup verbatim",
      );
      // And sanity-check a couple of the attributes callers rely on for
      // approve/reject wiring, so a future renderer change that breaks
      // the contract fails loudly here too, not just via a diff.
      assert.match(html, /data-bn="admin-queue-list"/);
      assert.match(html, /data-action="mod-decide"/);
      assert.match(html, /data-decision="approved"/);
      assert.match(html, /data-decision="rejected"/);
    });

    it("embeds the exact renderAdminQueueList output for an empty queue", () => {
      const html = renderPage(baseCtx({
        route: "moderate", pathname: "/moderate",
        moderate: { pending: [], forbidden: false },
      }), ASSETS);
      const expected = renderAdminQueueList({ items: [], actionHandler: "mod-decide" });
      assert.ok(html.includes(expected));
    });

    it("treats a null pending list the same as an empty queue (matches the ?? [] guard)", () => {
      const html = renderPage(baseCtx({
        route: "moderate", pathname: "/moderate",
        moderate: { pending: null, forbidden: false },
      }), ASSETS);
      const expected = renderAdminQueueList({ items: [], actionHandler: "mod-decide" });
      assert.ok(html.includes(expected));
    });
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
  const OPEN = { puzzleId: 9, playedToday: false };
  const DONE = { puzzleId: 9, playedToday: true };

  it("/ starts today's puzzle when it is open for this player", () => {
    assert.deepEqual(decidePlayBoot({ pathname: "/", search: "" }, null, OPEN), { kind: "daily" });
  });

  it("/ shows the home frame when today is already played, or nothing is scheduled", () => {
    assert.equal(decidePlayBoot({ pathname: "/", search: "" }, null, DONE).kind, "home");
    assert.equal(decidePlayBoot({ pathname: "/", search: "" }, null, { puzzleId: null }).kind, "home");
    assert.equal(decidePlayBoot({ pathname: "/", search: "" }, null, null).kind, "home");
  });

  it("/ resumes a saved round before anything else", () => {
    assert.deepEqual(decidePlayBoot({ pathname: "/", search: "" }, { sessionId: "abc-123" }, OPEN),
      { kind: "resume", sessionId: "abc-123" });
  });

  it("/play?play=<id> starts a preview of that puzzle", () => {
    const intent = decidePlayBoot({ pathname: "/play", search: "?play=42" }, null);
    assert.deepEqual(intent, { kind: "start", puzzleId: 42 });
  });

  it("/play ignores ?play=<not-a-positive-int>", () => {
    for (const q of ["?play=0", "?play=-3", "?play=abc", "?play="]) {
      assert.equal(decidePlayBoot({ pathname: "/play", search: q }, null).kind, "home", q);
    }
  });

  it("/play resumes when a saved session id is present", () => {
    const intent = decidePlayBoot({ pathname: "/play", search: "" }, { sessionId: "abc-123" });
    assert.deepEqual(intent, { kind: "resume", sessionId: "abc-123" });
  });

  it("?play=<id> beats a saved session — explicit user intent wins", () => {
    const intent = decidePlayBoot({ pathname: "/play", search: "?play=7" }, { sessionId: "abc-123" });
    assert.deepEqual(intent, { kind: "start", puzzleId: 7 });
  });

  it("the old /play?daily=1 share link goes home, where today's puzzle is", () => {
    assert.equal(decidePlayBoot({ pathname: "/play", search: "?daily=1" }, null).kind, "home");
  });

  it("treats empty / malformed saved state as no resume", () => {
    for (const saved of [null, undefined, {}, { sessionId: "" }, { sessionId: 42 }]) {
      assert.equal(decidePlayBoot({ pathname: "/play", search: "" }, saved).kind, "home");
    }
  });

  it("ignores routes other than /play and / — no session hijack on /moderate, /admin, /submit", () => {
    const saved = { sessionId: "abc-123" };
    for (const pathname of ["/moderate", "/admin", "/submit"]) {
      assert.deepEqual(
        decidePlayBoot({ pathname, search: "" }, saved, OPEN),
        { kind: "ignore" },
        `${pathname} should be ignored even with a resumable session saved`,
      );
    }
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

describe("admin v2 SSR", () => {
  it("renders five tabs and the catalogue table on first paint", () => {
    const html = renderPage(baseCtx({
      route: "admin", pathname: "/admin",
      user: { handle: "warren", role: "admin", isAdmin: true, isModerator: true },
      admin: {
        elevated: [], currentHandle: "warren", forbidden: false,
        catalogue: [{ id: 9, category: "FAIRY TALES", phrase: "HAPPILY EVER AFTER", anchors: [], par: 85, parIsDerived: true, status: "approved", submittedBy: "house", plays: 0, wins: 0, winRate: null, winRateLabel: "—", avgWinScore: null, suspicious: false }],
      },
    }), ASSETS);
    assert.match(html, /data-bn="tabs"/);
    for (const t of ["Catalogue", "Daily", "Queue", "People", "Stats"]) assert.match(html, new RegExp(`>${t}<`));
    assert.match(html, /data-bn="table"/);
    assert.match(html, /HAPPILY EVER AFTER/);
    assert.match(html, /1 puzzles in the catalogue/);
  });
});
