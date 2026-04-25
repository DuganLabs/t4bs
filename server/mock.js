/* Vite middleware that serves /api/* in dev with in-memory stores.
   The real Cloudflare Pages Functions in /functions implement the same contract. */

import { createEngine } from "../shared/engine.js";
import { validateSubmission } from "../shared/submission.js";
import { memoryPuzzles, memorySessions, memorySubmissions, memoryUsers } from "./stores-memory.js";

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function createMockApi() {
  const puzzles = memoryPuzzles();
  const sessions = memorySessions();
  const submissions = memorySubmissions(puzzles);
  const users = memoryUsers();
  const engine = createEngine({ puzzles, sessions });

  // local-mock auth: cookie-based "fake passkey" — sets a session cookie on POST /api/auth/dev-login
  // This exists so the submission UI is exercisable without WebAuthn in dev.
  const userSessions = new Map();  // sessionToken -> userId
  function getCookie(req, name) {
    const c = req.headers.cookie || "";
    const m = c.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
  }

  const ADMIN_HANDLES = (process.env.ADMIN_HANDLES || "admin,warren").split(",").map(s => s.trim().toLowerCase());

  return async (req, res, next) => {
    try {
      const url = new URL(req.url, "http://x");
      const path = url.pathname;
      const M = req.method;

      if (M === "GET" && path === "/puzzles")
        return send(res, 200, await engine.listPuzzles());

      if (M === "GET" && path === "/health")
        return send(res, 200, { ok: true, checks: { runtime: "ok", db_bound: false, db_query: "skip" }, ts: Date.now() });

      if (M === "POST" && path === "/log") {
        try { const b = await readJson(req); console.error("client-error", JSON.stringify(b)); } catch {}
        return send(res, 200, { logged: true });
      }

      if (M === "POST" && path === "/session") {
        const b = await readJson(req);
        const r = await engine.startSession(b.puzzleId);
        return send(res, r.error ? 400 : 200, r);
      }
      const sessionGet = path.match(/^\/session\/([\w-]+)$/);
      if (M === "GET" && sessionGet) {
        const r = await engine.resumeSession(sessionGet[1]);
        return send(res, r.error ? 404 : 200, r);
      }
      if (M === "POST" && path === "/guess") {
        const b = await readJson(req);
        const r = await engine.submitGuess(b.sessionId, b.wordIndex, (b.letters||[]).map(c=>String(c).toUpperCase()), b.wagers||[]);
        return send(res, r.error ? 400 : 200, r);
      }
      if (M === "POST" && path === "/cascade") {
        const b = await readJson(req);
        const r = await engine.spendCascade(b.sessionId, b.wordIndex, b.letterIndex);
        return send(res, r.error ? 400 : 200, r);
      }
      if (M === "POST" && path === "/allin") {
        const b = await readJson(req);
        const r = await engine.allIn(b.sessionId, b.wordsGuess);
        return send(res, r.error ? 400 : 200, r);
      }

      // ── DEV-ONLY auth shim — production uses passkeys via /functions/api/auth/* ──
      if (M === "POST" && path === "/auth/dev-login") {
        const b = await readJson(req);
        const handle = (b.handle || "").trim().toLowerCase();
        if (!handle || !/^[a-z0-9_-]{2,24}$/.test(handle)) return send(res, 400, { error: "bad-handle" });
        let u = await users.getByHandle(handle);
        if (!u) u = await users.create({ id: crypto.randomUUID(), handle });
        const tok = crypto.randomUUID();
        userSessions.set(tok, u.id);
        res.setHeader("Set-Cookie", `t4bs_sess=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60*60*24*30}`);
        return send(res, 200, { handle: u.handle, isAdmin: ADMIN_HANDLES.includes(u.handle) });
      }
      if (M === "GET" && path === "/auth/me") {
        const tok = getCookie(req, "t4bs_sess");
        if (!tok || !userSessions.has(tok)) return send(res, 200, { user: null });
        const u = await users.getById(userSessions.get(tok));
        return send(res, 200, { user: u ? { handle: u.handle, isAdmin: ADMIN_HANDLES.includes(u.handle) } : null });
      }
      if (M === "POST" && path === "/auth/logout") {
        const tok = getCookie(req, "t4bs_sess");
        if (tok) userSessions.delete(tok);
        res.setHeader("Set-Cookie", `t4bs_sess=; Path=/; Max-Age=0`);
        return send(res, 200, { ok: true });
      }

      // ── Submissions ──
      if (M === "POST" && path === "/submit") {
        const tok = getCookie(req, "t4bs_sess");
        if (!tok || !userSessions.has(tok)) return send(res, 401, { error: "auth-required" });
        const u = await users.getById(userSessions.get(tok));
        const b = await readJson(req);
        const valid = validateSubmission(b);
        if (valid.error) return send(res, 400, valid);
        const id = await submissions.create({ ...valid.normalized, submittedBy: u.handle });
        return send(res, 200, { id, status: "pending" });
      }
      if (M === "GET" && path === "/moderate/pending") {
        const tok = getCookie(req, "t4bs_sess");
        if (!tok || !userSessions.has(tok)) return send(res, 401, { error: "auth-required" });
        const u = await users.getById(userSessions.get(tok));
        if (!ADMIN_HANDLES.includes(u.handle)) return send(res, 403, { error: "admin-only" });
        return send(res, 200, await submissions.listPending());
      }
      if (M === "POST" && path === "/moderate/decide") {
        const tok = getCookie(req, "t4bs_sess");
        if (!tok || !userSessions.has(tok)) return send(res, 401, { error: "auth-required" });
        const u = await users.getById(userSessions.get(tok));
        if (!ADMIN_HANDLES.includes(u.handle)) return send(res, 403, { error: "admin-only" });
        const b = await readJson(req);
        if (!["approved","rejected"].includes(b.status)) return send(res, 400, { error: "bad-status" });
        const s = await submissions.decide(b.id, b.status);
        return send(res, 200, s || { error: "not-found" });
      }

      next();
    } catch (e) {
      send(res, 500, { error: String(e?.message || e) });
    }
  };
}

