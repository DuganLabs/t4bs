/* LOBBY view — semantic mirror of src/bn/views/lobby.js (SSR).

   <main data-bn-view="lobby"> with <header>, <section data-bn-region="stats">,
   <section data-bn-region="list">, and a "submit" CTA. The shape matches the
   SSR template so crawlers and the SPA produce the same DOM. */

import { computed } from "@basenative/runtime";
import { h } from "../lib/dom.js";
import { bindHidden, bindList, bindText } from "../lib/bind.js";
import { groupLobby, dailyFromGroups } from "../lib/game.js";

export function createLobby({
  lobby,
  stats,
  error,
  user,
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

  /* Daily puzzle card — today's deterministic pick. Hidden until lobby
     loads. Built from static nodes + bindText so the structure mirrors
     statsSection rather than reaching for an `effect()` rebuild. */
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
  const dailyCard = h("section", {
    class: "lb-daily",
    "aria-label": "Today's puzzle",
    "data-bn-region": "daily",
  },
    h("p", { class: "lb-daily-label" }, "Today's puzzle"),
    dailyBtn,
  );
  bindHidden(dailyCard, () => !daily());

  /* Error — single status paragraph, hidden by default. */
  const errorEl = h("p", {
    class: "lb-cred lb-cred-error",
    role: "alert",
    "data-bn-region": "error",
  });
  bindText(errorEl, () => `error: ${error() || ""}`);
  bindHidden(errorEl, () => !error());

  /* Puzzle list — bindList over groups. */
  const list = h("ul", {
    class: "lb-lobby",
    role: "list",
    "aria-label": "Available puzzles",
    "data-bn-region": "list",
  });
  bindList(list, groups, (group) => {
    const d = daily();
    const isDaily = d?.group?.category === group.category;
    const credit = group.puzzles.length === 1
      ? `by ${group.puzzles[0].submittedBy}`
      : `${group.puzzles.length} puzzles`;
    return h("li", null,
      h("button", {
        type: "button",
        class: `lb-lobby-item${isDaily ? " lb-lobby-daily" : ""}`,
        "data-bn-action": "lobby-pick",
        "data-puzzle-ids": group.puzzles.map(p => p.id).join(","),
        onClick: () => {
          /* Deterministic daily pick for the featured category, random
             for everything else — keeps the daily reproducible across
             players while preserving variety in the rest of the list. */
          const pick = isDaily && d
            ? d.puzzle
            : group.puzzles[Math.floor(Math.random() * group.puzzles.length)];
          onPick(pick.id);
        },
      },
        h("span", { class: "sr-only" }, "Play "),
        h("strong", { class: "lb-lobby-cat" }, group.category),
        h("small", { class: "lb-lobby-by" }, credit),
      ),
    );
  }, () => {
    /* Skeleton — six placeholder rows while /api/puzzles is in flight. */
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 6; i++) {
      frag.append(h("li", null, h("div", { class: "lb-lobby-skel", "aria-hidden": "true" })));
    }
    return frag;
  });

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
      h("h1", { id: "lobby-title", class: "sr-only" }, "Tabs — pick a round"),
      h("p", { class: "lb-sticky lb-sticky-narrow" },
        "One subject. One phrase.", h("br"), "No mercy.",
      ),
      h("p", { class: "lb-tagline" }, "Pick a round"),
    ),
    statsSection,
    errorEl,
    dailyCard,
    h("section", { "aria-labelledby": "lobby-list-title" },
      h("h2", { id: "lobby-list-title", class: "sr-only" }, "Available puzzles"),
      list,
    ),
    fab,
  );
}
