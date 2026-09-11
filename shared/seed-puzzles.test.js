/* House content is held to the rules the game publishes.

   Seed data used to bypass `validateSubmission` entirely, and the two
   drifted: `I HAVE A DREAM` and `ONCE UPON A TIME` both contain
   one-letter words that the public submission path rejects outright,
   and all ten rows shipped `anchors: '[]'` against a README and a PRD
   that describe anchor letters as the player's bootstrap.

   These tests close that loop: every seeded puzzle goes through the
   REAL validator, and seed.sql has to be the generated form of
   shared/seed-puzzles.js rather than a hand-maintained parallel copy. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { SEED_PUZZLES, anchorLetter, seedSql } from "./seed-puzzles.js";
import { validateSubmission, maxAnchors } from "./submission.js";

const seedSqlOnDisk = readFileSync(fileURLToPath(new URL("../seed.sql", import.meta.url)), "utf8");

describe("seeded house content obeys the submission validator", () => {
  for (const p of SEED_PUZZLES) {
    describe(`#${p.id} ${p.category}`, () => {
      const result = validateSubmission({
        category: p.category,
        phrase: p.phrase,
        anchors: p.anchors,
      });

      it("passes validateSubmission — the same gate /api/submit uses", () => {
        assert.equal(result.error, undefined,
          `${p.phrase}: ${result.error}${result.detail ? ` (${result.detail})` : ""}`);
      });

      it("is already normalized — the stored phrase is what the validator would store", () => {
        assert.equal(result.normalized.phrase, p.phrase);
        assert.equal(result.normalized.category, p.category);
      });

      it("has no one-letter words", () => {
        const shortest = Math.min(...p.phrase.split(" ").map(w => w.length));
        assert.ok(shortest >= 2, `"${p.phrase}" has a ${shortest}-letter word`);
      });

      it("ships at least one anchor and leaves something to solve", () => {
        const letters = p.phrase.replace(/ /g, "").length;
        assert.ok(p.anchors.length >= 1, "no anchors — the documented bootstrap is missing");
        assert.ok(p.anchors.length <= maxAnchors(p.phrase.split(" ")), "too many anchors");
        assert.ok(p.anchors.length < letters, "the whole phrase is given away");
        assert.ok(p.anchors.length / letters <= 0.34,
          `anchors reveal ${p.anchors.length}/${letters} of the phrase — too generous`);
      });

      it("anchors point at real positions", () => {
        const words = p.phrase.split(" ");
        for (const a of p.anchors) {
          assert.ok(words[a.wi] !== undefined, `anchor wi=${a.wi} has no word`);
          assert.ok(a.li >= 0 && a.li < words[a.wi].length, `anchor li=${a.li} out of range`);
          assert.match(anchorLetter(p, a), /^[A-Z]$/);
        }
      });
    });
  }

  it("has unique ids and no duplicate phrases", () => {
    assert.equal(new Set(SEED_PUZZLES.map(p => p.id)).size, SEED_PUZZLES.length);
    assert.equal(new Set(SEED_PUZZLES.map(p => p.phrase)).size, SEED_PUZZLES.length);
  });

  it("still ships a full catalogue", () => {
    assert.ok(SEED_PUZZLES.length >= 10, "the daily needs a catalogue to pick from");
  });
});

describe("seed.sql is generated from shared/seed-puzzles.js", () => {
  it("matches the generator byte for byte (run `npm run seed:sql` if this fails)", () => {
    assert.equal(seedSqlOnDisk, seedSql());
  });

  it("carries a non-empty anchors column for every row", () => {
    const rows = [...seedSqlOnDisk.matchAll(/'(\[[^']*\])'/g)].map(m => JSON.parse(m[1]));
    assert.equal(rows.length, SEED_PUZZLES.length);
    for (const anchors of rows) assert.ok(anchors.length >= 1, "a seeded row still has anchors: []");
  });

  it("contains no SQL-quote-escaping hazard in the content it interpolates", () => {
    /* The generator builds single-quoted SQL literals by hand; an
       apostrophe in a category or phrase would break the file. The
       validator's character classes already forbid one — assert it
       here too so a future content change can't sneak past. */
    for (const p of SEED_PUZZLES) {
      assert.ok(!p.category.includes("'"), `${p.category} contains a quote`);
      assert.ok(!p.phrase.includes("'"), `${p.phrase} contains a quote`);
    }
  });
});
