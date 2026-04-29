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
import {
  d1Puzzles, d1Sessions, d1Submissions, d1Users,
} from "./d1.js";
import {
  currentUser, getRole, isAdmin, isModerator,
} from "./util.js";

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

  /** @type {{ lobby: any[] | null, play: any, modPending: any[] | null, adminElevated: any[] | null }} */
  const fetched = { lobby: null, play: null, modPending: null, adminElevated: null };
  let dataError = null;

  /** @type {Promise<unknown>} */
  let dataPromise = Promise.resolve();

  if (route === "lobby" || route === "submit") {
    dataPromise = (async () => {
      const engine = createEngine({
        puzzles: d1Puzzles(env.DB),
        sessions: d1Sessions(env.DB),
      });
      fetched.lobby = await engine.listPuzzles();
    })();
  } else if (route === "play") {
    dataPromise = resolvePlay(env, url.searchParams).then(p => { fetched.play = p; });
  } else if (route === "moderate") {
    dataPromise = (async () => {
      const u = await userPromise;
      if (u && u.isModerator) fetched.modPending = await d1Submissions(env.DB).listPending();
    })();
  } else if (route === "admin") {
    dataPromise = (async () => {
      const u = await userPromise;
      if (u && u.isAdmin) fetched.adminElevated = await d1Users(env.DB).listByRoles(["moderator", "admin"]);
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
    lobby: fetched.lobby,
    error: dataError ? String(dataError?.message || dataError) : null,
    play: fetched.play,
    submit: {
      existingCategories: route === "submit" ? uniqueCategories(fetched.lobby) : [],
    },
    moderate: {
      pending: fetched.modPending,
      forbidden: route === "moderate" && !(user && user.isModerator),
    },
    admin: {
      elevated: fetched.adminElevated,
      currentHandle: user?.handle || null,
      forbidden: route === "admin" && !(user && user.isAdmin),
    },
  };

  const assets = await assetsPromise;
  const html = renderPage(ctx, assets);

  return new Response(html, {
    status: route === "not-found" ? 404 : 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      /* `private` keeps shared caches (CDN, ISP) out so per-user
         header content stays user-private; `no-cache` forces the
         browser to revalidate before reuse; `must-revalidate`
         disallows serving stale on revalidation failure. Unlike
         `no-store`, this set still permits the back/forward cache,
         which Lighthouse flagged as a perf regression on t4bs.com. */
      "Cache-Control": "private, no-cache, must-revalidate",
      "X-T4BS-SSR": "bn",
    },
  });
}

/** @param {Array<{category:string}>} lobby */
function uniqueCategories(lobby) {
  const seen = new Set();
  for (const p of lobby || []) seen.add(p.category);
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** @param {any} env @param {URLSearchParams} qs */
async function resolvePlay(env, qs) {
  const playId = Number(qs.get("play"));
  if (!Number.isFinite(playId) || playId <= 0) return null;
  const engine = createEngine({
    puzzles: d1Puzzles(env.DB),
    sessions: d1Sessions(env.DB),
  });
  // Lobby is the canonical source for "is this puzzle playable" — we
  // don't start a session SSR-side (sessions are mutating and would
  // create a row per crawler hit). Instead, surface enough metadata
  // for first paint and let the client kick off the real start.
  const list = await engine.listPuzzles();
  const meta = list.find(p => p.id === playId);
  if (!meta) return null;

  // Pull the full puzzle row so we can SSR word lengths + anchor letters.
  const puzzleRow = await d1Puzzles(env.DB).getApproved(playId);
  if (!puzzleRow) return null;
  const phraseWords = puzzleRow.phrase.split(" ");
  return {
    id: puzzleRow.id,
    category: puzzleRow.category,
    submittedBy: puzzleRow.submittedBy,
    words: phraseWords.map(w => w.length),
    totalLetters: puzzleRow.phrase.replace(/ /g, "").length,
    anchors: puzzleRow.anchors.map(a => ({
      wi: a.wi, li: a.li, letter: phraseWords[a.wi][a.li],
    })),
  };
}
