/* Client API wrapper. Browser never knows the answer — every authoritative
   step is a server round-trip. Same shape against local Vite mock and Cloudflare. */

async function req(path, init = {}) {
  const r = await fetch(`/api${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  let data = null;
  try { data = await r.json(); } catch { /* empty */ }
  if (!r.ok) throw Object.assign(new Error(data?.error || `http-${r.status}`), { status: r.status, data });
  return data;
}
const get  = (p) => req(p);
const post = (p, body) => req(p, { method: "POST", body: JSON.stringify(body || {}) });

export const api = {
  /* game */
  listPuzzles:  ()                                 => get("/puzzles"),
  /* The daily is resolved server-side — the client asks what today is
     and asks to start it; it never names the puzzle. Free play still
     names one, and is never recorded. */
  daily:        ()                                 => get("/daily"),
  startDaily:   ()                                 => post("/session", { mode: "daily" }),
  startSession: (puzzleId)                         => post("/session", { puzzleId, mode: "free" }),
  resumeSession:(sessionId)                        => get(`/session/${encodeURIComponent(sessionId)}`),
  /* v2: two moves. One letter against the whole phrase, or the whole
     phrase. The server decides everything and never returns the answer
     until the round is finished. */
  letter:       (sessionId, letter)                => post("/letter",  { sessionId, letter }),
  solve:        (sessionId, phrase)                => post("/solve",   { sessionId, phrase }),

  /* auth */
  me:           ()                                 => get("/auth/me"),
  registerOptions: (handle)                        => post("/auth/register-options", { handle }),
  registerVerify:  (attestation)                   => post("/auth/register-verify",  { attestation }),
  loginOptions:    (handle)                        => post("/auth/login-options",    { handle }),
  loginVerify:     (assertion)                     => post("/auth/login-verify",     { assertion }),
  logout:       ()                                 => post("/auth/logout"),
  devLogin:     (handle)                           => post("/auth/dev-login", { handle }),

  /* submissions + moderation */
  submit:       (puzzle)                           => post("/submit", puzzle),
  modPending:   ()                                 => get("/moderate/pending"),
  modDecide:    (id, status, reason = "")          => post("/moderate/decide", { id, status, reason }),

  modDecided:   ()                                 => get("/moderate/decided"),

  /* admin — docs/PRD.md §4 */
  modUsers:     (q = "")                           => get(`/moderate/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  modPromote:   (userId, role)                     => post("/moderate/promote", { userId, role }),
  adminCatalogue: ()                               => get("/admin/catalogue"),
  adminAddPuzzle: (puzzle)                         => post("/admin/puzzles", puzzle),
  adminEditPuzzle: (id, fields)                    => req(`/admin/puzzles/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) }),
  adminSchedule: (past = 14, ahead = 30)           => get(`/admin/schedule?past=${past}&ahead=${ahead}`),
  adminPin:     (day, puzzleId)                    => req("/admin/schedule", { method: "PUT", body: JSON.stringify({ day, puzzleId }) }),
  adminStats:   ()                                 => get("/admin/stats"),

  /* share cards */
  mintShareCard: (body)                            => post("/share-cards", body),
};
