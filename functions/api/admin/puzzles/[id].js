import { json, error, readJson, requireAdmin } from "../../../_shared/util.js";
import { d1Puzzles } from "../../../_shared/d1.js";
import { validateSubmission } from "../../../../shared/submission.js";

/* PATCH /api/admin/puzzles/:id — edit category / phrase / anchors / par /
   status. A phrase or anchor change goes through validateSubmission with
   the row's other values, so an edit cannot produce a puzzle the submit
   form would refuse. status is 'approved' or 'retired'; never deleted. */
export const onRequestPatch = async ({ request, env, params }) => {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  const id = Number(params.id);
  if (!Number.isFinite(id)) return error("bad-id", 400);
  const body = await readJson(request);
  const fields = {};

  if (body.status !== undefined) {
    if (!["approved", "retired"].includes(body.status)) return error("bad-status", 400);
    fields.status = body.status;
  }
  if (body.par !== undefined) {
    const par = body.par === null || body.par === "" ? null : Number(body.par);
    if (par !== null && !(Number.isFinite(par) && par > 0)) return error("bad-par", 400);
    fields.par = par;
  }
  if (body.category !== undefined || body.phrase !== undefined || body.anchors !== undefined) {
    const current = await env.DB.prepare("SELECT category, phrase, anchors FROM puzzles WHERE id=?1").bind(id).first();
    if (!current) return error("not-found", 404);
    const v = validateSubmission({
      category: body.category ?? current.category,
      phrase: body.phrase ?? current.phrase,
      anchors: body.anchors ?? JSON.parse(current.anchors),
    });
    if (v.error) return error(v.error, 400, { detail: v.detail });
    Object.assign(fields, { category: v.category, phrase: v.phrase, anchors: v.anchors });
  }

  const changed = await d1Puzzles(env.DB).update(id, fields);
  return changed ? json({ id, ...fields }) : error("not-found", 404);
};
