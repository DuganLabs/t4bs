/* Server-side renderer.

   Every page is composed from three pure templates piped through
   @basenative/server's `render(html, ctx)`:

     1. The route-specific view (lobby.html, play.html, …)
     2. The shared header.html
     3. The layout.html shell that wraps the rendered view + a JSON
        dump of the same context for the client hydrator to seed
        signals from.

   No string concatenation, no class soup. The templates own the markup
   (purely semantic + data-bn-* attributes); this file only orchestrates
   context shaping and the ordered render() calls. */

import { render } from "@basenative/server";
import { raw } from "@basenative/runtime/shared/escape";
import { renderAdminQueueList } from "@basenative/admin/components";
import layoutHtml from "../views/layout.js";
import headerHtml from "../views/header.js";
import lobbyHtml from "../views/lobby.js";
import playHtml from "../views/play.js";
import submitHtml from "../views/submit.js";
import moderateHtml from "../views/moderate.js";
import adminHtml from "../views/admin.js";
import notFoundHtml from "../views/not_found.js";
import { groupLobby, renderBrowseShelf } from "../../lib/game.js";

const VIEW_TEMPLATES = {
  "lobby":     lobbyHtml,
  "play":      playHtml,
  "submit":    submitHtml,
  "moderate":  moderateHtml,
  "admin":     adminHtml,
  "not-found": notFoundHtml,
};

const TITLES = {
  "lobby":     "Tabs — quick category puzzles",
  "play":      "Tabs — playing",
  "submit":    "Tabs — submit a phrase",
  "moderate":  "Tabs — moderation queue",
  "admin":     "Tabs — moderator administration",
  "not-found": "Tabs — not found",
};

const SITE_DESCRIPTION =
  "Pick a category. Solve the hidden phrase. Stake the letters you're sure about.";

/* Inline JSON sits inside <script type="application/json"> on the page
   so the client hydrator can read window-bound state without an
   additional round-trip. We escape characters that would let the JSON
   close the surrounding <script> tag. */
