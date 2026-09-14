/* Regression guards for the submit form (T4-032).

   No DOM harness exists here (no jsdom), so the two behaviours this
   file protects — committing a typed-but-unpicked category when the
   picker loses focus, and saying which field keeps SUBMIT disabled —
   cannot be exercised end to end. What can be pinned is that the code
   still carries both: @basenative/combobox 1.0.4 commits only on Enter,
   Tab or a row click, so the blur handler in submit.js is the only
   thing standing between "type a new category, tap into Phrase" and a
   silently empty category signal. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const submitSource = stripComments(readFileSync(join(here, "submit.js"), "utf8"));

describe("submit form — category commit and disabled reason", () => {
  it("commits the category on blur (the combobox does not)", () => {
    assert.ok(
      /addEventListener\(\s*["']blur["']/.test(submitSource),
      "submit.js must register a blur handler on the category input — @basenative/combobox drops uncommitted text when the popup closes",
    );
  });

  it("names the field that keeps SUBMIT disabled", () => {
    for (const reason of ["Pick or add a category", "Type the phrase", "Tap at least one letter to reveal"]) {
      assert.ok(submitSource.includes(reason), `missing disabled-reason copy: ${reason}`);
    }
    assert.ok(
      /"aria-live":\s*"polite"/.test(submitSource),
      "the reason line must be aria-live so a change is announced",
    );
  });
});
