/* T4BS — BaseNative SSR/SPA shell entry point.
   Replaces the React 18 app with a signal-driven runtime.

   - Routing: @basenative/router (hash-free) for /, /play, /moderate, /admin.
     /s/:id is handled by functions/s/[id].js (worker-rendered) and never
     reaches this bundle.
   - Persistence: @basenative/persist for session resume + stats.
   - Sharing: @basenative/share/client for nativeShare + mintShareCard.
   - Keyboard: @basenative/keyboard for the on-screen QWERTY.
   - Game core: shared/engine.js (untouched) via /api/* endpoints. */

import "./styles.css";
import "@basenative/keyboard/styles.css";
import "@basenative/combobox/css";
/* Kept in sync with src/bn/client/hydrate.js's @basenative/components
   imports (see that file for why tokens/components/states, why not
   layers.css, and why not the package's reset.css/layout.css) — this
   file is documented above as "identical to [hydrate.js] minus the
   SSR seed", and the toast/help-modal/auth-modal components it also
   mounts now render [data-bn="dialog"]/[data-bn="tabs"] markup that
   needs this CSS. */
import "@basenative/components/tokens.css";
import "@basenative/components/components.css";
import "@basenative/components/states.css";
import "./theme.css";

import { signal, effect } from "@basenative/runtime";
import { createRouter, interceptLinks } from "@basenative/router";
import {
  loadPersisted, savePersisted, clearPersisted,
} from "@basenative/persist";
import { nativeShare, mintShareCard, composeShareText } from "@basenative/share/client";

import { api } from "./lib/api.js";
import { groupLobby } from "./lib/game.js";
import { mount, h } from "./lib/dom.js";
import { createHeader } from "./components/header.js";
import { createToast, makeToaster } from "./components/toast.js";
import { createHelpModal } from "./components/help-modal.js";
import { createAuthModal } from "./components/auth-modal.js";
import { createLobby } from "./views/lobby.js";
import { createPlay } from "./views/play.js";
/* submit / moderate / admin are gated behind user actions (clicking the
   submit FAB, navigating to /moderate or /admin) and are bundled with
   their own heavy deps (@basenative/admin, @basenative/combobox). They
   load lazily via dynamic import below — keeping them out of the eager
   chunk shaves ~10 kB gzipped for the typical play-only journey. */
import { decidePlayBoot, withTimeout, isResumable } from "./bn/client/play-boot.js";

/* ── error logging (carryover from the React main) ─────────────────────── */
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

/* ── App-level signals ─────────────────────────────────────────────────── */
const view  = signal("lobby");      // 'lobby' | 'playing' | 'submit' | 'moderate' | 'admin'
const user  = signal(null);
const lobby = signal(null);
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
/* True while the /play boot resolver is running — distinguishes
   "still loading" from "definitively no session". */
const playLoading   = signal(window.location.pathname === "/play");

/* Daily-done flag — accepted by createLobby() since #51. The SSR boot
   path (src/bn/client/hydrate.js) computes this from a persisted
   `dailyDate` stamp; the legacy `?legacy=1` SPA shell has no such
   tracking, so the daily picker is always live here. Without this
   signal, lobby.js hits `dailyDone is not a function`. */
const dailyDone     = signal(false);

const RESUME_TIMEOUT_MS = 8000;

const toaster = makeToaster(toast);

/* ── Router ────────────────────────────────────────────────────────────── */
const router = createRouter([
  { path: "/",         name: "lobby" },
  { path: "/play",     name: "play" },
  { path: "/submit",   name: "submit" },
  { path: "/moderate", name: "moderate" },
  { path: "/admin",    name: "admin" },
]);
// interceptLinks signature is (root, router) — first arg is the DOM element to
// listen on, second is the router. Passing only `router` made `root` = router,
// which has no addEventListener → blank-page crash.
interceptLinks(document, router);

effect(() => {
  const r = router.currentRoute();
  if (r.name === "lobby")         view.set("lobby");
  else if (r.name === "play")     view.set("playing");
  else if (r.name === "submit")   view.set("submit");
  else if (r.name === "moderate") view.set("moderate");
  else if (r.name === "admin")    view.set("admin");
});

/* ── Stats + session resume via @basenative/persist ────────────────────── */
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

/* ── Boot the lobby + me + resume / deep-link ──────────────────────────── */
api.listPuzzles().then(lobby.set).catch(e => error.set(String(e.message || e)));
api.me().then(r => user.set(r.user)).catch(() => {});

