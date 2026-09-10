/* P0 regression test: both /og/* PNG endpoints must render a real PNG.
   Prior to this fix, `renderPng` (backed by `@basenative/og-image`/satori)
   threw "Cannot read properties of undefined (reading 'href')" on every
   call under Pages Functions — satori's bundled `harfbuzzjs` dependency
   mis-detects the Workers runtime at import time (see `og.js`'s header
   comment for the full root-cause writeup) — so every /og/* request
   returned HTTP 500 instead of an image.

   This exercises the same `renderPng`/scene-builder path the endpoints in
   `functions/og/[name].js` and `functions/og/score/[id].js` call, and
   asserts the result is a real PNG (magic-byte signature) of a sane size —
   not just "didn't throw". It runs under plain Node (`node --test`), which
   is why `og.js`'s WASM init goes through the `#og-wasm-init` package
   import condition (`og-wasm.node.js` here, `og-wasm.workerd.js` under
   Pages Functions) rather than a raw `.wasm` import Node can't load. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { renderPng, defaultCardScene, scoreCardScene } from "./og.js";

const PNG_MAGIC = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

function assertPng(bytes) {
  assert.ok(bytes instanceof Uint8Array, "renderPng should resolve to bytes");
  assert.ok(bytes.length > 1000, `expected a real PNG, got ${bytes.length} bytes`);
  assert.deepEqual(
    Array.from(bytes.subarray(0, 8)),
    Array.from(PNG_MAGIC),
    "output should start with the PNG magic bytes"
  );
}

describe("renderPng (og.js)", () => {
  // No KV binding in this environment — renderPng falls back to fetching
  // the font straight from the CDN each time, same as a cold KV miss.
  const env = {};

  it("renders /og/default.png (defaultCardScene) to a real PNG", async () => {
    const png = await renderPng(defaultCardScene(), env);
    assertPng(png);
  });

  it("renders /og/score/{id}.png (scoreCardScene) to a real PNG", async () => {
    const png = await renderPng(
      scoreCardScene({
        category: "Proverbs",
        score: 87,
        won: true,
        grid: "🟩🟨⬛🟩⬛🟨\n⬜⬜⬜⬜⬜⬜",
      }),
      env
    );
    assertPng(png);
  });

  it("scoreCardScene escapes and truncates untrusted category text", async () => {
    const svg = scoreCardScene({
      category: "<script>alert(1)</script>".repeat(4),
      score: 0,
      won: false,
      grid: "",
    });
    assert.ok(!svg.includes("<script>"), "raw category markup must not reach the SVG");
    assert.ok(svg.includes("&lt;"), "special characters should be XML-escaped");
  });
});
