/* T4BS — BaseNative client hydrator.

   Reads the SSR-emitted state from <script id="bn-ssr-state">, seeds
   the same signals the SPA uses, then mounts the imperative game tree
   on top of the SSR'd shell. The shell's semantic markup (header /
   main / section) survives until the SPA replaces #app's children
   with the live signal-driven view tree.

   Loaded only when functions/_middleware.js decided to serve the SSR
   shell (the default). `?legacy=1` opts out and serves dist/index.html
   plus src/main.js — which is identical to this entry minus the SSR
   seed and asset-manifest plumbing. */

import "../../styles.css";
import "@basenative/keyboard/styles.css";
import "@basenative/combobox/css";
/* @basenative/components: tokens.css + components.css + states.css
   bring in the `--bn-*` variables and the [data-bn="dialog"] /
   [data-bn="tabs"] rules the new renderDialog()/renderTabs() markup
   needs, each wrapped in its own `@layer tokens|components|states {}`
   so importing them in this order registers that same relative layer
   order (tokens before components before states) on first encounter —
   no separate layer-order declaration needed for that.
   (0.6.0 fixes the gap noted here against 0.5.0: `./layers.css` — the
   package's own `@layer reset, tokens, layout, components, states;`
   order declaration — is now a real exports-map subpath and no longer
   404s the build. Still deliberately NOT imported, for a different
   reason than before: T4BS's own styles.css declares its *own*
   `@layer reset, app, keyboard;` up top, i.e. a layer also named
   "reset". Cascade layers with the same name are the same layer
   everywhere in the document, so importing the package's layers.css
   would fold that name into the shared global layer order and — per
   the browser's "insert new names right after the last already-known
   name in this statement" merge rule — splice tokens/layout/components/
   states in between T4BS's "reset" and "app" layers, instead of after
   them as today's plain import-order registration achieves. That
   flips whether T4BS's own "app"/"keyboard" layers outrank this
   package's "components"/"states" layers for equal-specificity rules —
   a real cascade-order change, not just a no-op order lock, and one
   this pass isn't signing off on without a visual pass to back it up.
   reset.css and layout.css remain unimported for the original reason:
   T4BS already owns its own reset (styles.css, above) and doesn't use
   the layout-grid component, so pulling those in is dead weight (or
   worse, a same-named-layer collision) for no visual benefit.
   ../../theme.css (below) carries T4BS's token mapping onto this
   package's palette — it wins regardless of layer order because it's
   deliberately unlayered (see that file's own comment). */
import "@basenative/components/tokens.css";
import "@basenative/components/components.css";
import "@basenative/components/states.css";
import "../../theme.css";

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
/* submit / moderate / admin are gated behind user actions and pull in
   their own heavy deps (@basenative/admin ~27 KB raw, combobox ~25 KB
   raw). Lazy-loading them shaves the eager chunk for the
   solve-the-daily journey that 95%+ of visitors take. */
import { decidePlayBoot, withTimeout, isResumable } from "./play-boot.js";

/** @typedef {import("../route-table.js").RouteName} RouteName */

/* SSR state lives in a typed JSON script block — same channel the
   express example uses (`<script type="application/json">`). Falls
   back to an empty object on the legacy SPA path or when the SSR
   shell wasn't served. */
function readSsrState() {
  if (typeof document === "undefined") return {};
  const node = document.getElementById("bn-ssr-state");
  if (!node) return {};
  try { return JSON.parse(node.textContent || "{}"); }
  catch { return {}; }
}

const SSR = readSsrState();

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
/* Server's answer to "what is today's puzzle, and where does this
   player stand?" — see GET /api/daily. The client no longer picks a
   daily; it renders this. */
const daily         = signal(SSR.daily || null);

/* Distinguishes "we are actively trying to resolve a session" from
   "we definitively have no session". Without this the view effect can't
   tell whether to show "Loading round…" or to bounce home, and a stalled
   resume leaves the user staring at the loader forever. Seeded `true`
   only when the SSR-rendered route is /play; every other entry point
   starts the user away from the play view. */
const playLoading = signal(SSR.route === "play");

/* Bound on resume failure so the resume timeout / network error etc.
   can be communicated as a toast without coupling the boot routine to
   the toaster's lifetime. */
