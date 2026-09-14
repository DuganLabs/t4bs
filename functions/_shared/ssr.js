/* SSR dispatcher.

   Builds a per-route context from D1 + cookie auth, renders via
   src/bn/server/render.js (which calls @basenative/server's `render()`
   on real HTML templates), returns an HTML response.

   Errors propagate up so the middleware can decide between serving an
   error page and falling through to the static SPA. We DON'T swallow
   them — silent fallback was the source of the "reload broken" bug:
   any SSR exception used to drop the user onto the static index.html,
   which then wasn't initialized for deep routes. */

import { matchRoute }   from "../../src/bn/route-table.js";
import { renderPage }   from "../../src/bn/server/render.js";
import { loadAssets }   from "../../src/bn/server/manifest.js";
import { createEngine } from "../../shared/engine.js";
import { catalogueRow } from "../../shared/admin-stats.js";
import { LIVES, anchorLetters, boardFor, hiddenCount, publicShape, scoreFor, wordsOf } from "../../shared/pure.js";
import {
  d1Puzzles, d1Sessions, d1Submissions, d1Users,
} from "./d1.js";
import {
  currentUser, getRole, isAdmin, isModerator, playerIdentity,
} from "./util.js";
import { dailyStatus } from "./game.js";

/**
 * Render an SSR HTML response for the request.
 *
 * @param {{ request: Request, env: any }} args
 * @returns {Promise<Response>}
 */
export async function renderSsr({ request, env }) {
  const url = new URL(request.url);
  const route = matchRoute(url.pathname);

  /* Run the user lookup, the route-specific data fetch, and the asset
     manifest read in parallel — they're all independent on a cold
     request and were sequential before, costing one D1 round-trip per
     hop on Lighthouse's TTFB. The user lookup is the only one we need
     resolved before deciding whether moderate/admin are forbidden, so
     we await the user-promise inside those branches but kick all
     three off together. */

  /** @type {Promise<typeof user>} */
  const userPromise = (async () => {
    try {
      const u = await currentUser(request, env);
      if (!u) return null;
      return {
        handle: u.handle,
        role: getRole(u),
        isAdmin: isAdmin(u),
        isModerator: isModerator(u),
      };
    } catch { return null; }
  })();

  const assetsPromise = loadAssets(env, url);

  /** @type {{ daily: any, play: any, categories: string[], modPending: any[] | null, modCatalogue: any[] | null, adminElevated: any[] | null, adminCatalogue: any[] | null }} */
  const fetched = { daily: null, play: null, categories: [], modPending: null, modCatalogue: null, adminElevated: null, adminCatalogue: null };
  let dataError = null;
  /** Set when an anonymous player id had to be minted for the daily. */
  let setCookie = null;

  /** @type {Promise<unknown>} */
  let dataPromise = Promise.resolve();

  if (route === "home") {
    /* The page IS today's puzzle: resolve the day's status for this
       player, and — while the day is still open for them — the board of
       the scheduled puzzle, so the first paint is the game and not a
       card about the game. */
    dataPromise = (async () => {
      const who = await playerIdentity(request, env);
      setCookie = who.setCookie;
      fetched.daily = await dailyStatus(env, who.key);
      if (fetched.daily?.puzzleId && !fetched.daily.playedToday) {
        fetched.play = await resolvePlay(env, fetched.daily.puzzleId);
      }
    })();
  } else if (route === "submit") {
    dataPromise = (async () => {
      const engine = createEngine({
        puzzles: d1Puzzles(env.DB),
        sessions: d1Sessions(env.DB),
      });
      fetched.categories = uniqueCategories(await engine.listPuzzles());
    })();
  } else if (route === "play") {
    dataPromise = resolvePlay(env, Number(url.searchParams.get("play"))).then(p => { fetched.play = p; });
  } else if (route === "moderate") {
    dataPromise = (async () => {
      const u = await userPromise;
      if (u && u.isModerator) {
        [fetched.modPending, fetched.modCatalogue] = await Promise.all([
          d1Submissions(env.DB).listPending(),
          d1Puzzles(env.DB).listApprovedWithPhrases(),
        ]);
      }
    })();
  } else if (route === "admin") {
    dataPromise = (async () => {
      const u = await userPromise;
      if (u && u.isAdmin) {
        [fetched.adminElevated, fetched.adminCatalogue] = await Promise.all([
          d1Users(env.DB).listByRoles(["moderator", "admin"]),
          d1Puzzles(env.DB).listAllWithStats().then(rows => rows.map(catalogueRow)),
        ]);
      }
    })();
  }

  let user = null;
  try {
    [user] = await Promise.all([userPromise, dataPromise.catch(e => { dataError = e; })]);
  } catch (e) {
    dataError = e;
  }

  const ctx = {
    route,
    pathname: url.pathname,
    user,
    daily: fetched.daily,
    error: dataError ? String(dataError?.message || dataError) : null,
    play: fetched.play,
    submit: {
      existingCategories: fetched.categories,
    },
    moderate: {
      pending: fetched.modPending,
      catalogue: fetched.modCatalogue,
      forbidden: route === "moderate" && !(user && user.isModerator),
    },
    admin: {
      elevated: fetched.adminElevated,
      catalogue: fetched.adminCatalogue,
      currentHandle: user?.handle || null,
      forbidden: route === "admin" && !(user && user.isAdmin),
    },
  };

  const assets = await assetsPromise;
  const html = renderPage(ctx, assets);

  /* `private` keeps shared caches (CDN, ISP) out so per-user content
     (the header, the streak, today's played-or-not) stays user-private;
     `no-cache` forces the browser to revalidate before reuse;
     `must-revalidate` disallows serving stale on revalidation failure.
     Unlike `no-store`, this set still permits the back/forward cache,
     which Lighthouse flagged as a perf regression on t4bs.com. */
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-cache, must-revalidate",
    "X-T4BS-SSR": "bn",
  };
  if (setCookie) headers["Set-Cookie"] = setCookie;

  return new Response(html, { status: route === "not-found" ? 404 : 200, headers });
}

/** @param {Array<{category:string}>} listing */
function uniqueCategories(listing) {
  const seen = new Set();
  for (const p of listing || []) seen.add(p.category);
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** The board of one approved puzzle as first painted — no session is
 *  started here (sessions are mutating and would create a row per
 *  crawler hit); the client starts the real round on hydration.
 *  @param {any} env @param {number} playId */
async function resolvePlay(env, playId) {
  if (!Number.isFinite(playId) || playId <= 0) return null;
  const puzzleRow = await d1Puzzles(env.DB).getApproved(playId);
  if (!puzzleRow) return null;
  /* v2: the first paint shows the anchor letters everywhere they occur
     (shared/pure.js anchorLetters), the par, and the number under Solve —
     all from the same pure functions the engine uses, so SSR and the
     hydrated board are one function of one row. The phrase itself stays
     server-side: `board` carries letters only where they are revealed. */
  const shape = publicShape(puzzleRow);
  const revealed = anchorLetters(puzzleRow);
  const words = wordsOf(puzzleRow.phrase);
  return {
    ...shape,
    board: boardFor(words, revealed),
    lives: LIVES,
    scoreIfSolved: scoreFor(hiddenCount(words, revealed), LIVES),
  };
}
