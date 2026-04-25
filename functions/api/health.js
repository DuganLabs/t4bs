/* Health probe — verifies the function runtime + D1 binding + a trivial query.
   Returns JSON with sub-checks; HTTP 200 only when all pass. */

import { json } from "../_shared/util.js";

export const onRequestGet = async ({ env }) => {
  const checks = { runtime: "ok", db_bound: !!env.DB, db_query: "skip" };
  if (env.DB) {
    try {
      const r = await env.DB.prepare("SELECT count(*) AS n FROM puzzles WHERE status='approved'").first();
      checks.db_query = r?.n >= 0 ? "ok" : "fail";
      checks.approved_puzzles = r?.n ?? null;
    } catch (e) {
      checks.db_query = `fail: ${e.message || e}`;
    }
  }
  const ok = checks.runtime === "ok" && checks.db_bound && checks.db_query === "ok";
  return json({ ok, checks, ts: Date.now() }, ok ? 200 : 503);
};
