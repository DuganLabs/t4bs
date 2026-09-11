#!/usr/bin/env node
/* Regenerate seed.sql from shared/seed-puzzles.js.
   Run: npm run seed:sql  (shared/seed-puzzles.test.js fails if stale) */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { seedSql } from "../shared/seed-puzzles.js";

const out = fileURLToPath(new URL("../seed.sql", import.meta.url));
writeFileSync(out, seedSql());
console.log(`wrote ${out}`);
