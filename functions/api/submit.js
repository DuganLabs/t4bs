import { json, error, readJson, requireUser } from "../_shared/util.js";
import { d1Submissions } from "../_shared/d1.js";
import { validateSubmission } from "../../shared/submission.js";

export const onRequestPost = async ({ request, env }) => {
  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;

  const body = await readJson(request);
  const v = validateSubmission(body);
  if (v.error) return error(v.error, 400, { detail: v.detail });

  const id = await d1Submissions(env.DB).create({ ...v.normalized, submittedBy: auth.user.handle });
  return json({ id, status: "pending" });
};
