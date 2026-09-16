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
    /* Unit tests under functions/, shared/ and server/ run in `node --test`,
       not in workerd. Node globals really are available to them, so the
       worker preset's "there is no `process`" rule is wrong here — it is a
       rule about shipped code. */
    files: ["functions/**/*.test.js", "shared/**/*.test.js", "server/**/*.test.js"],
    languageOptions: { globals: { process: "readonly" } },
    rules: { "no-restricted-globals": "off" },
  },
  {
    ignores: [
      "dist/",
      ".wrangler/",
      "node_modules/",
      "public/",
      "migrations/",
    ],
  },
];
