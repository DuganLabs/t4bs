/* Health probe — verifies the function runtime + D1 binding + a trivial query
   + auth system schema readiness.
   Returns JSON with sub-checks; HTTP 200 only when all pass. */

import { json } from "../_shared/util.js";

export const onRequestGet = async ({ env }) => {
  const checks = {
    runtime: "ok",
    db_bound: !!env.DB,
    db_query: "skip",
    auth_schema: "skip",
  };

  if (env.DB) {
    // Verify puzzles table
    try {
      const r = await env.DB.prepare("SELECT count(*) AS n FROM puzzles WHERE status='approved'").first();
      checks.db_query = r?.n >= 0 ? "ok" : "fail";
      checks.approved_puzzles = r?.n ?? null;
    } catch (e) {
      checks.db_query = `fail: ${e.message || e}`;
    }

    // Verify auth schema (users + credentials tables exist and are accessible)
    try {
      const userCount = await env.DB.prepare("SELECT count(*) AS n FROM users").first();
      const credCount = await env.DB.prepare("SELECT count(*) AS n FROM credentials").first();
      checks.auth_schema = userCount !== null && credCount !== null ? "ok" : "fail";
      checks.users_count = userCount?.n ?? null;
    } catch (e) {
      checks.auth_schema = `fail: ${e.message || e}`;
    }
  }

  const ok =
    checks.runtime === "ok" &&
    checks.db_bound &&
    checks.db_query === "ok" &&
    checks.auth_schema === "ok";

  return json({ ok, checks, ts: Date.now() }, ok ? 200 : 503);
};
