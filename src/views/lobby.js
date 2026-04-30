/* Single-file component: LOBBY view.
   Pulls /api/puzzles, groups by category, lets the player tap into a round.
   Shows personal stats from @basenative/persist (formerly src/lib/persist.js). */

import { computed, effect } from "@basenative/runtime";
import { h, reactiveList } from "../lib/dom.js";
import { groupLobby } from "../lib/game.js";

export function createLobby({
  lobby,        // signal<array | null>
  stats,        // signal<object>
  error,        // signal<string | null>
  user,         // signal<object | null>
  onPick,       // (puzzleId) => void
  onSubmit,     // () => void  (opens submit view or auth modal)
}) {
  const groups = computed(() => groupLobby(lobby()));

  const errorRow = h("p", {
    "data-bn-dialog-credit": "",
    "data-state": "error",
    role: "alert",
    text: () => `error: ${error() || ""}`,
    hidden: () => !error(),
  });

  const statsRow = h("div", {
    class: "lb-stats",
    "aria-label": "Personal stats",
    hidden: () => !(stats()?.played > 0),
  });
  effect(() => {
    const s = stats() || {};
    statsRow.replaceChildren(
      h("span", { class: "lb-stat" },
        h("b", { text: () => String(s.wins || 0) }),
        h("span", null, "WINS"),
      ),
      h("span", { class: "lb-stat" },
        h("b", { text: () => String(s.best || 0) }),
        h("span", null, "BEST"),
      ),
      h("span", { class: "lb-stat" },
        h("b", { text: () => s.streak > 0 ? `🔥${s.streak}` : "—" }),
        h("span", null, "STREAK"),
      ),
    );
  });

  const list = h("ul", { class: "lb-lobby", "aria-label": "Available puzzles" });
  reactiveList(list, () => {
    const g = groups();
    if (!g) {
      // Skeleton — six placeholder rows
      return Array.from({ length: 6 }).map(() =>
        h("li", null, h("div", { class: "lb-lobby-skel", "aria-hidden": "true" }))
      );
    }
    return g.map(group => {
      const credit = group.puzzles.length === 1
        ? `by ${group.puzzles[0].submittedBy}`
        : `${group.puzzles.length} puzzles`;
      /* axe `label-content-name-mismatch`: previously aria-label
         overrode the visible category + credit text. Now the
         accessible name is built from the visible text plus a
         sr-only "Play " prefix, so it matches what the user sees. */
      return h("li", null,
        h("button", {
          type: "button",
          class: "lb-lobby-item",
          onClick: () => {
            const pick = group.puzzles[Math.floor(Math.random() * group.puzzles.length)];
            onPick(pick.id);
          },
        },
          h("span", { class: "sr-only" }, "Play "),
          h("span", { class: "lb-lobby-cat" }, group.category),
          h("span", { class: "lb-lobby-by" }, credit),
        ),
      );
    });
  });

  const fab = h("button", {
    class: "lb-fab",
    type: "button",
    "aria-label": "Submit a phrase",
    onClick: onSubmit,
  }, "+ SUBMIT A PHRASE");

  // Surface user state to suppress unused-var warnings; FAB handler reads
  // current user via the consumer's onSubmit; we accept the signal for
  // future reactivity (e.g. a "sign in to submit" hint).
  void user;

  return h("main", { "aria-labelledby": "lb-page-title" },
    h("h1", { id: "lb-page-title", class: "sr-only" }, "T4BS — pick a round"),
    h("div", { class: "lb-sticky lb-sticky-narrow" },
      "One subject. One phrase.",
      h("br"),
      "No mercy."
    ),
    h("div", { class: "lb-tagline" }, "Pick a round"),
    statsRow,
    errorRow,
    list,
    fab,
  );
}
