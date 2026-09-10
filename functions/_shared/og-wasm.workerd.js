/* Static WASM bootstrap for `@resvg/resvg-wasm` under Cloudflare Pages
   Functions. Cloudflare Workers require a static `import` of the `.wasm`
   module so wrangler's bundler can compile it ahead of time — dynamic
   instantiation from a fetched/read buffer at runtime is disallowed by the
   embedder (see this repo's CLAUDE.md "WASM gotcha"). Selected via the
   `#og-wasm-init` entry in this package's `package.json` "imports" map
   (workerd/browser condition); plain Node (incl. `node --test`) falls
   through to `./og-wasm.node.js` instead. Mirrors the same pattern
   `@basenative/og-image`'s own `wasm.workerd.js` uses for the same
   package. */
import { initWasm } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";

let _inited = false;
let _initPromise = null;

export function ensureResvg() {
  if (_inited) return Promise.resolve();
  if (!_initPromise) {
    _initPromise = initWasm(resvgWasm).then(() => {
      _inited = true;
    });
  }
  return _initPromise;
}
