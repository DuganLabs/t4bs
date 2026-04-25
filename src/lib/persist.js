/* Persist the in-flight session id + visible client state to localStorage so
   players can refresh / reopen the tab without losing their round. The server
   remains authoritative; on resume we re-fetch state via /api/session/:id (TBD)
   or re-issue the visible state from cache while the user keeps playing. */

const KEY = "t4bs:session";

export function saveSession(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
  } catch {}
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // 12h expiry — sessions older than that are stale
    if (Date.now() - (data.savedAt || 0) > 12 * 3600 * 1000) {
      localStorage.removeItem(KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

export function clearSession() {
  try { localStorage.removeItem(KEY); } catch {}
}

/* Personal stats — wins, streak, best score */
const STATS = "t4bs:stats";
export function loadStats() {
  try { return JSON.parse(localStorage.getItem(STATS) || "{}"); }
  catch { return {}; }
}
export function recordResult({ won, score, category }) {
  const s = loadStats();
  s.played = (s.played || 0) + 1;
  if (won) {
    s.wins = (s.wins || 0) + 1;
    s.streak = (s.streak || 0) + 1;
    s.bestStreak = Math.max(s.bestStreak || 0, s.streak);
    s.best = Math.max(s.best || 0, score);
  } else {
    s.streak = 0;
  }
  s.lastCategory = category;
  s.lastScore = score;
  s.lastResult = won ? "won" : "lost";
  s.lastAt = Date.now();
  try { localStorage.setItem(STATS, JSON.stringify(s)); } catch {}
  return s;
}
