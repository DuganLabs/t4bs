/* Pure boot-policy for the /play route.

   Splitting this out from the hydrator buys us a unit-testable surface
   for the "what should the client do when /play loads?" question. The
   hydrator stays an imperative orchestrator; the *decision* lives here.

   On a fresh GET to /play (refresh, deep-link, share-card click) the
   server has no session context — sessions are mutating and we don't
   create one per crawler hit. The client resolves it in priority order:

     1. ?play=<id> in the URL — start a new round on that puzzle.
     2. A saved session id in local storage — resume it.
     3. Nothing → bounce home so the user picks a round.

   Without this resolver the user used to stare at "Loading round…"
   indefinitely (the symptom that PR #43 tried to fix and didn't). */

/**
 * @typedef {{ kind: "start", puzzleId: number }} StartIntent
 * @typedef {{ kind: "resume", sessionId: string }} ResumeIntent
 * @typedef {{ kind: "daily" }} DailyIntent
 * @typedef {{ kind: "home" }} HomeIntent
 * @typedef {StartIntent | ResumeIntent | DailyIntent | HomeIntent} BootIntent
 */

/**
 * Decide what the client should do when the /play route boots.
 *
 * @param {{ search: string, pathname?: string }} location  Just the bits of `Location` we read.
 * @param {{ sessionId?: string } | null | undefined} saved Whatever `loadPersisted("t4bs:session")` returned.
 * @returns {BootIntent}
 */
export function decidePlayBoot(location, saved) {
  const params = new URLSearchParams(location.search || "");
  const playRaw = params.get("play");
  if (playRaw !== null) {
    const playId = Number(playRaw);
    if (Number.isFinite(playId) && playId > 0) {
      return { kind: "start", puzzleId: playId };
    }
  }
  if (saved && typeof saved.sessionId === "string" && saved.sessionId.length > 0) {
    return { kind: "resume", sessionId: saved.sessionId };
  }
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
