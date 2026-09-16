/* Guards on src/views/play.js that need no DOM.

   There is no jsdom in this repo (`npm test` is bare `node --test`), so
   createPlay() cannot be mounted and the keyboard cannot be driven from a
   test — the behaviour it would assert lives in pure helpers instead and
   is covered there: src/lib/game.test.js pins computeKeyStatus and
   isKeyBlocked, shared/engine.test.js pins presentByWord. What is left
   here is the wiring those helpers only matter through, read off the
   source: that play.js passes per-word presence rather than the
   phrase-wide list, that it disables ruled-out keys, and that typeLetter
   itself refuses them (bindHardware:false means a hardware key never
   touches the disabled button).

   ── Regression guard for the double-letter bug.

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


/* The keyboard used to claim phrase-wide facts on a per-word board: green
   for a letter locked ANYWHERE, yellow for a letter known ANYWHERE. Both
   are corrected in src/lib/game.js; these assertions pin the call site, so
   the old signals cannot be wired back in. */
describe("the play keyboard is wired per word", () => {
  it("feeds computeKeyStatus per-word presence, not the phrase-wide list", () => {
    const call = playSource.match(/computeKeyStatus\(\{[\s\S]*?\}\)/);
    assert.ok(call, "play.js must still derive its key states from computeKeyStatus");
    assert.match(call[0], /presentByWord:/, "the keyboard colours from presentByWord");
    assert.doesNotMatch(
      call[0], /presentGlobal/,
      "presentGlobal is a phrase-wide fact and must never reach the keyboard — it belongs to the letter bank",
    );
  });

  it("tells computeKeyStatus when the round is in ALL IN", () => {
    const call = playSource.match(/computeKeyStatus\(\{[\s\S]*?\}\)/)[0];
    assert.match(
      call, /allIn:\s*allInMode\(\)/,
      "ALL IN types every word at once, so the key states must be suppressed there",
    );
  });

  it("disables a key ruled out for the active word", () => {
    assert.match(
      playSource, /btn\.disabled\s*=\s*isKeyBlocked\(/,
      "the effect that labels the char keys must also set/clear `disabled` — a ruled-out key that still presses wastes an attempt",
    );
  });

  it("guards typeLetter as well as the button", () => {
    const fn = playSource.match(/const typeLetter = \(letter\) => \{[\s\S]*?\n {2}\};/);
    assert.ok(fn, "typeLetter must still exist");
    assert.match(
      fn[0], /isKeyBlocked\(/,
      "the page runs @basenative/keyboard with bindHardware:false and binds hardware keys itself, so the guard cannot live on the button alone",
    );
  });

  it("still runs the keyboard with bindHardware:false (the reason the guard is in typeLetter)", () => {
    assert.match(playSource, /bindHardware:\s*false/);
  });

  it("labels the letter bank's present row as a phrase-wide fact", () => {
    assert.match(
      playSource, /somewhere in the phrase/,
      "presentGlobal survives only where it is labelled as phrase-wide",
    );
  });
});
