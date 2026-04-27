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
  startSession: (puzzleId)                         => post("/session", { puzzleId }),
  resumeSession:(sessionId)                        => get(`/session/${encodeURIComponent(sessionId)}`),
  guess:        (sessionId, wordIndex, letters, wagers = []) =>
                                                      post("/guess",   { sessionId, wordIndex, letters, wagers }),
  cascade:      (sessionId, wordIndex, letterIndex)=> post("/cascade", { sessionId, wordIndex, letterIndex }),
  allIn:        (sessionId, wordsGuess)            => post("/allin",   { sessionId, wordsGuess }),

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
  modDecide:    (id, status)                       => post("/moderate/decide", { id, status }),

  /* admin */
  modUsers:     (q = "")                           => get(`/moderate/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  modPromote:   (userId, role)                     => post("/moderate/promote", { userId, role }),

  /* share cards */
  mintShareCard: (body)                            => post("/share-cards", body),
};