const RESUME_TIMEOUT_MS = 8000;

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

/* Local stats are now a personal-best scratchpad only. The STREAK is
   server-side (daily_results keyed by player + UTC day) — a streak a
   player could reset by clearing localStorage, or inflate by replaying
   the same ten puzzles, was never worth coming back for.
   @param {boolean} won @param {number} finalScore
   @param {string} category @param {string} mode "daily" | "free" */
async function recordResultPersist(won, finalScore, category, mode) {
  const s = (await loadPersisted(STATS_KEY)) || {};
  s.played = (s.played || 0) + 1;
  if (won) {
    s.wins = (s.wins || 0) + 1;
    s.best = Math.max(s.best || 0, finalScore);
  }
  s.lastCategory = category;
  s.lastScore = finalScore;
  s.lastResult = won ? "won" : "lost";
  s.lastMode = mode;
  s.lastAt = Date.now();
  await savePersisted(STATS_KEY, s);
  await clearPersisted(SESSION_KEY);
  stats.set(s);
  /* The authoritative daily snapshot arrives on the response that ended
     the round (createPlay's onDailyUpdate). Refresh anyway for the
     free-play case and for any round that ended without one. */
  api.daily().then(daily.set).catch(() => {});
}

/* ── Initial fetches: skipped when SSR pre-populated the signal ───── */
if (!SSR.lobby) {
  api.listPuzzles().then(lobby.set).catch(e => error.set(String(e.message || e)));
}
if (!SSR.user) {
  api.me().then(r => user.set(r.user)).catch(() => {});
}
if (!SSR.daily) {
  api.daily().then(daily.set).catch(() => {});
}

/* Reload-safe play-route resume.

   Boot policy (decidePlayBoot) is a pure function in play-boot.js —
   easier to test and harder to leave in the half-finished state that
   PR #43 shipped. Every failure path here MUST end with either a
   hydrated session or a navigate-home; falling through with both
   `session()` null and `playLoading()` true is the bug we're fixing. */
(async () => {
  try {
    const saved = await loadPersisted(SESSION_KEY).catch(() => null);
    const intent = decidePlayBoot(window.location, saved);

    /* Routes other than /play and / never touch session start/resume —
       decidePlayBoot returns "ignore" for them so e.g. a moderator
       reloading /moderate with an unfinished daily saved stays on
       /moderate instead of being bounced into the game. */
    if (intent.kind === "ignore") return;

    if (intent.kind === "start") {
      const url = new URL(window.location.href);
      url.searchParams.delete("play");
      window.history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
      await start(intent.puzzleId);
      return;
    }

    if (intent.kind === "daily") {
      const url = new URL(window.location.href);
      url.searchParams.delete("daily");
      window.history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
      await startDaily();
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
          if (window.location.pathname !== "/play") router.navigate("/play");
          toaster("RESUMED — pick up where you left off", "good");
          return;
        }
        await clearPersisted(SESSION_KEY).catch(() => {});
      } catch (e) {
        await clearPersisted(SESSION_KEY).catch(() => {});
        const code = /** @type {{ code?: string }} */ (e)?.code;
        if (code === "ETIMEOUT") toaster("Couldn't reach the server — try again.", "bad");
      }
    }

    /* "home" intent OR resume failed/expired: get the user off /play.
       Previously this relied on a fall-through `if (!session()) navigate("/")`
       check that never ran when the resume promise stalled forever. */
    if (window.location.pathname === "/play") router.navigate("/");
  } finally {
    playLoading.set(false);
  }
})();

/* The lobby no longer auto-starts anything. Auto-start existed to sell
   the Wordle-style "one puzzle a day" framing while the pick was
   client-side and unenforced; now the daily is real, the lobby's job is
   to show the streak, today's card and the free-play shelf and let the
   player choose. */

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

/* Today's daily. The server picks the puzzle and refuses a second run
   on the same UTC day — a 409 here means "already played", which is a
   lobby state, not an error. */