(async () => {
  try {
    const saved = await loadPersisted(SESSION_KEY).catch(() => null);
    const intent = decidePlayBoot(window.location, saved);

    if (intent.kind === "start") {
      const url = new URL(window.location.href);
      url.searchParams.delete("play");
      window.history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
      await start(intent.puzzleId);
      return;
    }

    if (intent.kind === "resume") {
      try {
        const s = await withTimeout(
          api.resumeSession(intent.sessionId),
          RESUME_TIMEOUT_MS,
          "resume-timeout",
        );
        if (isResumable(s)) {
          hydrateSession(s, /* fresh */ false);
          router.navigate("/play");
          toaster("RESUMED — pick up where you left off", "good");
          return;
        }
        await clearPersisted(SESSION_KEY).catch(() => {});
      } catch (e) {
        await clearPersisted(SESSION_KEY).catch(() => {});
        if (/** @type {{ code?: string }} */ (e)?.code === "ETIMEOUT") {
          toaster("Couldn't reach the server — try again.", "bad");
        }
      }
    }

    if (window.location.pathname === "/play") router.navigate("/");
  } finally {
    playLoading.set(false);
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
    const s = await withTimeout(api.startSession(puzzleId), RESUME_TIMEOUT_MS, "start-timeout");
    hydrateSession(s, true);
    await savePersisted(SESSION_KEY, { sessionId: s.sessionId }, 12 * 3600);
    router.navigate("/play");
  } catch (e) {
    error.set(String(/** @type {Error} */ (e)?.message || e));
    if (window.location.pathname === "/play") router.navigate("/");
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

/* ── Mount ─────────────────────────────────────────────────────────────── */
const root = document.getElementById("app");

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
  open: helpOpen.peek ? () => helpOpen() : helpOpen,
  onClose: () => helpOpen.set(false),
});
const authModal = createAuthModal({
  open: () => authOpen(),
  onClose: () => authOpen.set(false),
  onAuthed: (u) => { user.set(u); authOpen.set(false); },
});

// View slot — replaced reactively when the route or session changes.
const viewSlot = h("div", { "data-bn-region": "view-slot" });

/* Lazy-mount helper for views that ship in their own chunk. Shows a
   status placeholder while the import resolves, then mounts only if the
   user hasn't navigated away in the meantime. The signal read after the
   await happens outside an effect context, so it doesn't create stray
   subscriptions on the outer view-mount effect. */
function mountLazy(label, importFn, build) {
  mount(viewSlot, h("p", {
    "data-bn-region": "status",
    role: "status",
    "aria-live": "polite",
  }, `Loading ${label}…`));
  importFn().then((mod) => {
    if (view() !== label) return;
    mount(viewSlot, build(mod));
  }).catch((err) => {
    if (view() !== label) return;
    mount(viewSlot, h("p", {
      "data-bn-region": "error",
      role: "alert",
    }, `Couldn't load ${label}: ${String(err?.message || err)}`));
  });
}

// Re-mount the active view when `view` changes. Effects own DOM lifetime;
// each branch builds its component fresh, so we can safely tear down by
// just replacing children on `viewSlot`.
effect(() => {
  const v = view();
  if (v === "lobby") {
    mount(viewSlot, createLobby({
      lobby, stats, error, user, dailyDone,
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
    mountLazy("submit", () => import("./views/submit.js"), (mod) => mod.createSubmit({
      existingCategories: () => groupLobby(lobby())?.map(g => g.category) || [],
      onCancel: () => router.navigate("/"),
      onSubmitted: () => {
        // Refresh lobby (in case admin auto-approved) and bounce home.
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
    mountLazy("moderate", () => import("./views/moderate.js"), (mod) => mod.createModerate({
      toaster,
      goLobby: () => router.navigate("/"),
      onLobbyChange: () => api.listPuzzles().then(lobby.set).catch(() => {}),
    }));
  } else if (v === "admin") {
    if (!user()?.isAdmin) {
      router.navigate("/");
      return;
    }
    mountLazy("admin", () => import("./views/admin.js"), (mod) => mod.createAdmin({
      currentHandle: user()?.handle,
      toaster,
      goLobby: () => router.navigate("/"),
    }));
  } else if (v === "playing") {
    if (!session()) {
      if (playLoading()) {
        mount(viewSlot, h("p", { "data-bn-region": "status", role: "status", "aria-live": "polite" }, "loading round…"));
      } else {
        mount(viewSlot);
        if (window.location.pathname === "/play") router.navigate("/");
      }
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

// Top-level shell — gradient + flex layout. The data-playing attribute
// toggles the keyboard-mode bottom padding via
// [data-bn-region="shell"][data-playing] in styles.css.
const container = h("div", {
  "data-bn-region": "shell",
  "data-playing": () => view() === "playing" ? "" : null,
});
container.append(header, viewSlot);

mount(root,
  container,
  createToast(toast),
  helpModal,
  authModal,
);
