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

export default defineConfig({
  resolve: {
    alias: [
      { find: /^\.\.\/\.\.\/\.\.\/src\/shared\/expression\.js$/, replacement: expressionShim },
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
  },
});
