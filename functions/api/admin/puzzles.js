import { json, error, readJson, requireAdmin } from "../../_shared/util.js";
import { d1Puzzles } from "../../_shared/d1.js";
import { validateSubmission, suggestAnchors } from "../../../shared/submission.js";

/* POST /api/admin/puzzles — add a puzzle straight to the catalogue,
   approved, bypassing the queue. Same validator as /api/submit; anchors
   default to suggestAnchors() when none are given. */
export const onRequestPost = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  const body = await readJson(request);
  const anchors = Array.isArray(body.anchors) && body.anchors.length ? body.anchors : suggestAnchors(String(body.phrase || ""));
  const v = validateSubmission({ category: body.category, phrase: body.phrase, anchors });
  if (v.error) return error(v.error, 400, { detail: v.detail });
  const par = body.par == null || body.par === "" ? null : Number(body.par);
  if (par !== null && !(Number.isFinite(par) && par > 0)) return error("bad-par", 400);
  const id = await d1Puzzles(env.DB).insert({ ...v, par, submittedBy: auth.user.handle });
  return json({ id }, 201);
};
