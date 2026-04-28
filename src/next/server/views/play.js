/* SSR: play view. The grid + bank are highly stateful — we render a
   meaningful first paint (category, word lengths, anchor letters) and
   leave the interactive surface (typing, wagers, cascade, all-in,
   keyboard, end overlays) to the hydrator. Without ?play= or a resumable
   session, falls through to a "loading round…" placeholder so a hard
   reload at /play doesn't show a blank shell. */

import { esc } from "../../util/escape.js";

/**
 * @typedef {{
 *   id: number,
 *   category: string,
 *   submittedBy?: string,
 *   words: number[],
 *   totalLetters: number,
 *   anchors: Array<{wi:number, li:number, letter:string}>,
 * }} PlaySsr
 */

/** @param {{ session: PlaySsr | null }} ctx */
export function ssrPlay(ctx) {
  const s = ctx.session;
  if (!s) {
    return `<div class="lb-play-host" data-bn-view="play">
      <main aria-labelledby="lb-play-title">
        <h1 id="lb-play-title" class="sr-only">Loading round</h1>
        <div class="lb-cred" data-bn-bind="play-loading">loading round…</div>
      </main>
    </div>`;
  }

  const anchorMap = new Map();
  for (const a of s.anchors) anchorMap.set(`${a.wi}-${a.li}`, a.letter);

  const phraseGrid = s.words.map((wordLen, wi) => {
    let tiles = "";
    for (let li = 0; li < wordLen; li++) {
      const anchor = anchorMap.get(`${wi}-${li}`);
      const cls = anchor ? "lb-tile locked-green" : "lb-tile";
      const aria = anchor
        ? `${anchor} at position ${li + 1} of word ${wi + 1}, locked`
        : `Empty at position ${li + 1} of word ${wi + 1}`;
      tiles += `<div class="${cls}" role="img" aria-label="${esc(aria)}">${esc(anchor || "")}</div>`;
    }
    return `<div class="lb-word" data-wi="${wi}">${tiles}</div>`;
  }).join("");

  const wordCount = s.words.length;
  const wordsLabel = `${wordCount} word${wordCount === 1 ? "" : "s"}`;

  return `<div class="lb-play-host" data-bn-view="play"
              data-bn-session-id="${esc(s.id)}"
              data-bn-words="${esc(s.words.join(","))}">
    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true"
         data-bn-bind="play-announce"></div>
    <main aria-labelledby="lb-play-title">
      <h1 id="lb-play-title" class="sr-only">${esc(s.category)} — round #${esc(s.id)}</h1>
      <div class="lb-num">#${esc(s.id)} · ${esc(s.category.toLowerCase())}</div>
      <div class="lb-sticky">${esc(s.category)}</div>
      <div class="lb-sub">${esc(wordsLabel)} · ${esc(s.totalLetters)} letters · by <b>${esc(s.submittedBy || "?")}</b></div>
      <div class="lb-hint" aria-live="polite" data-bn-bind="play-hint"></div>
      <div class="lb-cbar is-hidden" role="status" aria-live="polite" data-bn-bind="play-cbar"></div>
      <div class="lb-phrase" data-bn-bind="play-grid">${phraseGrid}</div>
      <div class="lb-bank" data-bn-bind="play-bank">
        <div class="lb-bank-row">
          <span class="lb-bank-label">in phrase:</span>
          <span class="lb-bank-label">—</span>
        </div>
        <div class="lb-bank-row"></div>
      </div>
    </main>
    <div class="lb-kb-wrap" role="region" aria-label="On-screen keyboard for game play"
         data-bn-bind="play-keyboard"></div>
    <div class="lb-ov is-hidden" data-bn-bind="play-won"></div>
    <div class="lb-ov is-hidden" data-bn-bind="play-lost"></div>
  </div>`;
}

/** Empty placeholder — shown when the player navigates to /play without a session. */
export function ssrPlayEmpty() {
  return ssrPlay({ session: null });
}
