/* Server-side renderer.

   Every page is composed from three pure templates piped through
   @basenative/server's `render(html, ctx)`:

     1. The route-specific view (home.html, play.html, …)
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
import homeHtml from "../views/home.js";
import playHtml from "../views/play.js";
import { boardContext } from "../views/play-board.js";
import submitHtml from "../views/submit.js";
import moderateHtml from "../views/moderate.js";
import adminHtml from "../views/admin.js";
import notFoundHtml from "../views/not_found.js";
import { groupCatalogue, renderCatalogueShelf } from "../../lib/game.js";
import { renderCatalogueTable } from "../../lib/admin-view.js";

const VIEW_TEMPLATES = {
  "home":      homeHtml,
  "play":      playHtml,
  "submit":    submitHtml,
  "moderate":  moderateHtml,
  "admin":     adminHtml,
  "not-found": notFoundHtml,
};

const TITLES = {
  "home":      "Tabs — today's puzzle",
  "play":      "Tabs — preview",
  "submit":    "Tabs — submit a phrase",
  "moderate":  "Tabs — moderation queue",
  "admin":     "Tabs — moderator administration",
  "not-found": "Tabs — not found",
};

const SITE_DESCRIPTION =
  "Pick a category. Solve the hidden phrase. Every letter you didn't need is ten points.";

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

/* The catalogue — every approved phrase by category — is rendered for
   /moderate only (src/lib/game.js renderCatalogueShelf), from the same
   helper the hydrated client calls, so the two trees emit one markup.
   @param {{ id: number, category: string, phrase: string, submittedBy: string }[] | null} rows */
function catalogueHtml(rows) {
  return renderCatalogueShelf(groupCatalogue(rows) || []);
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

/** The board for first paint: words as cells (anchor letter or ""), the
 *  attempt budget per word. @param {any} play */
function shapePlay(play) {
  if (!play) return null;
  const anchors = play.anchors || [];
  const wordsIn = play.words || [];
  const anchorMap = new Map();
  for (const a of anchors) anchorMap.set(`${a.wi}-${a.li}`, a.letter);
  const attemptsMax = play.attemptsMax || [];
  const words = wordsIn.map((wordLen, wi) => ({
    cells: Array.from({ length: wordLen }, (_, li) => ({ anchor: anchorMap.get(`${wi}-${li}`) ?? "" })),
    attempts: attemptsMax[wi] ?? "",
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
    lives: 0,
    tokens: 0,
  };
}

/* Per-route view rendering. Throws on unknown routes — callers should
   normalize via matchRoute() before getting here. */
function renderView(ctx) {
  const tpl = VIEW_TEMPLATES[ctx.route] ?? notFoundHtml;
  switch (ctx.route) {
    case "home": {
      /* Today's puzzle IS the page. `play` is the board for the day's
         puzzle (functions/_shared/ssr.js resolves it from the scheduled
         id) and is only rendered while the day is open for this player. */
      const open = !!(ctx.daily && ctx.daily.puzzleId && !ctx.daily.playedToday);
      return render(tpl, {
        ...boardContext,
        daily: shapeDaily(ctx.daily),
        dailyOpen: open && !!ctx.play,
        dailyDone: !!(ctx.daily && ctx.daily.playedToday),
        noDaily: !ctx.error && !(ctx.daily && ctx.daily.puzzleId),
        play: open ? shapePlay(ctx.play) : null,
        error: ctx.error,
      });
    }
    case "play":
      return render(tpl, { ...boardContext, play: shapePlay(ctx.play) });
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
        /* raw(): renderCatalogueShelf() escapes every field it
           interpolates, so `{{ catalogueHtml }}` must not escape it again. */
        catalogueHtml: raw(catalogueHtml(ctx.moderate.catalogue ?? null)),
        hasCatalogue: !!(ctx.moderate.catalogue && ctx.moderate.catalogue.length),
      });
    case "admin":
      /* The catalogue table is rendered with @basenative/components'
         renderTable — the same call the client makes after hydration — and
         marked raw, exactly as the moderation queue does with its list. */
      return render(tpl, {
        forbidden: !!ctx.admin.forbidden,
        elevated: ctx.admin.elevated ?? [],
        currentHandle: ctx.admin.currentHandle ?? "",
        catalogueCount: (ctx.admin.catalogue ?? []).length,
        catalogueHtml: raw(renderCatalogueTable(ctx.admin.catalogue ?? [])),
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
 *   daily: any,
 *   play: any,
 *   submit: { existingCategories: string[] },
 *   moderate: { pending: any[] | null, catalogue?: any[] | null, forbidden?: boolean },
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
    title: TITLES[ctx.route] ?? TITLES["home"],
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
