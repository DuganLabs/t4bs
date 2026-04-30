/* Page header — emits the same semantic shape as src/bn/views/header.js
   (SSR template). Score / lives / tokens use <output> (matches SSR);
   user controls live in a real <ul role="list"> with <li> rows. */

import { h } from "../lib/dom.js";

export function createHeader({
  view,
  user,
  score,
  lives,
  tokens,
  onLogo,
  onHelp,
  onAuth,
  onMod,
  onAdmin,
  onLogout,
}) {
  /* axe `label-content-name-mismatch` — when a control has visible
     text, its accessible name must contain that text. The accessible
     name is "T4BS — back to lobby" via visible text + sr-only suffix. */
  const logo = h("a", {
    href: "/",
    "data-bn-action": "logo",
    onClick: (e) => { e.preventDefault(); onLogo(); },
  },
    h("strong", null, "T", h("em", null, "4"), "BS"),
    h("span", { class: "sr-only" }, " — back to lobby"),
  );

  // Playing-mode stats — <output> matches the SSR <output aria-label="Score"> shape
  const tokenOut = h("output", {
    "aria-label": "Tokens",
    text: () => `⚡ ${tokens()}`,
    hidden: () => !(view() === "playing" && tokens() > 0),
  });
  const scoreOut = h("output", {
    "aria-label": "Score",
    text: () => `${score()} pts`,
    hidden: () => view() !== "playing",
  });
  const livesOut = h("output", {
    "aria-label": () => `${lives()} of 4 lives remaining`,
    text: () => "♥".repeat(Math.max(0, lives())) || "—",
    hidden: () => view() !== "playing",
  });

  // Off-game user controls — match the SSR <ul role="list"><li>… shape
  const helpItem = h("li", null,
    h("button", {
      type: "button",
      "data-bn-action": "help",
      "aria-label": "How to play",
      onClick: onHelp,
    }, "?"),
  );
  const modItem = h("li", { hidden: () => !(user()?.isModerator || user()?.isAdmin) },
    h("a", { href: "/moderate", onClick: (e) => { e.preventDefault(); onMod(); } }, "MOD"),
  );
  const adminItem = h("li", { hidden: () => !user()?.isAdmin },
    h("a", { href: "/admin", onClick: (e) => { e.preventDefault(); onAdmin(); } }, "ADM"),
  );
  const accountItem = h("li", { hidden: () => !user() },
    h("button", {
      type: "button",
      "data-bn-action": "account",
      onClick: onLogout,
    },
      () => user()?.handle || "",
      h("span", { class: "sr-only" }, " — sign out"),
    ),
  );
  const authItem = h("li", { hidden: () => !!user() },
    h("button", {
      type: "button",
      "data-bn-action": "auth",
      onClick: onAuth,
    }, "Sign in"),
  );
  const menu = h("ul", { role: "list" }, helpItem, modItem, adminItem, accountItem, authItem);

  const nav = h("nav", { "aria-label": "Tabs primary" },
    logo,
    scoreOut,
    livesOut,
    tokenOut,
    menu,
  );

  return h("header", {
    role: "banner",
    "data-bn-region": "header",
  }, nav);
}
