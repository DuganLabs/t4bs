/* LOBBY view — server-authoritative daily + free play.

   What changed, and why:

   - The daily used to be picked in the browser (`dailyFromGroups()`,
     seeded off the LOCAL date) and auto-started. Nothing server-side
     agreed with that pick, every puzzle stayed replayable, and the ten
     house puzzles could be cleared in one sitting. The daily now comes
     from `GET /api/daily`: one puzzle per UTC day, the same one for
     everybody, recorded once and not replayable for score.
   - A streak is the actual reason to come back, so it's the first thing
     on the page rather than a chip that only appeared after a win.
   - Free play is back as its own section: every approved puzzle, any
     number of times, clearly marked as not counting.

   Markup stays attribute-driven (data-bn-region / data-bn-action);
   styling lives in styles.css under main[data-bn-view="lobby"]. */

import { computed, effect, signal } from "@basenative/runtime";
import { bnAlert, h } from "../lib/dom.js";
import { bindAttr, bindHidden, bindText } from "../lib/bind.js";
import { groupLobby, renderBrowseShelf } from "../lib/game.js";

/** "6h 21m" / "12m" — how long until the next UTC daily unlocks. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 60000));
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

export function createLobby({
  lobby,
  daily,
  error,
  user,
  onDaily,
  onFree,
  onSubmit,
}) {
  void user; // accepted for parity with the hydrate.js wiring; unused here

  const groups   = computed(() => groupLobby(lobby()));
  const d        = computed(() => daily());
  const done     = computed(() => !!d()?.playedToday);
  const loaded   = computed(() => !!d());

  /* Live countdown to the next UTC day. `msUntilNext` is the server's
     number at fetch time; ticking locally keeps it honest without
     re-polling. */
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

  /* ── Streak strip — the reason to come back, shown from day zero ── */
  const streakB = h("strong");
  const bestB   = h("strong");
  const playedB = h("strong");
  bindText(streakB, () => {
    const n = d()?.streak || 0;
    return n > 0 ? `🔥${n}` : "0";
  });
  bindText(bestB,   () => String(d()?.bestStreak || 0));
  bindText(playedB, () => String(d()?.daysPlayed || 0));

  const statsSection = h("section", {
    "aria-label": "Daily streak",
    "data-bn-region": "stats",
  },
    h("p", { "data-bn-region": "stat" }, streakB, h("small", null, "STREAK")),
    h("p", { "data-bn-region": "stat" }, bestB,   h("small", null, "BEST")),
    h("p", { "data-bn-region": "stat" }, playedB, h("small", null, "DAYS")),
  );
  bindHidden(statsSection, () => !loaded());

  /* ── Error ──────────────────────────────────────────────────────── */
  // @basenative/components' alert, hidden by default: the error variant
  // supplies role="alert" itself, and the message lands in the escaped
  // text slot. Styled by main[data-bn-view="lobby"]
  // [data-bn-region="error"] in styles.css.
  const errAlert = bnAlert({ variant: "error" });
  const errorEl = errAlert.el;
  bindText(errAlert.content, () => `error: ${error() || ""}`);
  bindHidden(errorEl, () => !error());

  /* ── Daily card ─────────────────────────────────────────────────── */

  // (a) Done — result, streak, and when the next one lands.
  const doneResult = h("p", { "data-bn-region": "daily-result" });
  const doneScore  = h("p", { "data-bn-region": "daily-score" });
  const doneCat    = h("p", { "data-bn-region": "daily-cat" });
  bindText(doneResult, () => d()?.outcome === "won" ? "Solved" : "Busted");
  bindText(doneScore,  () => `${d()?.score ?? 0} pts`);
  bindText(doneCat,    () => d()?.category || "");
  const doneCard = h("div", { "data-bn-region": "daily-done" }, doneResult, doneScore, doneCat);
  const nextHint = h("p", { "data-bn-region": "daily-next" });
  bindText(nextHint, () => `Next puzzle in ${formatCountdown(remaining())} · free play below`);
  bindHidden(doneCard, () => !done());
  bindHidden(nextHint, () => !done());

  // (b) Active — today's daily. One shot: it records when it ends.
  const dailyCat = h("strong");
  const dailyBy  = h("small");
  bindText(dailyCat, () => d()?.category || "");
  bindText(dailyBy,  () => d() ? `${d().day} · one attempt · counts toward your streak` : "");
  const dailyBtn = h("button", {
    type: "button",
    "data-bn-action": "lobby-daily",
    "data-bn-variant": "daily",
    onClick: () => { if (d()?.puzzleId) onDaily(); },
  },
    h("span", { class: "sr-only" }, "Play today's puzzle: "),
    dailyCat,
    dailyBy,
  );
  bindAttr(dailyBtn, "aria-label", () => d()
    ? `Play today's puzzle, ${d().category}. This category is fixed for everyone today. One attempt — it counts toward your streak.`
    : "Play today's puzzle");
  bindHidden(dailyBtn, () => done() || !loaded());

  /* The card is a launcher, not a picker — but it shares the free-play
     cards' visual, so it kept being read as one ("still can't change
     from film titles to motivational"). The behaviour is correct and
     must stay: the daily is server-picked per UTC day and recorded
     once, which is the only thing that makes the streak mean anything.
     So the card says so, and hands the reader on to the shelf that DOES
     let them choose. */
  const dailyNote = h("p", { "data-bn-region": "daily-note" },
    "Everyone gets this same category today — it isn't a choice. ",
    "To pick your own, use free play below.",
  );
  bindHidden(dailyNote, () => done() || !loaded());

  // (c) Loading skeleton while /api/daily is in flight.
  const loadingCard = h("div", { "data-bn-region": "daily-loading", "aria-hidden": "true" });
  bindHidden(loadingCard, () => loaded());

  const dailyCard = h("section", {
    "aria-label": "Today's puzzle",
    "data-bn-region": "daily",
  },
    h("p", { "data-bn-region": "daily-label" }, "Today's puzzle · set by the server"),
    doneCard,
    dailyBtn,
    dailyNote,
    loadingCard,
    nextHint,
  );

  /* ── Free play ──────────────────────────────────────────────────── */

  /* One collapsible section per category, listing every round inside
     it — see the browse-shelf note in lib/game.js for why this replaced
     the old one-row-per-category list.

     Built as markup + delegation rather than per-round `h()` nodes with
     their own onClick, because the SSR template renders the identical
     string from the identical helper. Same pattern the moderate view
     already uses for @basenative/admin's queue list. */
  const freeList = h("div", { "data-bn-bind": "browse-host" });
  effect(() => {
    const gs = groups();
    if (!gs || gs.length === 0) {
      freeList.replaceChildren(h("p", { "data-bn-region": "browse-empty" }, "Loading puzzles…"));
      return;
    }
    freeList.innerHTML = renderBrowseShelf(gs, "button");
  });
  freeList.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-bn-action="lobby-pick"]');
    if (!btn) return;
    const id = Number(btn.dataset.puzzleId);
    if (Number.isFinite(id)) onFree(id);
  });

  const freeSection = h("section", {
    "aria-labelledby": "lobby-free-title",
    "data-bn-region": "free-play",
  },
    h("h2", { id: "lobby-free-title" }, "Free play · pick any category"),
    h("p", { "data-bn-region": "free-note" },
      "This is where you choose. Open a category to see every round in "
      + "it — all replayable as often as you like, and they never touch "
      + "your streak."),
    freeList,
  );

  /* Floating "submit a phrase" CTA. */
  const fab = h("button", {
    type: "button",
    "data-bn-action": "lobby-submit",
    "aria-label": "Submit a phrase",
    onClick: onSubmit,
  }, "+ SUBMIT A PHRASE");

  /* One-line statement of the rule that decides every round. The help
     modal explains it properly; this makes sure nobody meets it for the
     first time by losing to it.

     It used to sit between the daily card and free play, which pushed
     the shelf of other categories to y=551 on an 844px viewport — and
     clean off the first screen on anything shorter. The rule is worth
     stating but it is not worth a screenful, so free play now comes
     first and the note closes the page. */
  const rules = h("p", { "data-bn-region": "rules-note" },
    "Four lives for the whole phrase — any word guess that isn't fully correct costs one.");

  return h("main", {
    "aria-labelledby": "lobby-title",
    "data-bn-view": "lobby",
  },
    h("header", null,
      h("h1", { id: "lobby-title", class: "sr-only" }, "Tabs — daily puzzle"),
      h("p", { "data-bn-region": "sticky", "data-bn-variant": "narrow" },
        "One subject. One phrase.", h("br"), "No mercy.",
      ),
      h("p", { "data-bn-region": "tagline" }, "Daily puzzle"),
    ),
    statsSection,
    errorEl,
    dailyCard,
    freeSection,
    rules,
    fab,
  );
}
