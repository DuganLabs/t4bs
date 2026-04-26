/* Single-file component: page header.
   Renders the T4BS logo + (game stats | user controls) depending on view.
   Inputs are signals so the same header re-renders reactively across screens. */

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
  const logo = h("button", {
    class: "lb-logo",
    type: "button",
    onClick: onLogo,
    "aria-label": "Back to lobby",
  },
    h("span", { class: "lb-logo-box", "aria-hidden": "true" },
      // Mini Tabs mark — T + accent dot
      svgMark(),
    ),
    "T4BS"
  );

  const right = h("div", { class: "lb-hd-r" });

  // Playing-mode stats
  const tokenChip = h("div", {
    class: "lb-tok",
    hidden: () => !(view() === "playing" && tokens() > 0),
  },
    h("span", { text: () => `⚡ ${tokens()}` })
  );

  const scoreChip = h("div", {
    class: "lb-score",
    hidden: () => view() !== "playing",
  },
    h("span", { class: "lb-snum", text: () => String(score()) }),
    " pts"
  );

  const livesEl = h("div", {
    class: "lb-lives",
    "aria-label": () => `${lives()} of 4 lives remaining`,
    hidden: () => view() !== "playing",
  });
  // Render four life dots that toggle "dead" reactively.
  for (let i = 0; i < 4; i++) {
    livesEl.append(h("div", {
      class: () => `lb-life${i >= lives() ? " dead" : ""}`,
      "aria-hidden": "true",
    }));
  }

  // Off-game user controls (lobby / submit / mod / admin)
  const uctrl = h("div", {
    class: "lb-uctrl",
    hidden: () => view() === "playing",
  });
  const helpBtn = h("button", {
    class: "lb-ubtn",
    type: "button",
    onClick: onHelp,
    "aria-label": "How to play",
  }, "?");
  const userHandle = h("span", {
    class: "lb-uhandle",
    text: () => user()?.handle || "",
    hidden: () => !user(),
  });
  const modBtn = h("button", {
    class: "lb-ubtn",
    type: "button",
    onClick: onMod,
    hidden: () => !(user()?.isModerator || user()?.isAdmin),
  }, "MOD");
  const adminBtn = h("button", {
    class: "lb-ubtn",
    type: "button",
    onClick: onAdmin,
    hidden: () => !user()?.isAdmin,
  }, "ADM");
  const outBtn = h("button", {
    class: "lb-ubtn",
    type: "button",
    onClick: onLogout,
    hidden: () => !user(),
  }, "OUT");
  const inBtn = h("button", {
    class: "lb-ubtn primary",
    type: "button",
    onClick: onAuth,
    hidden: () => !!user(),
  }, "LOG IN");
  uctrl.append(helpBtn, userHandle, modBtn, adminBtn, outBtn, inBtn);

  right.append(tokenChip, scoreChip, livesEl, uctrl);

  return h("header", { class: "lb-hd" }, logo, right);
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
