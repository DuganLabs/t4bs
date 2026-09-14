/* Unit tests for src/lib/api.js's error translation (T4-052).

   The wire format is short codes (`puzzle-not-found`, `http-503`,
   `start-timeout`); the views used to print them verbatim. errorMessage
   is the one place they become sentences, so this pins its contract:
   known codes read as prose, unknown codes get the generic fallback,
   nothing renders as "", and prose already written for a person passes
   through untouched. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ERROR_MESSAGES, GENERIC_ERROR_MESSAGE, errorMessage } from "./api.js";

const HYPHENATED_CODE = /\b[a-z0-9]+-[a-z0-9-]+\b/;

describe("errorMessage", () => {
  it("turns puzzle-not-found into a sentence with no code in it", () => {
    const msg = errorMessage("puzzle-not-found");
    assert.ok(msg.length > 20, "expected a sentence");
    assert.equal(HYPHENATED_CODE.test(msg), false, `leaked a code: ${msg}`);
    assert.match(msg, /today's puzzle/i, "should point at what is on screen");
  });

  it("never leaks a hyphenated code from any known entry", () => {
    for (const [code, msg] of Object.entries(ERROR_MESSAGES)) {
      assert.equal(HYPHENATED_CODE.test(msg), false, `${code} → "${msg}" leaks a code`);
      assert.equal(errorMessage(code), msg);
    }
  });

  it("returns the generic fallback for an unknown code", () => {
    assert.equal(errorMessage("no-such-code"), GENERIC_ERROR_MESSAGE);
    assert.equal(errorMessage("wat"), GENERIC_ERROR_MESSAGE);
    assert.equal(HYPHENATED_CODE.test(GENERIC_ERROR_MESSAGE), false);
  });

  it("returns an empty string for nothing", () => {
    assert.equal(errorMessage(null), "");
    assert.equal(errorMessage(undefined), "");
    assert.equal(errorMessage(""), "");
  });

  it("maps the http-NNN shape by status class", () => {
    assert.equal(errorMessage("http-401"), ERROR_MESSAGES["auth-required"]);
    assert.match(errorMessage("http-403"), /access/i);
    assert.match(errorMessage("http-429"), /wait/i);
    assert.match(errorMessage("http-500"), /server/i);
    assert.match(errorMessage("http-503"), /server/i);
    assert.equal(errorMessage("http-418"), GENERIC_ERROR_MESSAGE);
    for (const s of ["http-401", "http-403", "http-429", "http-500"]) {
      assert.equal(HYPHENATED_CODE.test(errorMessage(s)), false, `${s} leaked`);
    }
  });

  it("accepts the Error the api wrapper throws", () => {
    assert.equal(errorMessage(new Error("puzzle-not-found")), ERROR_MESSAGES["puzzle-not-found"]);
    assert.equal(errorMessage(new Error("http-500")), errorMessage("http-500"));
  });

  it("passes prose written for a person straight through", () => {
    const detail = "Phrase needs at least one starting letter.";
    assert.equal(errorMessage(detail), detail);
  });
});

/* Source-scan guard: the views bind their alerts through errorMessage,
   not the raw signal. No DOM harness exists here, so this is what keeps
   `error: ${...}` from coming back. */
describe("views render errors through errorMessage", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const stripComments = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const read = (f) => stripComments(readFileSync(join(here, "../views", f), "utf8"));

  for (const file of ["home.js", "admin.js", "moderate.js"]) {
    it(`${file} binds its alert to errorMessage(...)`, () => {
      const src = read(file);
      assert.equal(src.includes("`error: ${"), false, `${file} prefixes a wire code with "error:"`);
      assert.ok(/bindText\(\s*errAlert\.content,\s*\(\)\s*=>\s*errorMessage\(/.test(src),
        `${file} must bind errAlert.content through errorMessage()`);
    });
  }

  it("admin.js clears the loading state on error before checking for null", () => {
    const src = read("admin.js");
    const errIdx = src.indexOf("if (err()) { lists.replaceChildren(); return; }");
    const nullIdx = src.indexOf("if (u === null)");
    assert.ok(errIdx > -1, "admin.js lists effect must bail on err() first");
    assert.ok(nullIdx > errIdx, "the err() check must come before the null-means-loading branch");
  });

  it("admin.js offers a retry button", () => {
    assert.ok(read("admin.js").includes('bnButton("Try again"'));
  });
});