function safeJson(value) {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/* The free-play shelf.

   This used to flatten each category to a single link — lowest puzzle
   id, credited "by house" or "2 puzzles" — which meant the rounds
   inside a category were neither reachable nor visible from the lobby.
   It is now @basenative/components' accordion, one collapsible section
   per category listing every round, built by the same
   renderBrowseShelf() helper src/views/lobby.js calls after hydration
   so the two trees emit the same markup from the same input.

   "a" is not a detail: the SSR surface has to keep working with
   JavaScript off, so every round is a real <a href="/play?play={id}">.
   The hydrated client passes "button" instead — see lib/game.js.

   @param {{ id: number, category: string, submittedBy: string }[] | null} lobby */
function lobbyBrowseHtml(lobby) {
  return renderBrowseShelf(groupLobby(lobby) || [], "a");
}

/* Presentation shaping for the server's daily status — the template
   only ever prints strings, so the emoji/streak/verdict decisions
   happen here rather than in template expressions.
   @param {any} daily */
function shapeDaily(daily) {
  if (!daily) return null;
  const streak = daily.streak || 0;
  return {
    category: daily.category || "",
    day: daily.day || "",
    score: daily.score ?? 0,
    streak,
    streakLabel: streak > 0 ? `\u{1F525}${streak}` : "0",
    bestStreak: daily.bestStreak || 0,
    daysPlayed: daily.daysPlayed || 0,
    resultLabel: daily.outcome === "won" ? "Solved" : "Busted",
  };
}

/** @param {import('./ssr-context.js').PlaySessionSsr | null} play */
function shapePlay(play) {
  if (!play) return null;
  /* Defensive: a partial play context (e.g. a row with null anchors
     or null words leaking through from the DB) used to throw
     "x is not iterable" here and 500 the whole SSR response. The
     happy path always provides arrays — these `|| []` guards just
     keep a malformed input from cascading. */
  const anchors = play.anchors || [];
  const wordsIn = play.words || [];
  const anchorMap = new Map();
  for (const a of anchors) anchorMap.set(`${a.wi}-${a.li}`, a.letter);
  const words = wordsIn.map((wordLen, wi) => ({
    cells: Array.from({ length: wordLen }, (_, li) => ({
      anchor: anchorMap.get(`${wi}-${li}`) ?? "",
    })),
  }));
  const wordCount = wordsIn.length;
  return {
    id: play.id,
    category: play.category,
    submittedBy: play.submittedBy ?? "",
    totalLetters: play.totalLetters,
    wordsLabel: `${wordCount} word${wordCount === 1 ? "" : "s"}`,
    words,
    score: 0,
    lives: 4,
    tokens: 0,
  };
}

/* Per-route view rendering. Throws on unknown routes — callers should
   normalize via matchRoute() before getting here. */
function renderView(ctx) {
  const tpl = VIEW_TEMPLATES[ctx.route] ?? notFoundHtml;
  switch (ctx.route) {
    case "lobby":
      return render(tpl, {
        /* raw(): renderBrowseShelf() already escapes every field it
           interpolates, so `{{ browseHtml }}` must not escape it again.
           Same contract as queueListHtml below. */
        browseHtml: raw(lobbyBrowseHtml(ctx.lobby)),
        hasGroups: !!(ctx.lobby && ctx.lobby.length),
        daily: shapeDaily(ctx.daily),
        dailyOpen: !!(ctx.daily && ctx.daily.puzzleId && !ctx.daily.playedToday),
        dailyDone: !!(ctx.daily && ctx.daily.playedToday),
        error: ctx.error,
      });
    case "play":
      return render(tpl, { play: shapePlay(ctx.play) });
    case "submit":
      return render(tpl, {
        existingCategories: ctx.submit.existingCategories,
      });
    case "moderate":
      /* The pending queue is rendered with @basenative/admin's
         renderAdminQueueList — the same renderer src/views/moderate.js
         (client) calls via `renderAdminQueueList({ items, actionHandler:
         "mod-decide" })` — instead of a hand-rolled @for/<li> loop, so
         SSR first paint and the post-hydration client repaint agree
         byte-for-byte on the same input. raw() marks the resulting HTML
         string trusted so `{{ queueListHtml }}` below doesn't
         double-escape it (renderAdminQueueList already escapes every
         field it interpolates). */
      return render(tpl, {
        forbidden: !!ctx.moderate.forbidden,
        queueListHtml: raw(renderAdminQueueList({
          items: ctx.moderate.pending ?? [],
          actionHandler: "mod-decide",
        })),
      });
    case "admin":
      return render(tpl, {
        forbidden: !!ctx.admin.forbidden,
        elevated: ctx.admin.elevated ?? [],
        currentHandle: ctx.admin.currentHandle ?? "",
      });
    case "not-found":
    default:
      return render(tpl, { pathname: ctx.pathname });
  }
}

/**
 * Render a full HTML response for the given context.
 *
 * @param {{
 *   route: string,
 *   pathname: string,
 *   user: { handle: string, role: string, isAdmin: boolean, isModerator: boolean } | null,
 *   error: string | null,
 *   lobby: any,
 *   daily: any,
 *   play: any,
 *   submit: { existingCategories: string[] },
 *   moderate: { pending: any[] | null, forbidden?: boolean },
 *   admin: { elevated: any[] | null, currentHandle: string | null, forbidden?: boolean },
 * }} ctx
 * @param {{ js: string, css: string[] }} assets
 */
export function renderPage(ctx, assets) {
  const headerCtx = {
    route: ctx.route,
    user: ctx.user,
    play: ctx.play ? shapePlay(ctx.play) : null,
  };

  const headerHtmlOut = render(headerHtml, headerCtx);
  const viewHtmlOut = renderView(ctx);

  const ssrState = {
    route: ctx.route,
    pathname: ctx.pathname,
    user: ctx.user,
    error: ctx.error,
    lobby: ctx.lobby,
    daily: ctx.daily ?? null,
    play: ctx.play,
    submit: ctx.submit,
    moderate: ctx.moderate,
    admin: ctx.admin,
  };

  /* submit / moderate / admin ship as their own lazily-imported chunks,
     so the browser cannot know about them until the hydrate bundle has
     run. On a direct hit to one of those routes we already know which
     chunk is wanted, so name it in <head> and let it download in
     parallel with the hydrate bundle rather than one round trip behind
     it. Empty for every other route, and empty when the manifest
     couldn't be read — nothing here is load-bearing. */
  const viewPreloads = [assets.views?.[ctx.route]].filter(Boolean);

  const layoutCtx = {
    title: TITLES[ctx.route] ?? TITLES["lobby"],
    description: SITE_DESCRIPTION,
    canonicalUrl: `https://t4bs.com${ctx.pathname}`,
    route: ctx.route,
    cssAssets: assets.css,
    jsAsset: assets.js,
    viewPreloads,
    ssrStateJson: safeJson(ssrState),
  };

  const wrapped = render(layoutHtml, layoutCtx);

  // <script> tags with `type="module"` are deliberately not processed
  // by @basenative/server (it skips non-JSON scripts to avoid attribute
  // injection on executable content), so we substitute the hydrate
  // script after render() instead of via :src binding. The asset path
  // is already a build-time-controlled URL from asset-manifest.json.
  const hydrateScriptTag = `<script type="module" src="${escapeAttr(assets.js)}"></script>`;

  return wrapped
    .replace("<!--BN_VIEW-->", `${headerHtmlOut}${viewHtmlOut}`)
    .replace("<!--BN_HYDRATE_SCRIPT-->", hydrateScriptTag);
}

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
