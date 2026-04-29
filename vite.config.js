import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { createMockApi } from "./server/mock.js";

const indexEntry     = fileURLToPath(new URL("./index.html",                 import.meta.url));
const bnHydrateEntry = fileURLToPath(new URL("./src/bn/client/hydrate.js",   import.meta.url));

export default defineConfig({
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
