/* LOBBY view — daily-only mode.

   One puzzle per day, Wordle-style. Shows today's daily puzzle as the
   only play target, OR a "come back tomorrow" card with the player's
   last result if they've already finished today's daily. Submission
   FAB is preserved so users can still contribute new puzzles.

   Markup is attribute-driven: lobby-specific classes have been replaced
   with semantic elements + data-bn-region / data-bn-action selectors,
   matching the play.js refactor in #56. Styling lives in styles.css
   under main[data-bn-view="lobby"]. */

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
    "aria-label": "Personal stats",
    "data-bn-region": "stats",
  },
    h("p", { "data-bn-region": "stat" }, winsB,   h("small", null, "WINS")),
    h("p", { "data-bn-region": "stat" }, bestB,   h("small", null, "BEST")),
    h("p", { "data-bn-region": "stat" }, streakB, h("small", null, "STREAK")),
  );
  bindHidden(statsSection, () => !hasStats());

  /* Error — single status paragraph, hidden by default. Styled by
     main[data-bn-view="lobby"] [data-bn-region="error"] in styles.css. */
  const errorEl = h("p", {
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
  const doneResult = h("p", { "data-bn-region": "daily-result" });
  const doneScore  = h("p", { "data-bn-region": "daily-score" });
  const doneCat    = h("p", { "data-bn-region": "daily-cat" });
  bindText(doneResult, () => stats()?.lastResult === "won" ? "Solved" : "Busted");
  bindText(doneScore,  () => `${stats()?.lastScore || 0} pts`);
  bindText(doneCat,    () => stats()?.lastCategory || "");
  const doneCard = h("div", { "data-bn-region": "daily-done" }, doneResult, doneScore, doneCat);
  const nextHint = h("p", { "data-bn-region": "daily-next" }, "Come back tomorrow for a new puzzle");
  bindHidden(doneCard, () => !dailyDone());
  bindHidden(nextHint, () => !dailyDone());

  // (b) Active — today's daily play button.
  const dailyCat = h("strong");
  const dailyBy  = h("small");
  bindText(dailyCat, () => daily()?.group?.category || "");
  bindText(dailyBy,  () => daily() ? `by ${daily().puzzle.submittedBy}` : "");
  const dailyBtn = h("button", {
    type: "button",
    "data-bn-action": "lobby-pick",
    "data-bn-variant": "daily",
    onClick: () => { const d = daily(); if (d) onPick(d.puzzle.id); },
  },
    h("span", { class: "sr-only" }, "Play today's puzzle: "),
    dailyCat,
    dailyBy,
  );
  bindHidden(dailyBtn, () => dailyDone() || !daily());

  // (c) Loading — skeleton while lobby fetch is in flight.
  const loadingCard = h("div", { "data-bn-region": "daily-loading", "aria-hidden": "true" });
  bindHidden(loadingCard, () => dailyDone() || !!daily());

  const dailyCard = h("section", {
    "aria-label": "Today's puzzle",
    "data-bn-region": "daily",
  },
    h("p", { "data-bn-region": "daily-label" }, "Today's puzzle"),
    doneCard,
    dailyBtn,
    loadingCard,
    nextHint,
  );

  /* Floating "submit a phrase" CTA. The styling for this button is
     driven entirely by [data-bn-action="lobby-submit"] in styles.css
     (already in place from #54), so no class is needed. */
  const fab = h("button", {
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
      h("p", { "data-bn-region": "sticky", "data-bn-variant": "narrow" },
        "One subject. One phrase.", h("br"), "No mercy.",
      ),
      h("p", { "data-bn-region": "tagline" }, "Daily puzzle"),
    ),
    statsSection,
    errorEl,
    dailyCard,
    fab,
  );
}
