import { json, error, readJson, requireModerator } from "../../_shared/util.js";
import { d1Submissions } from "../../_shared/d1.js";

export const onRequestPost = async ({ request, env }) => {
  const auth = await requireModerator(request, env);
  if (auth.error) return auth.error;
  const body = await readJson(request);
  if (!["approved","rejected"].includes(body.status)) return error("bad-status", 400);
  if (typeof body.id !== "number") return error("bad-id", 400);
  /* A rejection carries a reason (T4-021): recorded on the row, shown in
     the decided list, never required for an approval. */
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (body.status === "rejected" && !reason) return error("reason-required", 400);
  const r = await d1Submissions(env.DB).decide(body.id, body.status, auth.user.handle, reason || null);
  return r ? json(r) : error("not-found", 404);
};
