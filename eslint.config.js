/* Flat-config — extends BaseNative's browser preset for the SPA shell.
   For worker-runtime code (functions/, shared/, server/) we layer the worker
   preset on top — order matters so worker globals + restricted-globals win. */

import browser from "@basenative/eslint-config/browser";
import worker from "@basenative/eslint-config/worker";

const workerOverride = worker.find(
  (b) => b?.languageOptions?.globals && Object.keys(b.languageOptions.globals).includes("self")
);

export default [
  ...browser,
  {
    files: ["functions/**/*.{js,mjs}", "shared/**/*.{js,mjs}", "server/**/*.{js,mjs}"],
    languageOptions: workerOverride.languageOptions,
    rules: workerOverride.rules,
  },
  {
    ignores: [
      "dist/",
      ".wrangler/",
      "node_modules/",
      "public/",
      "migrations/",
      "src/lib/_bn-expression.js", // vendored from basenative; not authored here
    ],
  },
];
