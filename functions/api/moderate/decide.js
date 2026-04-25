import { json, error, readJson, requireAdmin } from "../../_shared/util.js";
import { d1Submissions } from "../../_shared/d1.js";

export const onRequestPost = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  const body = await readJson(request);
  if (!["approved","rejected"].includes(body.status)) return error("bad-status", 400);
  if (typeof body.id !== "number") return error("bad-id", 400);
  const r = await d1Submissions(env.DB).decide(body.id, body.status, auth.user.handle);
  return r ? json(r) : error("not-found", 404);
};
