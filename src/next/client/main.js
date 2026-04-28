/* T4BS — BaseNative SSR hydration entry (?next=1 path).

   Boots the same signal-driven views the SPA uses, but seeds them from
   window.__T4BS_SSR__ so the first interaction skips /api/puzzles +
   /api/auth/me round-trips. The SSR'd #app DOM is replaced by the live
   imperative tree once the signals are wired — same UI, same behavior
   as the SPA path, just with a server-rendered first paint.

   Importantly: this entry is ONLY loaded when the worker decides to
   serve the SSR shell (presence of ?next=1). The legacy SPA at
   /src/main.js continues to drive everything else, untouched. */

import "../../styles.css";
import "@basenative/keyboard/styles.css";

import { signal, effect } from "@basenative/runtime";
import { createRouter, interceptLinks } from "@basenative/router";
import {
  loadPersisted, savePersisted, clearPersisted,
} from "@basenative/persist";
import { nativeShare, mintShareCard, composeShareText } from "@basenative/share/client";

import { api } from "../../lib/api.js";
import { groupLobby } from "../../lib/game.js";
import { mount, h } from "../../lib/dom.js";
import { createHeader }    from "../../components/header.js";
import { createToast, makeToaster } from "../../components/toast.js";
import { createHelpModal } from "../../components/help-modal.js";
import { createAuthModal } from "../../components/auth-modal.js";
import { createLobby }    from "../../views/lobby.js";
import { createPlay }     from "../../views/play.js";
import { createSubmit }   from "../../views/submit.js";
import { createModerate } from "../../views/moderate.js";
import { createAdmin }    from "../../views/admin.js";

/** @typedef {import("../route-table.js").RouteName} RouteName */

const SSR = /** @type {any} */ (typeof window !== "undefined" ? window.__T4BS_SSR__ : null) || {};

