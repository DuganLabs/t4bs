/* SSR orchestrator. Picks a view by route, composes header + view +
   modals + toast inside #app, wraps in the shell, and returns full HTML
   plus the SSR state blob the client hydrator picks up. */

import { renderShell } from "../shell.js";
import { ssrHeader }   from "./components/header.js";
import { ssrHelpModal } from "./components/help-modal.js";
import { ssrAuthModal } from "./components/auth-modal.js";
import { ssrToast }    from "./components/toast.js";
import { ssrLobby }    from "./views/lobby.js";
import { ssrPlay, ssrPlayEmpty } from "./views/play.js";
import { ssrSubmit }   from "./views/submit.js";
import { ssrModerate } from "./views/moderate.js";
import { ssrAdmin }    from "./views/admin.js";
import { ssrNotFound } from "./views/not-found.js";

/**
 * @typedef {{
 *   route: 'lobby'|'play'|'submit'|'moderate'|'admin'|'not-found',
 *   pathname: string,
 *   user: import("./components/header.js").SsrUser,
 *   lobby: Array<{id:number, category:string, submittedBy:string}> | null,
 *   error: string | null,
 *   play: import("./views/play.js").PlaySsr | null,
 *   submit: { existingCategories: string[] },
 *   moderate: { pending: any[] | null, forbidden?: boolean },
 *   admin: { elevated: any[] | null, currentHandle: string | null, forbidden?: boolean },
 * }} RenderCtx
 */

/** @type {Record<RenderCtx['route'], string>} */
const TITLES = {
  "lobby":     "Tabs — quick category puzzles",
  "play":      "Tabs — playing",
  "submit":    "Tabs — submit a phrase",
  "moderate":  "Tabs — moderation queue",
  "admin":     "Tabs — moderator administration",
  "not-found": "Tabs — not found",
};

/**
 * @param {RenderCtx} ctx
 * @param {{ js: string, css: string[] }} assets
 */
export function renderPage(ctx, assets) {
  /** @type {string} */
  let view;
  switch (ctx.route) {
    case "lobby":     view = ssrLobby({ lobby: ctx.lobby, error: ctx.error }); break;
    case "play":      view = ctx.play ? ssrPlay({ session: ctx.play }) : ssrPlayEmpty(); break;
    case "submit":    view = ssrSubmit(ctx.submit); break;
    case "moderate":  view = ssrModerate(ctx.moderate); break;
    case "admin":     view = ssrAdmin(ctx.admin); break;
    case "not-found":
    default:          view = ssrNotFound({ pathname: ctx.pathname }); break;
  }

  const header = ssrHeader({
    view: ctx.route,
    user: ctx.user,
    score: ctx.play ? 0 : undefined,
    lives: ctx.play ? 4 : undefined,
    tokens: ctx.play ? 0 : undefined,
  });

  const appHtml = `<div class="lb${ctx.route === "play" ? " is-playing" : ""}">
    ${header}
    <div class="lb-view-slot">${view}</div>
  </div>${ssrToast()}${ssrHelpModal()}${ssrAuthModal()}`;

  const ssrState = {
    route: ctx.route,
    pathname: ctx.pathname,
    user: ctx.user,
    lobby: ctx.lobby,
    play: ctx.play,
    submit: ctx.submit,
    moderate: ctx.moderate,
    admin: ctx.admin,
  };

  return renderShell({
    title: TITLES[ctx.route] || TITLES["lobby"],
    canonicalPath: ctx.pathname,
    bodyClass: ctx.route === "play" ? "is-playing" : undefined,
    appHtml,
    ssrState,
    assets,
  });
}
