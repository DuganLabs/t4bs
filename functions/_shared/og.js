/* OG image render helper.

   Renders our OG/share-card scenes as hand-built SVG, rasterized to PNG by
   `@resvg/resvg-wasm`. Keeps t4bs's brand-specific pip layout (orange dots,
   not Wordle-style colored tiles) per ADR-style branding decision.

   Card design tokens mirror the in-app palette:
     bg     #0C0B09   fg #F0EDE4   accent #E8920A
     muted  #988570   tile #FFF3E0 / #5C2A00

   Why not `@basenative/og-image` (satori) — P0 fix, 2026-09:
   Every /og/* endpoint returned HTTP 500 "render-failed: Cannot read
   properties of undefined (reading 'href')". Root cause: `satori`
   unconditionally imports `harfbuzzjs` (its text-shaper) at module load,
   and harfbuzzjs's bundled Emscripten loader mis-sniffs the Pages
   Functions/`nodejs_compat` runtime as a browser Worker, reading
   `self.location.href` — a property workerd doesn't implement — before any
   of our code runs. Past that, neither of harfbuzzjs's two loading
   strategies is actually viable under Workers: there's no real filesystem,
   and its fetch-then-`WebAssembly.instantiate(bytes)` fallback is the same
   "compile WASM from raw bytes at runtime" Workers disallow outright (see
   this repo's CLAUDE.md "WASM gotcha", already solved for `@resvg/resvg-
   wasm` below via a *static* `.wasm` import). satori's own Yoga (layout)
   dependency has the identical dynamic-compile problem on its default
   import path. Both are upstream bugs in a third-party dependency chain
   we can't practically fix from here without publishing a patched
   `@basenative/og-image` — so instead of fighting satori's WASM stack, we
   lay out these (small, fixed) cards as SVG ourselves and rasterize with
   `@resvg/resvg-wasm`, which this codebase already uses successfully via a
   static WASM import and which does its own font shaping — no satori, no
   Yoga, no harfbuzzjs needed. */

import { Resvg } from "@resvg/resvg-wasm";
// `#og-wasm-init` resolves to a static `.wasm` import under Workers
// (`og-wasm.workerd.js` — wrangler compiles it ahead of time; Cloudflare
// disallows compiling WASM from a raw buffer at runtime) and to an
// fs-read-based init under plain Node (`og-wasm.node.js`, for
// `og.test.js`). See this repo's CLAUDE.md "WASM gotcha" and the
// `package.json` "imports" map.
import { ensureResvg } from "#og-wasm-init";

const COLORS = {
  bg:     "#0C0B09",
  fg:     "#F0EDE4",
  muted:  "#988570",
  accent: "#E8920A",
  tile:   "#FFF3E0",
  letter: "#5C2A00",
  green:  "#3F9D5B",
  empty:  "#1A1714",
};

// --- Fonts (Inter, KV-cached) ------------------------------------------

// A single variable-font TTF (weight axis `wght`) rather than per-weight
// static files: `resvg`'s bundled `fontdb`/`ttf-parser` can't parse the
// `.woff` files `@fontsource` publishes (fontdb only understands raw
// sfnt TTF/OTF), so per-weight `@fontsource` woff files silently render no
// glyphs at all. This is Google Fonts' own upstream TTF, mirrored by
// jsdelivr's GitHub passthrough (same immutable-by-commit CDN semantics as
// the `@fontsource` URLs elsewhere in this codebase).
const FONT_CACHE_BINDING = "OG_CACHE";
const FONT_CACHE_KEY = "font:inter-variable-ttf-v1";
const FONT_URL =
  "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf";

/** @type {ArrayBuffer | null} */
let _fontMemo = null;

async function loadFontBuffers(env) {
  if (_fontMemo) return [new Uint8Array(_fontMemo)];

  const cache = env && env[FONT_CACHE_BINDING];
  if (cache && typeof cache.get === "function") {
    const cached = await cache.get(FONT_CACHE_KEY, "arrayBuffer");
    if (cached) {
      _fontMemo = cached;
      return [new Uint8Array(cached)];
    }
  }

  const r = await fetch(FONT_URL, { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!r.ok) throw new Error(`og-font-fetch-failed: inter ${r.status}`);
  const buf = await r.arrayBuffer();

  if (cache && typeof cache.put === "function") {
    await cache.put(FONT_CACHE_KEY, buf, { expirationTtl: 60 * 60 * 24 * 365 });
  }
  _fontMemo = buf;
  return [new Uint8Array(buf)];
}

// --- Rendering -----------------------------------------------------------

/**
 * Rasterize an SVG string to PNG bytes.
 * @param {string} svg
 * @param {Record<string, any>} env
 * @returns {Promise<Uint8Array>}
 */
export async function renderPng(svg, env) {
  const [fontBuffers] = await Promise.all([loadFontBuffers(env), ensureResvg()]);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
    font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: "Inter" },
  });
  return resvg.render().asPng();
}

export function pngHeaders(opts = {}) {
  const immutable = opts.immutable ?? true;
  return {
    "Content-Type": "image/png",
    "Cache-Control": immutable
      ? "public, max-age=31536000, s-maxage=31536000, immutable"
      : "public, max-age=300, s-maxage=300",
  };
}

// --- Scene helpers ---------------------------------------------------------

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]
  ));
}

function truncate(s, max) {
  const str = String(s ?? "");
  return str.length > max ? `${str.slice(0, max - 1).trimEnd()}…` : str;
}

