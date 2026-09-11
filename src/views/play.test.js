/* Regression guard for the double-letter bug.

   @basenative/keyboard >= 1.0.5 owns touch input: its own `touchend`
   handler dispatches the key and then preventDefault()s so the synthetic
   click cannot double-fire. play.js used to carry a local workaround that
   synthesized `btn.click()` on touchend, written against keyboard 1.0.0
   which had no touchend handling. After the 1.0.5 bump both ran, so every
   tap on a phone entered two letters and the game was unplayable.

   These two assertions are deliberately paired: the first stops us from
   re-adding a duplicate handler, the second fails loudly if upstream ever
   drops its touch handling (in which case the workaround must come back
   rather than leaving touch silently broken). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const playSource = stripComments(readFileSync(join(here, "play.js"), "utf8"));

const require_ = createRequire(import.meta.url);
const keyboardSource = readFileSync(
  join(dirname(require_.resolve("@basenative/keyboard")), "keyboard.js"),
  "utf8",
);

describe("keyboard touch input ownership", () => {
  it("play.js registers no touch handler of its own", () => {
    assert.equal(
      /addEventListener\(\s*["']touch/.test(playSource),
      false,
      "play.js must not bind its own touch handler — @basenative/keyboard does it, and running both enters two letters per tap",
    );
  });

  it("play.js never synthesizes a click on a keyboard key", () => {
    assert.equal(
      /\.click\(\)/.test(playSource),
      false,
      "synthesizing a click on a key duplicates the keyboard package's own dispatch",
    );
  });

  it("@basenative/keyboard still handles touchend itself", () => {
    assert.ok(
      /addEventListener\(\s*["']touchend["']/.test(keyboardSource),
      "upstream keyboard no longer handles touchend — touch input is now unhandled and the local workaround must be restored",
    );
  });
});
