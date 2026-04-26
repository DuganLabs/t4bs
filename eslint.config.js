/* Flat-config — extends BaseNative's React preset.
   For worker-runtime code (functions/, shared/, server/) we layer the worker
   preset on top — order matters so worker globals + restricted-globals win. */

import react from "@basenative/eslint-config/react";
import worker from "@basenative/eslint-config/worker";

// The worker preset is `[...base, workerOverride, ignores]`. We only need
// the `workerOverride` block, which holds the Workers globals + restricted
// globals rule. Pull it out so we can scope it to worker-runtime files.
const workerOverride = worker.find(
  (b) => b?.languageOptions?.globals && Object.keys(b.languageOptions.globals).includes("self")
);

export default [
  ...react,
  {
    files: ["functions/**/*.{js,mjs}", "shared/**/*.{js,mjs}", "server/**/*.{js,mjs}"],
    languageOptions: workerOverride.languageOptions,
    rules: workerOverride.rules,
  },
  {
    ignores: ["dist/", ".wrangler/", "node_modules/", "public/", "migrations/"],
  },
];