/** Parse the emoji result grid into row-major tile states. */
export function parseGrid(gridString) {
  const rows = [];
  for (const line of String(gridString || "").split("\n")) {
    const row = [];
    for (const ch of line) {
      if (ch === "\u{1F7E9}") row.push("green");
      else if (ch === "\u{1F7E8}") row.push("yellow");
      else if (ch === "⬛") row.push("absent");
      else if (ch === "⬜") row.push("empty");
    }
    if (row.length) rows.push(row);
  }
  return rows;
}

/* Per-position pip rendering. Brand-aligned, zero Wordle palette.
   - green:  filled brand-orange dot   (player knew this letter cold)
   - yellow: brand-orange hollow ring  (letter present, position unknown)
   - absent: small dim dot             (letter absent at this position)
   - empty:  dim outlined ring         (position never tested)
   The result reads as a progress trail of dots, not a tile grid. */
function pipSvg(state, cx, cy, size) {
  const r = size / 2;
  switch (state) {
    case "green":
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${COLORS.accent}"/>`;
    case "yellow":
      return `<circle cx="${cx}" cy="${cy}" r="${r - 1.5}" fill="none" stroke="${COLORS.accent}" stroke-width="3"/>`;
    case "absent":
      return `<circle cx="${cx}" cy="${cy}" r="${Math.round(size * 0.18)}" fill="#3A332B"/>`;
    case "empty":
    default:
      return `<circle cx="${cx}" cy="${cy}" r="${r - 1}" fill="none" stroke="#2A2521" stroke-width="2"/>`;
  }
}

function pipGridSvg(rows, { x, y, dotSize = 36, rowGap = 14, pipGap = 12 } = {}) {
  const parts = [];
  rows.forEach((row, ri) => {
    const cy = y + ri * (dotSize + rowGap) + dotSize / 2;
    row.forEach((state, ci) => {
      const cx = x + ci * (dotSize + pipGap) + dotSize / 2;
      parts.push(pipSvg(state, cx, cy, dotSize));
    });
  });
  return parts.join("");
}

function text({ x, y, size, weight = 600, fill, letterSpacing, anchor = "start", uppercase }) {
  return (text_) => {
    // Uppercase first, then escape — escaping produces XML entities
    // (e.g. "&lt;") whose case matters; uppercasing *after* escaping would
    // mangle them into invalid entities like "&LT;".
    const content = uppercase ? esc(text_.toUpperCase()) : esc(text_);
    const ls = letterSpacing != null ? ` letter-spacing="${letterSpacing}"` : "";
    return `<text x="${x}" y="${y}" font-family="Inter" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="hanging"${ls}>${content}</text>`;
  };
}

function svgDoc(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">${inner}</svg>`;
}

export function scoreCardScene({ category, score, won, grid }) {
  const rows = parseGrid(grid || "").slice(0, 6);
  const verdictColor = won ? COLORS.green : "#E84444";
  const verdictLabel = won ? "SOLVED" : "BUSTED";
  const scoreStr = String(score ?? 0);

  const parts = [];
  parts.push(`<rect x="0" y="0" width="1200" height="630" fill="${COLORS.bg}"/>`);

  // Header: T4BS + verdict
  parts.push(text({ x: 60, y: 50, size: 76, weight: 800, fill: COLORS.accent, letterSpacing: -3 })("T4BS"));
  parts.push(text({ x: 275, y: 65, size: 26, weight: 700, fill: verdictColor, letterSpacing: 5 })(verdictLabel));

  // Category
  parts.push(
    text({ x: 60, y: 155, size: 32, weight: 600, fill: COLORS.muted, letterSpacing: 2, uppercase: true })(
      truncate(category || "", 44)
    )
  );

  // Middle: pip grid (left) + score (right), "{score} pts" as one
  // baseline-aligned line so the unit sits right next to the number.
  parts.push(pipGridSvg(rows, { x: 60, y: 270, dotSize: 36, rowGap: 14, pipGap: 12 }));
  parts.push(
    `<text x="1140" y="410" font-family="Inter" text-anchor="end" dominant-baseline="alphabetic">` +
      `<tspan font-size="170" font-weight="800" fill="${COLORS.fg}" letter-spacing="-6">${esc(scoreStr)}</tspan>` +
      `<tspan font-size="46" font-weight="700" fill="${COLORS.accent}" dx="10">pts</tspan>` +
      `</text>`
  );

  // Footer: brand pinned bottom-right
  parts.push(text({ x: 1140, y: 536, size: 28, weight: 700, fill: COLORS.muted, anchor: "end", letterSpacing: 1 })("t4bs.com"));

  return svgDoc(parts.join(""));
}

export function defaultCardScene() {
  const parts = [];
  parts.push(`<rect x="0" y="0" width="1200" height="630" fill="${COLORS.bg}"/>`);

  parts.push(text({ x: 80, y: 64, size: 170, weight: 800, fill: COLORS.accent, letterSpacing: -6 })("T4BS"));
  parts.push(text({ x: 80, y: 300, size: 50, weight: 700, fill: COLORS.fg })("One subject. One phrase."));
  parts.push(text({ x: 80, y: 360, size: 50, weight: 700, fill: COLORS.fg })("Every letter you didn't need is ten points."));

  ["green", "yellow", "empty", "green", "absent", "yellow"].forEach((state, i) => {
    const cx = 80 + i * (56 + 16) + 28;
    parts.push(pipSvg(state, cx, 460 + 28, 56));
  });

  parts.push(text({ x: 80, y: 572, size: 26, weight: 600, fill: COLORS.muted })("Pick a category. Solve the phrase."));
  parts.push(text({ x: 1120, y: 572, size: 26, weight: 700, fill: COLORS.accent, anchor: "end" })("t4bs.com"));

  return svgDoc(parts.join(""));
}
