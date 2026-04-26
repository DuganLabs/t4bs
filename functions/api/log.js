/* Client error sink. Posts here are console.error'd in the Worker so they show
   up in Cloudflare real-time logs / wrangler tail without us standing up a
   logging service. Bounded to small payloads; no user content stored anywhere. */

import { readJson, json } from "../_shared/util.js";

const MAX_FIELD = 500;
const trim = (s) => typeof s === "string" ? s.slice(0, MAX_FIELD) : undefined;

export const onRequestPost = async ({ request }) => {
  const body = await readJson(request);
  const ua = request.headers.get("user-agent") || "";
  const ref = request.headers.get("referer") || "";
  const cf = request.cf || {};
  const entry = {
    msg:    trim(body.msg),
    stack:  trim(body.stack),
    where:  trim(body.where),
    url:    trim(body.url),
    ua:     trim(ua),
    ref:    trim(ref),
    country: cf.country,
    ts: Date.now(),
  };
  console.error("client-error", JSON.stringify(entry));
  return json({ logged: true });
};
