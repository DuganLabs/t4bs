/* Reads dist/asset-manifest.json (emitted via vite build) and resolves
   the hashed JS + transitively-imported CSS for the next-hydrate entry.
   Cached per isolate so we only fetch + parse once per warm worker.

   The manifest is shipped as a static asset at /asset-manifest.json by
   wrangler pages — we read it via env.ASSETS.fetch(). Falls back to a
   sensible dev-time default when manifest is missing (vite dev). */

const ENTRY_KEY = "src/next/client/main.js";
const DEV_FALLBACK = { js: "/src/next/client/main.js", css: [] };

/** @typedef {{ file: string, css?: string[], imports?: string[] }} Chunk */
/** @typedef {Record<string, Chunk>} Manifest */

/** @type {Promise<{ js: string, css: string[] }> | null} */
let cached = null;

/** @param {{ ASSETS?: { fetch(req: Request): Promise<Response> } } | undefined} env @param {URL} pageUrl */
export function loadAssets(env, pageUrl) {
  if (cached) return cached;
  cached = (async () => {
    if (!env?.ASSETS) return DEV_FALLBACK;
    try {
      const manifestUrl = new URL("/asset-manifest.json", pageUrl.origin);
      const r = await env.ASSETS.fetch(new Request(manifestUrl.toString()));
      if (!r.ok) return DEV_FALLBACK;
      /** @type {Manifest} */
      const manifest = await r.json();
      const entry = manifest[ENTRY_KEY];
      if (!entry?.file) return DEV_FALLBACK;
      return {
        js: `/${entry.file}`,
        css: collectCss(manifest, ENTRY_KEY).map(c => `/${c}`),
      };
    } catch {
      return DEV_FALLBACK;
    }
  })();
  return cached;
}

/* Walks `imports` transitively to gather every CSS file the entry pulls
   in via shared chunks. Vite only lists `css` on the chunk that owns it,
   so an entry that imports a shared chunk needs this resolution. */
/** @param {Manifest} manifest @param {string} entryKey @returns {string[]} */
function collectCss(manifest, entryKey) {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  /** @param {string} key */
  function walk(key) {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) return;
    for (const css of chunk.css || []) out.push(css);
    for (const imp of chunk.imports || []) walk(imp);
  }
  walk(entryKey);
  return out;
}

/* Test-only — drop the cached manifest so a hot-reload picks up changes. */
export function _resetAssetsCache() { cached = null; }
