/* LOBBY view — daily-only mode.

   One puzzle per day, Wordle-style. Shows today's daily puzzle as the
   only play target, OR a "come back tomorrow" card with the player's
   last result if they've already finished today's daily. Submission
   FAB is preserved so users can still contribute new puzzles.

   Structure mirrors the SSR shell where reasonable; the puzzle list
   that previously lived here has been removed entirely. Browse-and-pick
   is no longer the player journey — daily auto-start (in hydrate.js)
   makes the lobby a destination only when today's puzzle is already
   done. */

import { computed } from "@basenative/runtime";
import { h } from "../lib/dom.js";
import { bindHidden, bindText } from "../lib/bind.js";
import { groupLobby, dailyFromGroups } from "../lib/game.js";

export function createLobby({
  lobby,
  stats,
  error,
  user,
  dailyDone,
  onPick,
  onSubmit,
}) {
  void user; // accepted for parity with hydrate.js wiring; unused right now

  const groups = computed(() => groupLobby(lobby()));
  const daily  = computed(() => dailyFromGroups(groups()));
  const hasStats = computed(() => (stats()?.played || 0) > 0);

  /* Stats — three little chips, only visible after the first played round. */
  const winsB    = h("strong");
  const bestB    = h("strong");
  const streakB  = h("strong");
  bindText(winsB,   () => String(stats()?.wins || 0));
  bindText(bestB,   () => String(stats()?.best || 0));
  bindText(streakB, () => (stats()?.streak || 0) > 0 ? `🔥${stats().streak}` : "—");

  const statsSection = h("section", {
    class: "lb-stats",
    "aria-label": "Personal stats",
    "data-bn-region": "stats",
  },
    h("p", { class: "lb-stat" }, winsB,   h("small", null, "WINS")),
    h("p", { class: "lb-stat" }, bestB,   h("small", null, "BEST")),
    h("p", { class: "lb-stat" }, streakB, h("small", null, "STREAK")),
  );
  bindHidden(statsSection, () => !hasStats());

  /* Error — single status paragraph, hidden by default. */
  const errorEl = h("p", {
    class: "lb-cred lb-cred-error",
    role: "alert",
    "data-bn-region": "error",
  });
  bindText(errorEl, () => `error: ${error() || ""}`);
  bindHidden(errorEl, () => !error());

  /* Daily card — three mutually-exclusive sub-views, each shown via
     bindHidden so the structure stays declarative (matches statsSection
     pattern). The auto-start effect in hydrate.js means the player
     usually only sees the "done" branch in practice; the active branch
     is here for the deep-link case where the user lands on / before
     auto-start has fired. */

  // (a) Done — last result + come-back-tomorrow hint.
  const doneResult = h("p", { class: "lb-daily-result" });
  const doneScore  = h("p", { class: "lb-daily-score" });
  const doneCat    = h("p", { class: "lb-daily-cat" });
  bindText(doneResult, () => stats()?.lastResult === "won" ? "Solved" : "Busted");
  bindText(doneScore,  () => `${stats()?.lastScore || 0} pts`);
  bindText(doneCat,    () => stats()?.lastCategory || "");
  const doneCard = h("div", { class: "lb-daily-done" }, doneResult, doneScore, doneCat);
  const nextHint = h("p", { class: "lb-daily-next" }, "Come back tomorrow for a new puzzle");
  bindHidden(doneCard, () => !dailyDone());
  bindHidden(nextHint, () => !dailyDone());

  // (b) Active — today's daily play button.
  const dailyCat = h("strong", { class: "lb-lobby-cat" });
  const dailyBy  = h("small", { class: "lb-lobby-by" });
  bindText(dailyCat, () => daily()?.group?.category || "");
  bindText(dailyBy,  () => daily() ? `by ${daily().puzzle.submittedBy}` : "");
  const dailyBtn = h("button", {
    type: "button",
    class: "lb-lobby-item lb-daily-item",
    "data-bn-action": "lobby-pick",
    onClick: () => { const d = daily(); if (d) onPick(d.puzzle.id); },
  },
    h("span", { class: "sr-only" }, "Play today's puzzle: "),
    dailyCat,
    dailyBy,
  );
  bindHidden(dailyBtn, () => dailyDone() || !daily());

  // (c) Loading — skeleton while lobby fetch is in flight.
  const loadingCard = h("div", { class: "lb-lobby-skel", "aria-hidden": "true" });
  bindHidden(loadingCard, () => dailyDone() || !!daily());

  const dailyCard = h("section", {
    class: "lb-daily",
    "aria-label": "Today's puzzle",
    "data-bn-region": "daily",
  },
    h("p", { class: "lb-daily-label" }, "Today's puzzle"),
    doneCard,
    dailyBtn,
    loadingCard,
    nextHint,
  );

  /* Floating "submit a phrase" CTA. */
  const fab = h("button", {
    class: "lb-fab",
    type: "button",
    "data-bn-action": "lobby-submit",
    "aria-label": "Submit a phrase",
    onClick: onSubmit,
  }, "+ SUBMIT A PHRASE");

  return h("main", {
    "aria-labelledby": "lobby-title",
    "data-bn-view": "lobby",
  },
    h("header", null,
      h("h1", { id: "lobby-title", class: "sr-only" }, "Tabs — daily puzzle"),
      h("p", { class: "lb-sticky lb-sticky-narrow" },
        "One subject. One phrase.", h("br"), "No mercy.",
      ),
      h("p", { class: "lb-tagline" }, "Daily puzzle"),
    ),
    statsSection,
    errorEl,
    dailyCard,
    fab,
  );
}
