/* shared/submission.js — the one gate every puzzle passes through.

   Focused on the parts this change touched: anchors are now required
   (they're the documented bootstrap and nothing was populating them),
   and `suggestAnchors` is what makes that requirement painless in the
   submission form. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { validateSubmission, suggestAnchors, maxAnchors } from "./submission.js";

const ok = (over = {}) => validateSubmission({
  category: "MOVIE QUOTES",
  phrase: "HERE COMES THE SUN",
  anchors: [{ wi: 1, li: 0 }],
  ...over,
});

describe("validateSubmission — anchors", () => {
  it("accepts a phrase with at least one anchor", () => {
    const r = ok();
    assert.equal(r.error, undefined);
    assert.deepEqual(r.normalized.anchors, [{ wi: 1, li: 0 }]);
  });

  it("rejects a phrase with no anchors at all", () => {
    const r = ok({ anchors: [] });
    assert.equal(r.error, "needs-anchor");
    assert.match(r.detail, /at least one/);
  });

  it("rejects a phrase that is entirely given away", () => {
    const r = validateSubmission({
      category: "X Y",
      phrase: "TO BE",
      anchors: [{ wi: 0, li: 0 }, { wi: 0, li: 1 }, { wi: 1, li: 0 }, { wi: 1, li: 1 }],
    });
    assert.equal(r.error, "too-many-anchors");
  });

  it("de-duplicates and sorts anchors into a stable order", () => {
    const r = ok({ anchors: [{ wi: 3, li: 2 }, { wi: 1, li: 0 }, { wi: 1, li: 0 }] });
    assert.deepEqual(r.normalized.anchors, [{ wi: 1, li: 0 }, { wi: 3, li: 2 }]);
  });

  it("still rejects out-of-range anchor coordinates", () => {
    assert.equal(ok({ anchors: [{ wi: 9, li: 0 }] }).error, "bad-anchor-wi");
    assert.equal(ok({ anchors: [{ wi: 0, li: 9 }] }).error, "bad-anchor-li");
    assert.equal(ok({ anchors: [{ wi: "0", li: 0 }] }).error, "bad-anchor");
  });

  it("still rejects one-letter words — the rule the old seed content broke", () => {
    assert.equal(
      validateSubmission({ category: "FAMOUS SPEECHES", phrase: "I HAVE A DREAM", anchors: [{ wi: 1, li: 0 }] }).error,
      "bad-word-length",
    );
    assert.equal(
      validateSubmission({ category: "FAIRY TALES", phrase: "ONCE UPON A TIME", anchors: [{ wi: 0, li: 0 }] }).error,
      "bad-word-length",
    );
  });
});

describe("suggestAnchors", () => {
  it("returns a set the validator accepts, for every shape it's given", () => {
    const phrases = [
      "HERE COMES THE SUN",
      "TO BE OR NOT TO BE",
      "PRACTICE MAKES PERFECT",
      "NEVER GIVE UP",
      "MAY THE FORCE BE WITH YOU",
      "TO BE",
    ];
    for (const phrase of phrases) {
      const anchors = suggestAnchors(phrase);
      assert.ok(anchors.length >= 1, `${phrase}: suggested nothing`);
      const r = validateSubmission({ category: "TEST", phrase, anchors });
      assert.equal(r.error, undefined, `${phrase}: ${r.error} ${r.detail || ""}`);
    }
  });

  it("puts an anchor in the longest word — the hardest one to crack cold", () => {
    const anchors = suggestAnchors("HERE COMES THE SUN");
    assert.ok(anchors.some(a => a.wi === 1), "COMES (5 letters) got no anchor");
  });

  it("spreads across two different words when there are two to pick", () => {
    const anchors = suggestAnchors("PRACTICE MAKES PERFECT");
    assert.equal(new Set(anchors.map(a => a.wi)).size, anchors.length);
  });

  it("stays inside the per-phrase cap", () => {
    for (const phrase of ["TO BE", "HERE COMES THE SUN", "MAY THE FORCE BE WITH YOU"]) {
      const words = phrase.split(" ");
      assert.ok(suggestAnchors(phrase).length <= maxAnchors(words));
    }
  });

  it("returns nothing for an empty phrase rather than throwing", () => {
    assert.deepEqual(suggestAnchors(""), []);
    assert.deepEqual(suggestAnchors(undefined), []);
  });
});
