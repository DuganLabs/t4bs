/* Canonical house content.

   ONE source of truth for the ten seeded puzzles. `seed.sql` is
   generated from this file (`npm run seed:sql`) and
   `server/stores-memory.js` imports it directly, so the Vite dev mock,
   the D1 seed and the tests can never drift apart again.

   Every row here is held to the SAME rules the public submission path
   enforces (`shared/submission.js`): 2–10 words, each word 2–10
   letters, ≤36 letters total, and at least one anchor. Two of the
   original seeds (`I HAVE A DREAM`, `ONCE UPON A TIME`) contained
   one-letter words that `validateSubmission` rejects — house content
   used to bypass the validator entirely, so the rules and the shipped
   phrases had already diverged. They're replaced below, and
   `shared/seed-puzzles.test.js` now runs every row through the real
   validator so the divergence can't come back.

   ANCHORS: the README and the PRD both describe anchor letters as the
   player's bootstrap ("a few free anchor letters"), but all ten rows
   shipped with `anchors: '[]'`. Each puzzle now opens two positions —
   typically one letter inside the longest word plus one elsewhere —
   so a player starts every round with a foothold in the phrase instead
   of a blank grid and four shared lives. */

import { CATALOGUE } from "./catalogue.js";
import { suggestAnchors } from "./submission.js";

/**
 * @typedef {{ wi: number, li: number }} Anchor
 * @typedef {{ id: number, category: string, phrase: string, anchors: Anchor[], submittedBy: string }} SeedPuzzle
 */

/** @type {readonly SeedPuzzle[]} */
export const HOUSE_PUZZLES = Object.freeze([
  {
    id: 1,
    category: "MOVIE QUOTES",
    phrase: "MAY THE FORCE BE WITH YOU",
    // F of FORCE, H of WITH
    anchors: [{ wi: 2, li: 0 }, { wi: 4, li: 3 }],
    submittedBy: "house",
  },
  {
    id: 2,
    category: "FAMOUS SPEECHES",
    // was "I HAVE A DREAM" — one-letter words the validator rejects.
    phrase: "FOUR SCORE AND SEVEN YEARS",
    // S of SCORE, E of SEVEN
    anchors: [{ wi: 1, li: 0 }, { wi: 3, li: 1 }],
    submittedBy: "house",
  },
  {
    id: 3,
    category: "BEATLES SONGS",
    phrase: "HERE COMES THE SUN",
    // C of COMES, N of SUN
    anchors: [{ wi: 1, li: 0 }, { wi: 3, li: 2 }],
    submittedBy: "house",
  },
  {
    id: 4,
    category: "SHAKESPEARE",
    phrase: "TO BE OR NOT TO BE",
    // E of BE, N of NOT
    anchors: [{ wi: 1, li: 1 }, { wi: 3, li: 0 }],
    submittedBy: "house",
  },
  {
    id: 5,
    category: "PROVERBS",
    phrase: "PRACTICE MAKES PERFECT",
    // C of PRACTICE, M of MAKES
    anchors: [{ wi: 0, li: 3 }, { wi: 1, li: 0 }],
    submittedBy: "house",
  },
  {
    id: 6,
    category: "FILM TITLES",
    phrase: "GONE WITH THE WIND",
    // G of GONE, D of WIND
    anchors: [{ wi: 0, li: 0 }, { wi: 3, li: 3 }],
    submittedBy: "house",
  },
  {
    id: 7,
    category: "ROCK ANTHEMS",
    phrase: "BORN IN THE USA",
    // B of BORN, U of USA
    anchors: [{ wi: 0, li: 0 }, { wi: 3, li: 0 }],
    submittedBy: "house",
  },
  {
    id: 8,
    category: "MOTIVATIONAL",
    phrase: "NEVER GIVE UP",
    // N of NEVER, G of GIVE
    anchors: [{ wi: 0, li: 0 }, { wi: 1, li: 0 }],
    submittedBy: "house",
  },
  {
    id: 9,
    category: "FAIRY TALES",
    // was "ONCE UPON A TIME" — the lone "A" fails the word-length rule.
    phrase: "HAPPILY EVER AFTER",
    // H of HAPPILY, A of AFTER
    anchors: [{ wi: 0, li: 0 }, { wi: 2, li: 0 }],
    submittedBy: "house",
  },
  {
    id: 10,
    category: "CARPE DIEM",
    phrase: "SEIZE THE DAY",
    // S of SEIZE, D of DAY
    anchors: [{ wi: 0, li: 0 }, { wi: 2, li: 0 }],
    submittedBy: "house",
  },
]);

/** The letter an anchor reveals, for docs/tests/tooling. */
export function anchorLetter(puzzle, anchor) {
  return puzzle.phrase.split(" ")[anchor.wi][anchor.li];
}

/** Render the canonical `seed.sql` body from SEED_PUZZLES. Used by
 *  `scripts/gen-seed-sql.mjs` and asserted byte-for-byte by the test. */
/* The house catalogue (shared/catalogue.js), expanded into seed rows.
   Ids start at 1000 so they never collide with community submissions,
   which the puzzles table autoincrements from 1 (production already holds
   11 and 12). Anchors are derived by the same suggestAnchors() the submit
   form seeds its picker with; par is left NULL and derived at play time by
   shared/pure.js parFor(). Adding a puzzle is adding a line to the
   catalogue. */
export const CATALOGUE_PUZZLES = Object.freeze(
  Object.entries(CATALOGUE).flatMap(([category, phrases]) =>
    phrases.map((phrase) => ({ category, phrase }))
  ).map((p, i) => ({
    id: 1000 + i,
    category: p.category,
    phrase: p.phrase,
    anchors: suggestAnchors(p.phrase),
    submittedBy: "house",
  })),
);

/** Everything the seed ships: the ten originals and the catalogue. */
export const SEED_PUZZLES = Object.freeze([...HOUSE_PUZZLES, ...CATALOGUE_PUZZLES]);

export function seedSql() {
  const rows = SEED_PUZZLES.map(p =>
    `  (${p.id}, '${p.category}', '${p.phrase}', '${JSON.stringify(p.anchors)}', '${p.submittedBy}', 'approved')`
  ).join(",\n");
  return `-- GENERATED FILE — edit shared/seed-puzzles.js and run \`npm run seed:sql\`.
-- Initial puzzles. Apply once after schema:
--   wrangler d1 execute tabs-db --remote --file=./seed.sql
--
-- Every row below passes shared/submission.js's validateSubmission(),
-- the same validator the public /api/submit path uses — enforced by
-- shared/seed-puzzles.test.js.

INSERT OR IGNORE INTO puzzles (id, category, phrase, anchors, submitted_by, status) VALUES
${rows};
`;
}
