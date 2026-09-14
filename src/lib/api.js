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

/* Wire codes → sentences (T4-052). The API answers with short codes
   (`{ error: "puzzle-not-found" }`, `http-503`, the client's own
   `start-timeout`) and req() above mints an Error whose message IS that
   code. The views used to print it verbatim — "error: puzzle-not-found"
   in a red bar. The map lives here, beside the thing it translates, so
   home, admin and moderate cannot drift apart.

   Codes the engine, the functions and the client are known to emit.
   Anything not listed gets the generic fallback; a string that is
   already prose (a server `detail`, a package message with spaces in it)
   is passed through, because it was written for a person. */
export const ERROR_MESSAGES = Object.freeze({
  "puzzle-not-found":     "That round isn't available any more. Today's puzzle is right here — play that instead.",
  "puzzle-gone":          "That round isn't available any more. Today's puzzle is right here — play that instead.",
  "no-puzzles":           "There's no puzzle scheduled right now. Check back in a little while.",
  "daily-done":           "You've already played today's puzzle. Come back tomorrow for the next one.",
  "daily-already-played": "You've already played today's puzzle. Come back tomorrow for the next one.",
  "no-session":           "That round has ended. Start a new one.",
  "finished":             "That round is already over.",
  "auth-required":        "Sign in to do that.",
  "moderator-only":       "The moderation queue is for moderators. Your account doesn't have that yet.",
  "admin-only":           "That page is for admins only.",
  "start-timeout":        "Starting the round took too long. Check your connection and try again.",
  "resume-timeout":       "Picking up your round took too long. Check your connection and try again.",
  "not-found":            "That isn't there any more. Reload and try again.",
  "reason-required":      "Say why you're rejecting it — the reason is recorded.",
});

export const GENERIC_ERROR_MESSAGE = "Something went wrong. Try again.";

/** A short machine code: lowercase words joined by hyphens, no spaces. */
const CODE_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Turn an error code (or an Error carrying one) into a sentence for a
 * person. `""` for nothing, so it can be bound straight to an alert.
 *
 * @param {string | { message?: string } | null | undefined} code
 * @returns {string}
 */
export function errorMessage(code) {
  const raw = code == null ? "" : typeof code === "string" ? code : String(code.message || "");
  const c = raw.trim();
  if (!c) return "";
  if (Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, c)) return ERROR_MESSAGES[c];
  const http = /^http-(\d{3})$/.exec(c);
  if (http) {
    const status = Number(http[1]);
    if (status === 401) return ERROR_MESSAGES["auth-required"];
    if (status === 403) return "You don't have access to that.";
    if (status === 404) return ERROR_MESSAGES["not-found"];
    if (status === 429) return "Too many requests — wait a moment and try again.";
    if (status >= 500)  return "The server had a problem. Try again in a moment.";
    return GENERIC_ERROR_MESSAGE;
  }
  if (CODE_SHAPE.test(c)) return GENERIC_ERROR_MESSAGE;
  return c;   // already a sentence — a server `detail` or a package's own message
}

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
  modDecide:    (id, status, reason = "")          => post("/moderate/decide", { id, status, reason }),

  modDecided:   ()                                 => get("/moderate/decided"),
  modCatalogue: ()                                 => get("/moderate/catalogue"),

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
