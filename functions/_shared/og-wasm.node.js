/* Node-safe WASM bootstrap for `@resvg/resvg-wasm` — used by `node --test`
   (see `og.test.js`). A static `import ... from "*.wasm"` fails at link
   time under plain Node, so this resolves the `.wasm` file's path with
   `createRequire` and reads its bytes with `fs/promises` instead, exactly
   as `@basenative/og-image`'s own `wasm.node.js` does for the same
   package. Selected via the "default" condition in this package's
   `package.json` "imports" map for `#og-wasm-init`. */
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

import { initWasm } from "@resvg/resvg-wasm";

const require = createRequire(import.meta.url);

let _inited = false;
let _initPromise = null;

export function ensureResvg() {
  if (_inited) return Promise.resolve();
  if (!_initPromise) {
    _initPromise = (async () => {
      const wasmPath = require.resolve("@resvg/resvg-wasm/index_bg.wasm");
      const bytes = await readFile(wasmPath);
      await initWasm(bytes);
      _inited = true;
    })();
  }
  return _initPromise;
}
