/* Single-file component: page header.
   Renders the T4BS logo + (game stats | user controls) depending on view.
   Inputs are signals so the same header re-renders reactively across screens.
   Markup is element + data-bn-* driven; styles live in styles.css under
   selectors keyed off [data-bn-region="app-header"]. */

import { h } from "../lib/dom.js";

export function createHeader({
  view,         // signal<string>
  user,         // signal<object | null>
  score,        // signal<number>
  lives,        // signal<number>
  tokens,       // signal<number>
  onLogo,
  onHelp,
  onAuth,
  onMod,
  onAdmin,
  onLogout,
}) {
  /* axe `label-content-name-mismatch` — when a control has visible
     text, its accessible name must contain that text. The old
     aria-label="Back to lobby" overrode the visible "T4BS" entirely
     (Lighthouse a11y regression). Now the accessible name is
     "T4BS — back to lobby" via visible text + sr-only suffix. */
  const logo = h("button", {
    "data-bn-logo": "",
    type: "button",
    onClick: onLogo,
  },
    h("span", { "data-bn-logo-mark": "", "aria-hidden": "true" },
      // Mini Tabs mark — T + accent dot
      svgMark(),
    ),
    "T4BS",
    h("span", { class: "sr-only" }, " — back to lobby"),
  );

  const right = h("div", { "data-bn-region": "header-right" });

  // Playing-mode stats — `<output>` carries an implicit role="status".
  const tokenChip = h("output", {
    "data-bn-stat": "tokens",
    hidden: () => !(view() === "playing" && tokens() > 0),
    text: () => `⚡ ${tokens()}`,
  });

  const scoreChip = h("output", {
    "data-bn-stat": "score",
    "aria-live": "polite",
    hidden: () => view() !== "playing",
  },
    h("span", { "data-bn-stat-value": "score", text: () => String(score()) }),
    " pts",
  );

  const livesEl = h("output", {
    "data-bn-stat": "lives",
    "aria-live": "polite",
    "aria-label": () => `${lives()} of 4 lives remaining`,
    hidden: () => view() !== "playing",
  });
  // Render four life dots that toggle "dead" reactively.
  for (let i = 0; i < 4; i++) {
    livesEl.append(h("span", {
      "data-bn-life": "",
      "data-state": () => i >= lives() ? "dead" : "alive",
      "aria-hidden": "true",
    }));
  }

  // Off-game user controls (lobby / submit / mod / admin)
  const uctrl = h("div", {
    "data-bn-region": "user-controls",
    hidden: () => view() === "playing",
  });
  const helpBtn = h("button", {
    "data-bn-chip": "",
    type: "button",
    onClick: onHelp,
    "aria-label": "How to play",
  }, "?");
  const userHandle = h("span", {
    "data-bn-handle": "",
    text: () => user()?.handle || "",
    hidden: () => !user(),
  });
  const modBtn = h("button", {
    "data-bn-chip": "",
    type: "button",
    onClick: onMod,
    hidden: () => !(user()?.isModerator || user()?.isAdmin),
  }, "MOD");
  const adminBtn = h("button", {
    "data-bn-chip": "",
    type: "button",
    onClick: onAdmin,
    hidden: () => !user()?.isAdmin,
  }, "ADM");
  const outBtn = h("button", {
    "data-bn-chip": "",
    type: "button",
    onClick: onLogout,
    hidden: () => !user(),
  }, "OUT");
  const inBtn = h("button", {
    "data-bn-chip": "primary",
    type: "button",
    onClick: onAuth,
    hidden: () => !!user(),
  }, "LOG IN");
  uctrl.append(helpBtn, userHandle, modBtn, adminBtn, outBtn, inBtn);

  right.append(tokenChip, scoreChip, livesEl, uctrl);

  return h("header", { "data-bn-region": "app-header" }, logo, right);
}

function svgMark() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "13");
  svg.setAttribute("height", "13");
  svg.setAttribute("viewBox", "0 0 14 14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M2.5 3.5h7M6 3.5v8");
  path.setAttribute("stroke", "#1A0A00");
  path.setAttribute("stroke-width", "1.6");
  path.setAttribute("stroke-linecap", "round");
  const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  c.setAttribute("cx", "10.5");
  c.setAttribute("cy", "10");
  c.setAttribute("r", "1.4");
  c.setAttribute("fill", "#1A0A00");
  svg.append(path, c);
  return svg;
}
