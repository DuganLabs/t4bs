import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { createMockApi } from "./server/mock.js";

const indexEntry     = fileURLToPath(new URL("./index.html",                 import.meta.url));
const bnHydrateEntry = fileURLToPath(new URL("./src/bn/client/hydrate.js",   import.meta.url));
const bnExprShim     = fileURLToPath(new URL("./src/_shims/bn-runtime-expression.js", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      /* @basenative/runtime@0.4.0 ships a broken monorepo-relative
         import for shared/expression.js. The SPA never touches the
         expression evaluator; redirect the unresolvable path to a
         local stub so Vite can build. Drop this once the upstream
         tarball is fixed. */
      { find: "../../../src/shared/expression.js", replacement: bnExprShim },
    ],
  },
  /* Exclude @basenative/* from esbuild's pre-bundling so resolve.alias
     above runs against the runtime's broken import (esbuild's optimizer
     bypasses Vite aliases for sub-deps). */
  optimizeDeps: {
    exclude: [
      "@basenative/runtime",
      "@basenative/router",
      "@basenative/persist",
      "@basenative/keyboard",
      "@basenative/combobox",
      "@basenative/share",
      "@basenative/admin/components",
    ],
  },
  plugins: [
    {
      name: "tabs-mock-api",
      configureServer(server) {
        server.middlewares.use("/api", createMockApi());
      },
    },
  ],
  build: {
    outDir: "dist",
    sourcemap: false,
    // SSR worker reads dist/asset-manifest.json (served as
    // /asset-manifest.json) to find the hashed bn-hydrate JS + CSS.
    // Avoid the default `.vite/` dotfile path: Cloudflare Pages may not
    // serve hidden directories.
    manifest: "asset-manifest.json",
    rollupOptions: {
      input: {
        index:        indexEntry,
        "bn-hydrate": bnHydrateEntry,
      },
    },
  },
});
