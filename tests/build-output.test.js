/* Build-output assertions for the lazy-load split shipped in #64.

   The play-boot shared chunk used to carry submit / moderate / admin
   plus their heavy deps (@basenative/admin, @basenative/combobox) for
   every visitor. Switching the three views to dynamic import() should
   produce three separate on-demand chunks AND cleave their unique
   strings out of the eager bundle.

   We run `vite build` once in `before()` and parse the resulting
   asset-manifest.json + chunk contents. ~80 ms on this repo, fast
   enough to run on every `npm test`. */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");

describe("vite build chunk split (PR #64)", () => {
  let manifest;
  let chunkSources = {};
  /* The eager shared chunk: the largest non-entry chunk both client
     entries import statically. Rollup names it after whichever shared
     module it picks first (play-boot for a long time, route-table once
     hydrate.js and main.js started importing the route table), so it
     is found by shape, not by name. */
  let eagerShared = { name: "", source: "" };

  before(() => {
    /* Always rebuild so the assertion reflects current source. The
       build is tiny (~50 ms in CI). Suppress stdout so node:test's
       output stays clean. */
    execSync("npm run build --silent", { cwd: ROOT, stdio: "pipe" });

    if (!existsSync(join(DIST, "asset-manifest.json"))) {
      throw new Error("asset-manifest.json missing — vite build did not produce manifest");
    }
    manifest = JSON.parse(readFileSync(join(DIST, "asset-manifest.json"), "utf-8"));

    /* Pre-load every chunk's contents so individual tests can grep
       without re-reading from disk. */
    for (const entry of Object.values(manifest)) {
      if (entry.file && entry.file.endsWith(".js")) {
        chunkSources[entry.name || entry.file] = readFileSync(join(DIST, entry.file), "utf-8");
      }
    }

    const entries = ["index.html", "src/bn/client/hydrate.js"].map(k => manifest[k]).filter(Boolean);
    const sharedKeys = entries
      .map(e => new Set(e.imports || []))
      .reduce((acc, set) => acc === null ? set : new Set([...acc].filter(k => set.has(k))), null) || new Set();
    for (const key of sharedKeys) {
      const entry = manifest[key];
      if (!entry?.file?.endsWith(".js") || entry.isEntry || entry.isDynamicEntry) continue;
      const source = readFileSync(join(DIST, entry.file), "utf-8");
      if (source.length > eagerShared.source.length) eagerShared = { name: entry.name || key, source };
    }
  });

  describe("manifest shape", () => {
    it("exposes the two client entries (index for legacy SPA, bn-hydrate for SSR)", () => {
      const indexEntry = manifest["index.html"];
      const hydrateEntry = manifest["src/bn/client/hydrate.js"];
      assert.ok(indexEntry, "index.html entry missing from manifest");
      assert.ok(hydrateEntry, "src/bn/client/hydrate.js entry missing from manifest");
      assert.equal(indexEntry.isEntry, true);
      assert.equal(hydrateEntry.isEntry, true);
    });

    it("emits a separate chunk for each lazy view (submit, moderate, admin)", () => {
      const names = Object.values(manifest)
        .map(e => e.name)
        .filter(Boolean);
      assert.ok(names.includes("submit"), `expected a 'submit' chunk; got: ${names.join(", ")}`);
      assert.ok(names.includes("moderate"), `expected a 'moderate' chunk; got: ${names.join(", ")}`);
      assert.ok(names.includes("admin"), `expected a 'admin' chunk; got: ${names.join(", ")}`);
    });

    it("marks the lazy view chunks as dynamic entries (not static)", () => {
      const lazy = ["submit", "moderate", "admin"];
      for (const name of lazy) {
        const entry = Object.values(manifest).find(e => e.name === name);
        assert.ok(entry, `${name} chunk missing`);
        assert.equal(
          entry.isDynamicEntry,
          true,
          `${name} should be a dynamic entry — if Rollup has bundled it back into the eager graph the import() call has been re-statified`,
        );
      }
    });
  });

  describe("eager chunk hygiene", () => {
    it("the eager shared chunk does not carry @basenative/combobox internals", () => {
      const playBoot = eagerShared.source;
      assert.ok(playBoot, "no chunk is imported statically by both client entries — the chunk graph has changed shape");
      /* "Combobox" is the public factory name from @basenative/combobox.
         If it's in the eager chunk, submit's dynamic import() didn't
         work and the dep is back in the always-loaded path. */
      assert.equal(
        playBoot.includes("Combobox"),
        false,
        `Combobox factory leaked back into the eager shared chunk (${eagerShared.name})`,
      );
    });

    it("the eager shared chunk does not carry @basenative/admin's bn-admin- markup strings", () => {
      const playBoot = eagerShared.source;
      /* renderAdminQueueList + renderAdminUserList emit a flock of
         bn-admin-* class names. If those land in play-boot it means
         moderate/admin views (or their deps) leaked into the eager
         graph. */
      assert.equal(
        playBoot.includes("bn-admin-"),
        false,
        `bn-admin-* strings leaked into the eager shared chunk (${eagerShared.name})`,
      );
    });
  });

  describe("lazy chunk content", () => {
    it("the submit chunk carries the combobox factory", () => {
      const submit = chunkSources["submit"];
      assert.ok(submit, "submit chunk missing");
      assert.ok(
        submit.includes("Combobox"),
        "submit chunk should contain the Combobox factory — if it doesn't, combobox got hoisted into a shared chunk and the lazy boundary moved",
      );
    });

    it("the admin chunk carries the bn-admin-* CSS classes used by @basenative/admin/components", () => {
      const admin = chunkSources["admin"];
      assert.ok(admin, "admin chunk missing");
      assert.ok(
        admin.includes("bn-admin-"),
        "admin chunk should contain bn-admin-* strings",
      );
    });
  });

  describe("eager chunk size budget", () => {
    /* Soft budget — guards against the eager chunk ballooning back to
       the pre-#64 size. The actual measured value at the time of
       writing is ~38 KB raw (~14 KB gzipped); the ceiling exists so a
       regression that re-bundles the lazy views (back to ~62 KB) fails
       loudly, while reasonable feature growth does not.

       Raised 55 → 58 KB when the lobby's free-play shelf adopted
       @basenative/components' accordion. That pulls accordion.js plus
       its ids/attrs helpers — ~3.1 KB of package source, ~1.1 KB
       minified — into the eager graph, because the lobby is the
       landing view and is eager by design. Measured 54.4 KB before,
       55.5 KB after.

       The number that matters is the gap to the failure this guards:
       62 KB still trips it, and that is the only way the chunk gets
       there — a lazy view (submit/moderate/admin) re-entering the eager
       import graph. A kilobyte of markup helper is not that. */
    it("the eager shared chunk's raw size stays under 58 KB", () => {
      const rawKb = eagerShared.source.length / 1024;
      assert.ok(
        rawKb < 58,
        `${eagerShared.name} is ${rawKb.toFixed(1)} KB raw — over the 58 KB budget. Did a lazy view sneak back into the eager graph?`,
      );
    });
  });
});
