/* Server-side renderer.

   Every page is composed from three pure templates piped through
   @basenative/server's `render(html, ctx)`:

     1. The route-specific view (lobby.html, play.html, …)
     2. The shared header.html
     3. The layout.html shell that wraps the rendered view + a JSON
        dump of the same context for the client hydrator to seed
        signals from.

   No string concatenation, no <span class="lb-…"> soup. The templates
   own the markup; this file only orchestrates context shaping and the
   ordered render() calls. */

// See src/bn/vendor/bn-server-render.js for why we vendor instead of
// importing from "@basenative/server" directly. Drop when 0.4.1 ships.
import { render } from "../vendor/bn-server-render.js";
import layoutHtml from "../views/layout.js";
import headerHtml from "../views/header.js";
import lobbyHtml from "../views/lobby.js";
import playHtml from "../views/play.js";
import submitHtml from "../views/submit.js";
import moderateHtml from "../views/moderate.js";
import adminHtml from "../views/admin.js";
import notFoundHtml from "../views/not_found.js";
import { groupLobby } from "../../lib/game.js";

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

/** @param {{ id: number, category: string, submittedBy: string }[] | null} lobby */
function lobbyGroups(lobby) {
  const groups = groupLobby(lobby) || [];
  return groups.map(group => {
    /* For the no-JS case we need a deterministic single round per
       category — pick the lowest puzzle id. The hydrated SPA uses a
       random pick within the group instead, but that re-bind happens
       after mount() replaces the SSR markup, so the link target only
       affects browsers without JS or before the bundle has executed. */
    const firstPuzzleId = group.puzzles
      .map(p => p.id)
      .reduce((min, id) => (id < min ? id : min), group.puzzles[0].id);
    return {
      category: group.category,
      puzzleIds: group.puzzles.map(p => p.id).join(","),
      playHref: `/play?play=${firstPuzzleId}`,
      credit: group.puzzles.length === 1
        ? `by ${group.puzzles[0].submittedBy}`
        : `${group.puzzles.length} puzzles`,
    };
  });
}

/** @param {import('./ssr-context.js').PlaySessionSsr | null} play */
function shapePlay(play) {
  if (!play) return null;
  const anchorMap = new Map();
  for (const a of play.anchors) anchorMap.set(`${a.wi}-${a.li}`, a.letter);
  const words = play.words.map((wordLen, wi) => ({
    cells: Array.from({ length: wordLen }, (_, li) => ({
      anchor: anchorMap.get(`${wi}-${li}`) ?? "",
    })),
  }));
  const wordCount = play.words.length;
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
        groups: lobbyGroups(ctx.lobby),
        error: ctx.error,
      });
    case "play":
      return render(tpl, { play: shapePlay(ctx.play) });
    case "submit":
      return render(tpl, {
        existingCategories: ctx.submit.existingCategories,
      });
    case "moderate":
      return render(tpl, {
        forbidden: !!ctx.moderate.forbidden,
        pending: ctx.moderate.pending ?? [],
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
    play: ctx.play,
    submit: ctx.submit,
    moderate: ctx.moderate,
    admin: ctx.admin,
  };

  const layoutCtx = {
    title: TITLES[ctx.route] ?? TITLES["lobby"],
    description: SITE_DESCRIPTION,
    canonicalUrl: `https://t4bs.com${ctx.pathname}`,
    route: ctx.route,
    cssAssets: assets.css,
    jsAsset: assets.js,
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
