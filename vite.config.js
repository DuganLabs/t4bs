import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { createMockApi } from "./server/mock.js";

/* The published @basenative/runtime@0.4.0 evaluate.js still references
   `../../../src/shared/expression.js` — a path that only resolves inside
   the basenative monorepo. We don't use the template `evaluate` codepath
   ourselves (we drive DOM imperatively from signals via src/lib/dom.js),
   but the runtime barrel statically imports hydrate → bind → evaluate.
   The alias below points the broken specifier at a vendored copy so vite
   can resolve the chain; tree-shaking still drops the unused functions
   in production. */
const expressionShim = fileURLToPath(new URL("./src/lib/_bn-expression.js", import.meta.url));
const indexEntry     = fileURLToPath(new URL("./index.html",                 import.meta.url));
const bnHydrateEntry = fileURLToPath(new URL("./src/bn/client/hydrate.js",   import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^\.\.\/\.\.\/\.\.\/src\/shared\/expression\.js$/, replacement: expressionShim },
    ],
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [
        {
          name: "shim-bn-expression",
          setup(build) {
            build.onResolve({ filter: /^\.\.\/\.\.\/\.\.\/src\/shared\/expression\.js$/ }, () => ({ path: expressionShim }));
          },
        },
      ],
    },
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
