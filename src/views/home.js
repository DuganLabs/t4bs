/* HOME view — the states of "/" that are NOT the live round.

   The page at "/" is today's puzzle. While the round is open the shell
   mounts createPlay() (src/views/play.js) there, so this view only draws
   the frame around it: the streak strip, the loading skeleton while the
   round is being started, the finished-for-today card, and the
   nothing-scheduled notice. No catalogue, no categories, no "rounds" —
   the catalogue is a moderator's surface (/moderate).

   Markup mirrors src/bn/views/home.js (SSR) region for region. */

import { computed, effect, signal } from "@basenative/runtime";
import { bnAlert, bnButton, bnSkeleton, h } from "../lib/dom.js";
import { bindHidden, bindText } from "../lib/bind.js";

/** "6h 21m" / "12m" — how long until the next UTC daily unlocks. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 60000));
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

export function createHome({ daily, error, starting, onShareLast, onSubmit }) {
  const d      = computed(() => daily());
  const loaded = computed(() => !!d());
  const done   = computed(() => !!d()?.playedToday);
  const none   = computed(() => loaded() && !d()?.puzzleId);

  /* Live countdown to the next UTC day: the server's number at fetch
     time, ticked locally. */
  const nowTick = signal(Date.now());
  effect(() => {
    if (!done()) return;
    const id = setInterval(() => nowTick.set(Date.now()), 30_000);
    return () => clearInterval(id);
  });
  const fetchedAt = computed(() => { void d(); return Date.now(); });
  const remaining = computed(() => {
    const info = d();
    if (!info) return 0;
    return info.msUntilNext - (nowTick() - fetchedAt());
  });

  /* ── Streak strip ─────────────────────────────────────────────── */
  const streakB = h("strong");
  const bestB   = h("strong");
  const playedB = h("strong");
  bindText(streakB, () => {
    const n = d()?.streak || 0;
    return n > 0 ? `🔥${n}` : "0";
  });
  bindText(bestB,   () => String(d()?.bestStreak || 0));
  bindText(playedB, () => String(d()?.daysPlayed || 0));
  const statsSection = h("section", { "aria-labelledby": "home-stats-title", "data-bn-region": "stats" },
    h("h2", { id: "home-stats-title", class: "sr-only" }, "Your run"),
    h("p", { "data-bn-region": "stat" }, streakB, h("small", null, "Streak")),
    h("p", { "data-bn-region": "stat" }, bestB,   h("small", null, "Best")),
    h("p", { "data-bn-region": "stat" }, playedB, h("small", null, "Days")),
  );
  bindHidden(statsSection, () => !loaded());

  /* ── Error ─────────────────────────────────────────────────────── */
  const errAlert = bnAlert({ variant: "error" });
  bindText(errAlert.content, () => error() || "");
  bindHidden(errAlert.el, () => !error());

  /* ── Starting today's round ────────────────────────────────────── */
  const loading = h("div", { "data-bn-region": "daily-loading", role: "status", "aria-live": "polite", "aria-busy": "true" },
    h("p", { "data-bn-region": "day-label" }, "Setting up today's puzzle…"),
    bnSkeleton({ height: "4.5rem", count: 2 }),
  );
  bindHidden(loading, () => !starting() || done());

  /* ── Done for today ────────────────────────────────────────────── */
  const doneResult = h("h2", { id: "home-done-title", "data-bn-region": "daily-result" });
  const doneScoreN = h("strong");
  const doneCat    = h("p", { "data-bn-region": "daily-cat" });
  const nextHint   = h("p", { "data-bn-region": "daily-next" });
  bindText(doneResult, () => d()?.outcome === "won" ? "Solved" : "Busted");
  bindText(doneScoreN, () => String(d()?.score ?? 0));
  bindText(doneCat,    () => d() ? `${d().category || ""} · ${d().day}` : "");
  bindText(nextHint,   () => `Next puzzle in ${formatCountdown(remaining())}`);
  const shareBtn = bnButton("Share result", {
    variant: "primary",
    attrs: 'data-bn-action="share-last"',
    onClick: () => { onShareLast?.().then(label => { if (label) shareBtn.textContent = label; }); },
  });
  bindHidden(shareBtn, () => !onShareLast);
  const doneCard = h("section", { "aria-labelledby": "home-done-title", "data-bn-region": "daily-done" },
    doneResult,
    h("p", { "data-bn-region": "daily-score" }, doneScoreN, " points"),
    doneCat,
    nextHint,
    shareBtn,
  );
  bindHidden(doneCard, () => !done());

  /* ── Nothing scheduled ─────────────────────────────────────────── */
  const noneCard = h("section", { "aria-labelledby": "home-none-title", "data-bn-region": "daily-none" },
    h("h2", { id: "home-none-title" }, "No puzzle today"),
    h("p", null, "Nothing is scheduled yet. Check back in a bit."),
  );
  bindHidden(noneCard, () => !none());

  const foot = h("p", { "data-bn-region": "home-foot" },
    h("a", { href: "/submit", "data-bn-action": "home-submit", onClick: (e) => { e.preventDefault(); onSubmit(); } }, "Submit a phrase"),
  );

  return h("main", { "aria-labelledby": "home-title", "data-bn-view": "home" },
    h("h1", { id: "home-title", class: "sr-only" }, "Tabs — today's puzzle"),
    statsSection,
    errAlert.el,
    loading,
    doneCard,
    noneCard,
    foot,
  );
}