async function startDaily() {
  error.set(null);
  try {
    const s = await withTimeout(api.startDaily(), RESUME_TIMEOUT_MS, "start-timeout");
    if (s.daily) daily.set(s.daily);
    hydrateSession(s, true);
    await savePersisted(SESSION_KEY, { sessionId: s.sessionId }, 12 * 3600);
    router.navigate("/play");
  } catch (e) {
    const err = /** @type {{ data?: { daily?: unknown }, message?: string }} */ (e);
    if (err?.data?.daily) {
      daily.set(err.data.daily);
      toaster("TODAY'S PUZZLE IS DONE — free play below", "good");
    } else {
      error.set(String(err?.message || e));
    }
    if (window.location.pathname === "/play") router.navigate("/");
  }
}

/** Free play — any approved puzzle, unlimited, never recorded. */
async function start(puzzleId) {
  error.set(null);
  try {
    const s = await withTimeout(api.startSession(puzzleId), RESUME_TIMEOUT_MS, "start-timeout");
    hydrateSession(s, true);
    await savePersisted(SESSION_KEY, { sessionId: s.sessionId }, 12 * 3600);
    router.navigate("/play");
  } catch (e) {
    error.set(String(/** @type {Error} */ (e)?.message || e));
    /* Don't strand the user on /play with no session — surface the
       error on the lobby where the message + retry are visible. */
    if (window.location.pathname === "/play") router.navigate("/");
  }
}

async function shareResult({ won }) {
  try {
    const s = session();
    if (!s?.words) return "Couldn't share";
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

/* The SSR shell renders semantic HTML (<header><main>) into #app for
   crawlers + first paint. The SPA below replaces #app's contents with
   the imperative signal-driven tree. The mount() call clears existing
   children, so the SSR markup is the wallpaper that buys us LCP +
   no-script readability while the SPA boots. */

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

const viewSlot = h("div", { "data-bn-region": "view-slot" });

/* Lazy-mount helper for views that ship in their own chunk. Shows a
   status placeholder while the import resolves, then mounts only if
   the user hasn't navigated away in the meantime. */
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

const container = h("div", {
  "data-bn-region": "shell",
  "data-playing": () => view() === "playing" ? "" : null,
});
container.append(header, viewSlot);

/* Mount BEFORE registering the view-switching effect below. That effect
   runs immediately on creation (it's a plain `effect()`, not deferred),
   and — for a signed-out visitor whose route is /submit, or any other
   guarded route — its first pass calls `authOpen.set(true)`/navigates
   synchronously. authModal's own `effect()` reacts to that in the same
   tick: if the modal weren't in the document yet, `dlg.showModal()`
   would throw "not in a Document" (now guarded in auth-modal.js too,
   but a still-detached dialog can only ever silently fail to open —
   mounting first is what lets it actually show). */
mount(root,
  container,
  createToast(toast),
  helpModal,
  authModal,
);

effect(() => {
  const v = view();
  if (v === "lobby") {
    mount(viewSlot, createLobby({
      lobby, daily, error, user,
      onDaily: startDaily,
      onFree: start,
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
    mountLazy("submit", () => import("../../views/submit.js"), (mod) => mod.createSubmit({
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
    mountLazy("moderate", () => import("../../views/moderate.js"), (mod) => mod.createModerate({
      toaster,
      goLobby: () => router.navigate("/"),
      onLobbyChange: () => api.listPuzzles().then(lobby.set).catch(() => {}),
    }));
  } else if (v === "admin") {
    if (!user()?.isAdmin) {
      router.navigate("/");
      return;
    }
    mountLazy("admin", () => import("../../views/admin.js"), (mod) => mod.createAdmin({
      currentHandle: user()?.handle,
      toaster,
      goLobby: () => router.navigate("/"),
    }));
  } else if (v === "playing") {
    if (!session()) {
      if (playLoading()) {
        mount(viewSlot,
          h("p", { role: "status", "aria-live": "polite" }, "Loading round…"),
        );
      } else {
        /* Boot resolver gave up but route still says /play — flip back
           to the lobby instead of dead-ending here. */
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
      onDailyUpdate: daily.set,
      onShare: shareResult,
      goLobby: () => { phase.set("lobby"); router.navigate("/"); },
      retry: () => { const id = session()?.id; if (id) start(id); },
    }));
  }
});

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
