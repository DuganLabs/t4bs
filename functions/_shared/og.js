/* OG image render helper.

   Uses `satori` to convert a vh-tree (object literal) into SVG, then
   `@resvg/resvg-wasm` to rasterize SVG → PNG. Both run on Cloudflare
   Pages Functions / Workers.

   Font + wasm are fetched from CDN on first request and cached in KV
   under the OG_CACHE binding. Subsequent requests on warm isolates
   reuse the in-memory copies; cold isolates pull from KV.

   Card design tokens mirror the in-app palette:
     bg     #0C0B09   fg #F0EDE4   accent #E8920A
     muted  #988570   tile #FFF3E0 / #5C2A00
*/

import satori from "satori";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
// Static WASM import — wrangler bundles this as a WebAssembly.Module, which
// is required on Cloudflare Workers (dynamic instantiate from a buffer is
// disallowed by the embedder).
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";

const FONT_URL_700 = "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-700-normal.woff";
const FONT_URL_800 = "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-800-normal.woff";
const FONT_URL_600 = "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-600-normal.woff";

let _font700, _font800, _font600;
let _resvgInited = false;

async function fetchAndCache(env, key, url) {
  const cache = env.OG_CACHE;
  if (cache) {
    const cached = await cache.get(key, "arrayBuffer");
    if (cached) return cached;
  }
  const r = await fetch(url, { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!r.ok) throw new Error(`og-asset-fetch-failed: ${key} ${r.status}`);
  const buf = await r.arrayBuffer();
  if (cache) {
    // long TTL — these are immutable URLs.
    await cache.put(key, buf, { expirationTtl: 60 * 60 * 24 * 365 });
  }
  return buf;
}

async function loadFonts(env) {
  if (!_font700) _font700 = await fetchAndCache(env, "font:inter-700", FONT_URL_700);
  if (!_font800) _font800 = await fetchAndCache(env, "font:inter-800", FONT_URL_800);
  if (!_font600) _font600 = await fetchAndCache(env, "font:inter-600", FONT_URL_600);
  return [
    { name: "Inter", data: _font600, weight: 600, style: "normal" },
    { name: "Inter", data: _font700, weight: 700, style: "normal" },
    { name: "Inter", data: _font800, weight: 800, style: "normal" },
  ];
}

async function ensureResvg() {
  if (_resvgInited) return;
  await initWasm(resvgWasm);
  _resvgInited = true;
}

export async function renderPng(scene, env, { width = 1200, height = 630 } = {}) {
  const fonts = await loadFonts(env);
  await ensureResvg();
  const svg = await satori(scene, { width, height, fonts });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  return resvg.render().asPng();
}

/* ─── Scene builders (object-literal vh-tree, satori-compatible) ─── */

const COLORS = {
  bg:     "#0C0B09",
  fg:     "#F0EDE4",
  muted:  "#988570",
  accent: "#E8920A",
  tile:   "#FFF3E0",
  letter: "#5C2A00",
  green:  "#3F9D5B",
  yellow: "#E8B73B",
  absent: "#3A332B",
  empty:  "#1A1714",
};

function el(type, style, children) {
  return { type, props: { style, children } };
}

function box(style, children) { return el("div", { display: "flex", ...style }, children); }
function txt(style, content)  { return el("div", { display: "flex", ...style }, content); }

/* Mini grid: rows of small squares colored by tile state.
   `gridString` is the same emoji-grid the share text uses, parsed back.
   Glyph map: 🟩 green, 🟨 yellow, ⬛ absent, ⬜ empty. */
function parseGrid(gridString) {
  const rows = [];
  for (const line of gridString.split("\n")) {
    const row = [];
    // Iterate by code-point to handle emoji.
    for (const ch of line) {
      if (ch === "🟩") row.push("green");
      else if (ch === "🟨") row.push("yellow");
      else if (ch === "⬛") row.push("absent");
      else if (ch === "⬜") row.push("empty");
    }
    if (row.length) rows.push(row);
  }
  return rows;
}

function tileGrid(rows, { tileSize = 44, gap = 7 } = {}) {
  return box(
    { flexDirection: "column", gap },
    rows.map((row, ri) =>
      box(
        { flexDirection: "row", gap },
        row.map((state, ci) =>
          box(
            {
              width: tileSize, height: tileSize, borderRadius: 7,
              backgroundColor: COLORS[state] || COLORS.empty,
              border: state === "empty" ? `1px solid ${COLORS.absent}` : "none",
            },
            []
          )
        )
      )
    )
  );
}

export function scoreCardScene({ category, score, won, grid }) {
  const rows = parseGrid(grid || "").slice(0, 6);
  const verdictColor = won ? COLORS.green : "#E84444";
  return box(
    {
      width: 1200, height: 630,
      flexDirection: "column",
      backgroundColor: COLORS.bg,
      color: COLORS.fg,
      padding: 60,
      fontFamily: "Inter",
      justifyContent: "space-between",
    },
    [
      // Top: header + category
      box({ flexDirection: "column" }, [
        box({ flexDirection: "row", alignItems: "baseline", gap: 18 }, [
          txt({ fontSize: 84, fontWeight: 800, color: COLORS.accent, letterSpacing: -3, lineHeight: 1 }, "T4BS"),
          txt(
            { fontSize: 28, fontWeight: 700, color: verdictColor, letterSpacing: 6, textTransform: "uppercase", lineHeight: 1 },
            won ? "Solved" : "Busted"
          ),
        ]),
        txt(
          { fontSize: 36, fontWeight: 600, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginTop: 14, lineHeight: 1.1, maxWidth: 1080 },
          category
        ),
      ]),

      // Middle: tile grid (left) + score (right), aligned to baseline
      box(
        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
        [
          tileGrid(rows, { tileSize: 52, gap: 8 }),
          box({ flexDirection: "row", alignItems: "baseline", gap: 14 }, [
            txt({ fontSize: 200, fontWeight: 800, color: COLORS.fg, letterSpacing: -8, lineHeight: 1 }, String(score)),
            txt({ fontSize: 60, fontWeight: 700, color: COLORS.accent, lineHeight: 1 }, "pts"),
          ]),
        ]
      ),

      // Bottom: brand pinned right
      box({ flexDirection: "row", justifyContent: "flex-end" }, [
        txt({ fontSize: 30, fontWeight: 700, color: COLORS.muted, letterSpacing: 1, lineHeight: 1 }, "t4bs.com"),
      ]),
    ]
  );
}

export function defaultCardScene() {
  return box(
    {
      width: 1200, height: 630,
      flexDirection: "column",
      backgroundColor: COLORS.bg,
      color: COLORS.fg,
      padding: 80,
      fontFamily: "Inter",
      justifyContent: "center",
    },
    [
      txt({ fontSize: 200, fontWeight: 800, color: COLORS.accent, letterSpacing: -8 }, "T4BS"),
      txt(
        { fontSize: 56, fontWeight: 700, color: COLORS.fg, marginTop: 12, lineHeight: 1.15, maxWidth: 1040 },
        "One subject. One phrase. Stake the letters you're sure about."
      ),
      box({ flexDirection: "row", alignItems: "center", marginTop: 64, gap: 16 }, [
        // Decorative tile row
        ...["green","yellow","absent","empty","green","yellow"].map(state =>
          box(
            { width: 80, height: 80, borderRadius: 12, backgroundColor: COLORS[state] || COLORS.empty,
              border: state === "empty" ? `1px solid ${COLORS.absent}` : "none" },
            []
          )
        ),
      ]),
      box(
        { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto" },
        [
          txt({ fontSize: 32, fontWeight: 600, color: COLORS.muted }, "Pick a category. Solve the phrase."),
          txt({ fontSize: 32, fontWeight: 700, color: COLORS.accent }, "t4bs.com"),
        ]
      ),
    ]
  );
}

export function pngHeaders({ immutable = true } = {}) {
  return {
    "Content-Type": "image/png",
    "Cache-Control": immutable
      ? "public, max-age=31536000, s-maxage=31536000, immutable"
      : "public, max-age=300, s-maxage=300",
  };
}
