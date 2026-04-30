/* Auth modal — native <dialog> with semantic <form> markup. Fully
   attribute-driven: form/field/input/hint visuals come from
   [data-bn-region="form|field|input|hint|error"]; the title accent
   from [data-bn-region="title"][data-tone="auth"]; buttons from
   [data-bn-button="primary|secondary"]. */

import { signal, effect } from "@basenative/runtime";
import { h } from "../lib/dom.js";
import { isPasskeySupported, registerPasskey, loginPasskey, devLogin } from "../lib/auth.js";
import { isDev } from "../lib/game.js";

export function createAuthModal({ open, onClose, onAuthed }) {
  const tab    = signal("login");
  const handle = signal("");
  const busy   = signal(false);
  const err    = signal(null);
  const passkey = isPasskeySupported();

  async function doIt(fn) {
    busy.set(true); err.set(null);
    try {
      const me = await fn(handle.peek().trim().toLowerCase());
      if (me?.user) onAuthed(me.user);
      else err.set("auth-failed");
    } catch (e) {
      err.set(String(e.message || e));
    } finally {
      busy.set(false);
    }
  }

  const handleInput = h("input", {
    id: "lb-auth-handle",
    name: "handle",
    "data-bn-region": "input",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: "false",
    autocomplete: "username",
    placeholder: "2–24 chars · letters, numbers, _ -",
    onInput: (e) => handle.set(e.target.value),
  });

  const errBox = h("p", {
    "data-bn-region": "error",
    role: "alert",
    text: () => err() || "",
    hidden: () => !err(),
  });

  /* Auth tabs — semantic <menu role="tablist"> styled via that selector
     pair under dialog. The `aria-selected="true"` attribute marks the
     active tab; CSS targets [role="tab"][aria-selected="true"] so we
     don't need a parallel `.on` class. */
  const tabsMenu = h("menu", { role: "tablist" },
    h("li", { role: "presentation" },
      h("button", {
        type: "button",
        role: "tab",
        "aria-selected": () => tab() === "login" ? "true" : "false",
        onClick: () => tab.set("login"),
      }, "LOG IN"),
    ),
    h("li", { role: "presentation" },
      h("button", {
        type: "button",
        role: "tab",
        "aria-selected": () => tab() === "register" ? "true" : "false",
        onClick: () => tab.set("register"),
      }, "NEW HANDLE"),
    ),
  );

  const passkeyBtn = h("button", {
    type: "submit",
    "data-bn-button": "primary",
    disabled: () => busy() || !handle(),
    text: () => busy() ? "…" : tab() === "login" ? "USE PASSKEY" : "CREATE PASSKEY",
  });

  const noPasskeyHint = h("p", { "data-bn-region": "hint" }, "This browser doesn't support passkeys.");

  const devBtn = h("button", {
    type: "button",
    "data-bn-button": "secondary",
    disabled: () => busy() || !handle(),
    onClick: () => doIt(devLogin),
  }, "DEV LOGIN (no passkey)");

  const form = h("form", {
    "data-bn-region": "form",
    onSubmit: (e) => {
      e.preventDefault();
      if (passkey && !busy() && handle()) {
        doIt(tab.peek() === "login" ? loginPasskey : registerPasskey);
      }
    },
  },
    h("p", { "data-bn-region": "field" },
      h("label", { for: "lb-auth-handle" }, "Handle"),
      handleInput,
      h("small", { "data-bn-region": "hint" }, "Public attribution on your puzzles."),
    ),
    errBox,
    passkey ? passkeyBtn : noPasskeyHint,
  );

  const dlg = h("dialog", {
    "aria-labelledby": "lb-auth-title",
    onClose,
    onClick: (e) => { if (e.target === dlg) onClose(); },
  },
    h("article", { onClick: (e) => e.stopPropagation() },
      h("header", null,
        h("h2", { id: "lb-auth-title", "data-bn-region": "title", "data-tone": "auth" }, "SIGN IN"),
        h("p", { "data-bn-region": "subtitle" }, "Anonymous play · login only to submit"),
      ),
      tabsMenu,
      form,
      isDev() ? devBtn : null,
      h("button", { type: "button", "data-bn-button": "secondary", onClick: onClose }, "Cancel"),
    ),
  );

  let lastOpen = false;
  effect(() => {
    const isOpen = open();
    if (isOpen && !lastOpen) {
      handle.set(""); err.set(null); busy.set(false); tab.set("login");
    }
    if (isOpen && !dlg.open) dlg.showModal();
    else if (!isOpen && dlg.open) dlg.close();
    lastOpen = isOpen;
  });

  return dlg;
}
