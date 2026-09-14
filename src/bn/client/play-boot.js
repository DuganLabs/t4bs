/* Pure boot-policy for the routes that carry a round: "/" (today's
   puzzle) and "/play" (a preview).

   Splitting this out from the hydrator buys us a unit-testable surface
   for the "what should the client do when the page loads?" question.
   The hydrator stays an imperative orchestrator; the *decision* lives
   here.

   On a fresh GET the server has no session context — sessions are
   mutating and we don't create one per crawler hit. The client resolves
   it in priority order:

     /            1. a saved, unfinished round → resume it in place
                  2. today's puzzle is open for this player → start it
                  3. nothing (played already, or nothing scheduled) → the
                     home view draws the done card / the notice
     /play        1. ?play=<id> → start a preview of that puzzle
                  2. ?daily=1 (old share links) → home, where today's
                     puzzle already is
                  3. a saved round → resume it
                  4. nothing → home

   Without this resolver the user used to stare at "Loading round…"
   indefinitely (the symptom that PR #43 tried to fix and didn't). */

/**
 * @typedef {{ kind: "start", puzzleId: number }} StartIntent
 * @typedef {{ kind: "resume", sessionId: string }} ResumeIntent
 * @typedef {{ kind: "daily" }} DailyIntent
 * @typedef {{ kind: "home" }} HomeIntent
 * @typedef {{ kind: "ignore" }} IgnoreIntent Route isn't /play or / — leave it alone.
 * @typedef {StartIntent | ResumeIntent | DailyIntent | HomeIntent | IgnoreIntent} BootIntent
 */

/**
 * Decide what the client should do when the page boots.
 *
 * @param {{ search: string, pathname?: string }} location  Just the bits of `Location` we read.
 * @param {{ sessionId?: string } | null | undefined} saved Whatever `loadPersisted("t4bs:session")` returned.
 * @param {{ puzzleId?: number | null, playedToday?: boolean } | null | undefined} [daily]
 *        The server's daily status, when the caller has it. Only "/" reads it.
 * @returns {BootIntent}
 */
export function decidePlayBoot(location, saved, daily) {
  /* Only "/" and "/play" carry a round. Direct navigation or a reload of
     /moderate, /admin or /submit must not get hijacked into the game —
     this used to run unconditionally, so a moderator reloading the
     queue with an unfinished daily saved would get bounced into it. */
  const pathname = location.pathname ?? "/play";
  if (pathname !== "/play" && pathname !== "/") {
    return { kind: "ignore" };
  }

  const params = new URLSearchParams(location.search || "");
  const hasSaved = !!(saved && typeof saved.sessionId === "string" && saved.sessionId.length > 0);

  if (pathname === "/") {
    if (hasSaved) return { kind: "resume", sessionId: /** @type {string} */ (saved.sessionId) };
    if (daily && daily.puzzleId && !daily.playedToday) return { kind: "daily" };
    return { kind: "home" };
  }

  /* /play */
  const playRaw = params.get("play");
  if (playRaw !== null) {
    const playId = Number(playRaw);
    if (Number.isFinite(playId) && playId > 0) {
      return { kind: "start", puzzleId: playId };
    }
  }
  /* The old shareable "play today's Tabs" link. Today's puzzle lives on
     "/" now, so the answer is simply "go home". */
  if (params.get("daily") === "1") return { kind: "home" };
  if (hasSaved) return { kind: "resume", sessionId: /** @type {string} */ (saved.sessionId) };
  return { kind: "home" };
}

/**
 * Race a promise against a timeout. Rejects with a tagged error when the
 * deadline elapses so callers can distinguish hangs from real failures.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} [label]
 * @returns {Promise<T>}
 */
export function withTimeout(promise, ms, label = "timeout") {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      const err = new Error(label);
      /** @type {{ code: string }} */ (err).code = "ETIMEOUT";
      reject(err);
    }, ms);
    promise.then(
      (v) => { clearTimeout(id); resolve(v); },
      (e) => { clearTimeout(id); reject(e); },
    );
  });
}

/**
 * Treat a resumed session as usable iff it has the basic shape we need
 * to render and isn't already finished. Engine returns `{ error: ... }`
 * for not-found / puzzle-gone, and `finished: "won"|"lost"|true` for
 * completed rounds — both are dead-ends for resume.
 *
 * @param {unknown} s
 * @returns {boolean}
 */
export function isResumable(s) {
  if (!s || typeof s !== "object") return false;
  /** @type {Record<string, unknown>} */
  const r = s;
  if (r.error) return false;
  if (r.finished) return false;
  if (!Array.isArray(r.words) || r.words.length === 0) return false;
  if (!Array.isArray(r.anchors)) return false;
  return true;
}
