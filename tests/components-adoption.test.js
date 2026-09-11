/* Guards the @basenative/components adoption.
 *
 * T4BS used to carry a parallel button vocabulary
 * ([data-bn-button="primary|secondary"]) and a hand-built
 * <div role="dialog"> with its own focus trap, both of which duplicated
 * things the package already ships. These assertions are cheap source
 * scans whose only job is to stop the duplicates creeping back — a new
 * view copy-pasting the old button attribute, or the end-of-round
 * overlay reverting to a div while the native <dialog> semantics (focus
 * containment, inert background, focus restore) are quietly lost.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(js|css)$/.test(entry.name)) out.push(p);
  }
  return out;
}
const files = walk(srcDir);
/* Scan code, not prose: every one of these patterns is discussed by name
   in the comments that explain why it was retired. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const read = (f) => stripComments(readFileSync(f, "utf8"));
const rel = (f) => relative(root, f);

describe("@basenative/components adoption", () => {
  it("no file still uses the retired [data-bn-button] vocabulary", () => {
    const offenders = files.filter((f) => /data-bn-button/.test(read(f))).map(rel);
    assert.deepEqual(
      offenders,
      [],
      `use renderButton() / bnButton() instead — [data-bn-button] duplicated the package's [data-bn="button"][data-variant]: ${offenders.join(", ")}`,
    );
  });

  it("the end-of-round overlay is a real modal <dialog>, not a div with role=dialog", () => {
    const play = read(join(srcDir, "views/play.js"));
    assert.match(play, /renderDialog\(/, "play.js should build the end-of-round overlay with renderDialog()");
    assert.match(play, /showModal\(\)/, "a modal <dialog> must be opened with showModal() to get focus containment");
    assert.doesNotMatch(
      play,
      /role:\s*["']dialog["']/,
      'a hand-rolled role="dialog" gives no focus containment, no inert background and no focus restore',
    );
  });

  it("the hand-rolled focus trap is gone — native <dialog> owns focus management", () => {
    assert.equal(
      existsSync(join(srcDir, "lib/focus-trap.js")),
      false,
      "lib/focus-trap.js reimplements what showModal() does natively",
    );
    const offenders = files.filter((f) => /trapFocus\s*\(/.test(read(f))).map(rel);
    assert.deepEqual(offenders, [], `trapFocus() callers remain: ${offenders.join(", ")}`);
  });

  it("every error notice is the package's alert, not a hand-asserted role=alert", () => {
    /* layout.js's <noscript> message is the one exception: it renders
       with scripting disabled, where a componentised alert buys nothing
       and the plain <p role="alert"> is the more robust markup. */
    const offenders = files
      .filter((f) => f.endsWith(".js"))
      .filter((f) => !/views[/\\]layout\.js$/.test(f))
      .filter((f) => /role="alert"|role:\s*["']alert["']/.test(read(f)))
      .map(rel);
    assert.deepEqual(
      offenders,
      [],
      `use renderAlert()/bnAlert() — its error variant sets role="alert" itself: ${offenders.join(", ")}`,
    );
  });
});
