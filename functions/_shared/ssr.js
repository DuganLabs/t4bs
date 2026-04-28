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

  // Resolve current user once — header + admin/mod gates all need it.
  let user = null;
  try {
    const u = await currentUser(request, env);
    if (u) user = {
      handle: u.handle,
      role: getRole(u),
      isAdmin: isAdmin(u),
      isModerator: isModerator(u),
    };
  } catch { /* anonymous */ }

  const ctx = {
    route,
    pathname: url.pathname,
    user,
    lobby: null,
    error: null,
    play: null,
    submit: { existingCategories: [] },
    moderate: { pending: null, forbidden: false },
    admin: { elevated: null, currentHandle: null, forbidden: false },
  };

  try {
    if (route === "lobby" || route === "submit") {
      const engine = createEngine({
        puzzles: d1Puzzles(env.DB),
        sessions: d1Sessions(env.DB),
      });
      ctx.lobby = await engine.listPuzzles();
      if (route === "submit") {
        ctx.submit.existingCategories = uniqueCategories(ctx.lobby);
      }
    }

    if (route === "play") {
      ctx.play = await resolvePlay(env, url.searchParams);
    }

    if (route === "moderate") {
      if (!user || !user.isModerator) {
        ctx.moderate.forbidden = true;
      } else {
        ctx.moderate.pending = await d1Submissions(env.DB).listPending();
      }
    }

    if (route === "admin") {
      ctx.admin.currentHandle = user?.handle || null;
      if (!user || !user.isAdmin) {
        ctx.admin.forbidden = true;
      } else {
        ctx.admin.elevated = await d1Users(env.DB).listByRoles(["moderator", "admin"]);
      }
    }
  } catch (e) {
    ctx.error = String(e?.message || e);
  }

  const assets = await loadAssets(env, url);
  const html = renderPage(ctx, assets);

  return new Response(html, {
    status: route === "not-found" ? 404 : 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
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