/* ── Error logging — same envelope as src/main.js ──────────────────── */
function postLog(payload) {
  try {
    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch { /* empty */ }
}
window.addEventListener("error", (e) => {
  postLog({ msg: e.message, where: `${e.filename}:${e.lineno}:${e.colno}`, stack: e.error?.stack, url: location.href });
});
window.addEventListener("unhandledrejection", (e) => {
  postLog({ msg: String(e.reason?.message || e.reason || "unhandledrejection"), stack: e.reason?.stack, where: "promise", url: location.href });
});

/* ── App-level signals, seeded from SSR where possible ────────────── */
const view  = signal(routeToView(SSR.route));
const user  = signal(SSR.user || null);
const lobby = signal(SSR.lobby || null);
const error = signal(null);
const stats = signal({});
const toast = signal(null);
const helpOpen = signal(false);
const authOpen = signal(false);

const session       = signal(null);
const locked        = signal([]);
const presentGlobal = signal([]);
const absentByWord  = signal([]);
const wordSolved    = signal([]);
const posFeedback   = signal([]);
const score         = signal(0);
const lives         = signal(4);
const tokens        = signal(0);
const phase         = signal("lobby");
const reveal        = signal(null);

const toaster = makeToaster(toast);

/* ── Router ────────────────────────────────────────────────────────── */
const router = createRouter([
  { path: "/",         name: "lobby" },
  { path: "/play",     name: "play" },
  { path: "/submit",   name: "submit" },
  { path: "/moderate", name: "moderate" },
  { path: "/admin",    name: "admin" },
]);
interceptLinks(document, router);

effect(() => {
  const r = router.currentRoute();
  if (r.name === "lobby")         view.set("lobby");
  else if (r.name === "play")     view.set("playing");
  else if (r.name === "submit")   view.set("submit");
  else if (r.name === "moderate") view.set("moderate");
  else if (r.name === "admin")    view.set("admin");
});

/* ── Stats + session resume via @basenative/persist ───────────────── */
const STATS_KEY   = "t4bs:stats";
const SESSION_KEY = "t4bs:session";

(async () => {
  const s = await loadPersisted(STATS_KEY);
  if (s) stats.set(s);
})();

async function recordResultPersist(won, finalScore, category) {
  const s = (await loadPersisted(STATS_KEY)) || {};
  s.played = (s.played || 0) + 1;
  if (won) {
    s.wins = (s.wins || 0) + 1;
    s.streak = (s.streak || 0) + 1;
    s.bestStreak = Math.max(s.bestStreak || 0, s.streak);
    s.best = Math.max(s.best || 0, finalScore);
  } else {
    s.streak = 0;
  }
  s.lastCategory = category;
  s.lastScore = finalScore;
  s.lastResult = won ? "won" : "lost";
  s.lastAt = Date.now();
  await savePersisted(STATS_KEY, s);
  await clearPersisted(SESSION_KEY);
  stats.set(s);
}

/* ── Initial fetches: skipped when SSR pre-populated the signal ───── */
if (!SSR.lobby) {
  api.listPuzzles().then(lobby.set).catch(e => error.set(String(e.message || e)));
}
if (!SSR.user) {
  api.me().then(r => user.set(r.user)).catch(() => {});
}

(async () => {
  const url = new URL(window.location.href);
  const playParam = url.searchParams.get("play");
  const playId = playParam ? Number(playParam) : NaN;
  if (Number.isFinite(playId) && playId > 0) {
    url.searchParams.delete("play");
    window.history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
    await start(playId);
    return;
  }

  const saved = await loadPersisted(SESSION_KEY);
  if (saved?.sessionId) {
    try {
      const s = await api.resumeSession(saved.sessionId);
      if (s.error || s.finished) {
        await clearPersisted(SESSION_KEY);
      } else {
        hydrateSession(s, /* fresh */ false);
        router.navigate("/play");
        toaster("RESUMED — pick up where you left off", "good");
        return;
      }
    } catch {
      await clearPersisted(SESSION_KEY);
    }
  }

  if (window.location.pathname === "/play" && !session()) {
    router.navigate("/");
  }
})();

function hydrateSession(s, fresh) {
  const lm = s.words.map(() => ({}));
  s.anchors.forEach(a => { lm[a.wi][a.li] = a.letter; });
  if (!fresh) {
    Object.entries(s.locked || {}).forEach(([wi, m]) => {
      Object.entries(m || {}).forEach(([li, letter]) => { lm[Number(wi)][Number(li)] = letter; });
    });
  }
  session.set(s);
  locked.set(lm);
  presentGlobal.set(fresh ? [] : (s.presentGlobal || []));
  absentByWord.set(fresh ? s.words.map(() => []) : (s.absentByWord || s.words.map(() => [])));
  wordSolved.set(fresh ? s.words.map(() => false) : (s.wordSolved || s.words.map(() => false)));
  score.set(fresh ? 0 : (s.score || 0));
  lives.set(s.lives ?? 4);
  tokens.set(fresh ? 0 : (s.tokens || 0));
  reveal.set(null);
  posFeedback.set(s.words.map((len, wi) => {
    const arr = Array(len).fill(null);
    if (!fresh) {
      Object.keys(s.locked?.[wi] || {}).forEach(li => { arr[Number(li)] = "green"; });
    }
    return arr;
  }));
  phase.set("playing");
  view.set("playing");
}

async function start(puzzleId) {
  error.set(null);
  try {
    const s = await api.startSession(puzzleId);
    hydrateSession(s, true);
    await savePersisted(SESSION_KEY, { sessionId: s.sessionId }, 12 * 3600);
    router.navigate("/play");
  } catch (e) {
    error.set(String(e.message || e));
  }
}

async function shareResult({ won }) {
  try {
    const s = session();
    const sLocked = locked();
    const sPos = posFeedback();
    const grid = s.words.map((len, wi) => {
      let row = "";
      for (let li = 0; li < len; li++) {
        const isLocked = sLocked[wi]?.[li] !== undefined;
        const fb = sPos?.[wi]?.[li];
        if (isLocked || fb === "green") row += "🟩";
        else if (fb === "yellow")        row += "🟨";
        else if (fb === "absent")        row += "⬛";
        else                             row += "⬜";
      }
      return row;
    }).join("\n");

    let shareUrl = "https://t4bs.com";
    try {
      const minted = await mintShareCard({
        sessionId: s.sessionId || s.id,
        puzzleId: s.puzzleId ?? s.id ?? null,
        category: s.category,
        score: score(),
        won,
        grid,
      }, { endpoint: "/api/share-cards" });
      if (minted?.url) shareUrl = minted.url;
    } catch { /* fall back to home URL */ }

    const text = composeShareText(
      "Tabs · ${category} · ${score}pts · ${verdict}\n\n${grid}",
      { category: s.category, score: score(), verdict: won ? "Solved" : "Busted", grid }
    );
    const r = await nativeShare({ text, url: shareUrl });
    if (r?.status === "shared") return "✓ Shared";
    if (r?.status === "copied") return "✓ Copied";
    return "Couldn't share";
  } catch {
    return "Couldn't share";
  }
}

/* ── Mount ─────────────────────────────────────────────────────────── */
const root = document.getElementById("app");
if (!root) throw new Error("missing #app — SSR shell broken");

const header = createHeader({
  view, user, score, lives, tokens,
  onLogo:   () => router.navigate("/"),
  onHelp:   () => helpOpen.set(true),
  onAuth:   () => authOpen.set(true),
  onMod:    () => router.navigate("/moderate"),
  onAdmin:  () => router.navigate("/admin"),
  onLogout: async () => { await api.logout(); user.set(null); },
});

const helpModal = createHelpModal({
  open: () => helpOpen(),
  onClose: () => helpOpen.set(false),
});
const authModal = createAuthModal({
  open: () => authOpen(),
  onClose: () => authOpen.set(false),
  onAuthed: (u) => { user.set(u); authOpen.set(false); },
});

const viewSlot = h("div", { class: "lb-view-slot" });

effect(() => {
  const v = view();
  if (v === "lobby") {
    mount(viewSlot, createLobby({
      lobby, stats, error, user,
      onPick: start,
      onSubmit: () => {
        if (user()) router.navigate("/submit");
        else authOpen.set(true);
      },
    }));
  } else if (v === "submit") {
    if (!user()) {
      router.navigate("/");
      authOpen.set(true);
      return;
    }
    mount(viewSlot, createSubmit({
      existingCategories: () => groupLobby(lobby())?.map(g => g.category) || [],
      onCancel: () => router.navigate("/"),
      onSubmitted: () => {
        api.listPuzzles().then(lobby.set).catch(() => {});
        router.navigate("/");
      },
      toaster,
    }));
  } else if (v === "moderate") {
    if (!(user()?.isModerator || user()?.isAdmin)) {
      router.navigate("/");
      return;
    }
    mount(viewSlot, createModerate({
      toaster,
      goLobby: () => router.navigate("/"),
      onLobbyChange: () => api.listPuzzles().then(lobby.set).catch(() => {}),
    }));
  } else if (v === "admin") {
    if (!user()?.isAdmin) {
      router.navigate("/");
      return;
    }
    mount(viewSlot, createAdmin({
      currentHandle: user()?.handle,
      toaster,
      goLobby: () => router.navigate("/"),
    }));
  } else if (v === "playing") {
    if (!session()) {
      mount(viewSlot, h("div", { class: "lb-cred" }, "loading round…"));
      return;
    }
    mount(viewSlot, createPlay({
      session, locked, presentGlobal, absentByWord, wordSolved, posFeedback,
      score, lives, tokens, phase, reveal,
      toaster,
      onResultRecorded: recordResultPersist,
      onShare: shareResult,
      goLobby: () => { phase.set("lobby"); router.navigate("/"); },
      retry: () => { const id = session()?.id; if (id) start(id); },
    }));
  }
});

const container = h("div", {
  class: () => `lb${view() === "playing" ? " is-playing" : ""}`,
});
container.append(header, viewSlot);

mount(root,
  container,
  createToast(toast),
  helpModal,
  authModal,
);

/** @param {string | undefined} ssrRoute @returns {string} */
function routeToView(ssrRoute) {
  switch (ssrRoute) {
    case "play":     return "playing";
    case "submit":   return "submit";
    case "moderate": return "moderate";
    case "admin":    return "admin";
    case "lobby":
    default:         return "lobby";
  }
}
