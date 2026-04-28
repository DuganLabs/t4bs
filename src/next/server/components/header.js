/* SSR: page header. Mirrors src/components/header.js's DOM exactly so
   the hydrator can attach signal-driven updates without re-rendering. */

import { esc, join } from "../../util/escape.js";

/** @typedef {{ handle: string, isAdmin?: boolean, isModerator?: boolean } | null} SsrUser */

/**
 * @param {{
 *   view: 'lobby'|'play'|'submit'|'moderate'|'admin'|'not-found',
 *   user: SsrUser,
 *   score?: number, lives?: number, tokens?: number,
 * }} ctx
 */
export function ssrHeader(ctx) {
  const isPlaying = ctx.view === "play";
  const score  = ctx.score  ?? 0;
  const lives  = ctx.lives  ?? 4;
  const tokens = ctx.tokens ?? 0;
  const u = ctx.user;

  const lifeDots = Array.from({ length: 4 }, (_, i) =>
    `<div class="lb-life${i >= lives ? " dead" : ""}" aria-hidden="true"></div>`
  ).join("");

  return `<header class="lb-hd">
    <button class="lb-logo" type="button" data-bn-action="logo" aria-label="Back to lobby">
      <span class="lb-logo-box" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M2.5 3.5h7M6 3.5v8" stroke="#1A0A00" stroke-width="1.6" stroke-linecap="round" />
          <circle cx="10.5" cy="10" r="1.4" fill="#1A0A00" />
        </svg>
      </span>T4BS</button>
    <div class="lb-hd-r">
      <div class="lb-tok${join(!(isPlaying && tokens > 0) && " is-hidden")}" data-bn-bind="token-chip">
        <span data-bn-bind="token-text">⚡ ${esc(tokens)}</span>
      </div>
      <div class="lb-score${join(!isPlaying && " is-hidden")}" role="status" aria-live="polite" data-bn-bind="score-chip">
        <span class="lb-snum" data-bn-bind="score-num">${esc(score)}</span> pts
      </div>
      <div class="lb-lives${join(!isPlaying && " is-hidden")}" role="status" aria-live="polite"
           aria-label="${esc(lives)} of 4 lives remaining" data-bn-bind="lives">${lifeDots}</div>
      <div class="lb-uctrl${join(isPlaying && " is-hidden")}" data-bn-bind="uctrl">
        <button class="lb-ubtn" type="button" data-bn-action="help" aria-label="How to play">?</button>
        <span class="lb-uhandle${join(!u && " is-hidden")}" data-bn-bind="uhandle">${esc(u?.handle || "")}</span>
        <button class="lb-ubtn${join(!(u?.isModerator || u?.isAdmin) && " is-hidden")}"
                type="button" data-bn-action="mod">MOD</button>
        <button class="lb-ubtn${join(!u?.isAdmin && " is-hidden")}"
                type="button" data-bn-action="admin">ADM</button>
        <button class="lb-ubtn${join(!u && " is-hidden")}"
                type="button" data-bn-action="logout">OUT</button>
        <button class="lb-ubtn primary${join(!!u && " is-hidden")}"
                type="button" data-bn-action="login">LOG IN</button>
      </div>
    </div>
  </header>`;
}
