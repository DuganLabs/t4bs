/* Auth modal — native <dialog> with semantic <form> markup. */

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
    class: "lb-finput",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: "false",
    autocomplete: "username",
    placeholder: "2–24 chars · letters, numbers, _ -",
    onInput: (e) => handle.set(e.target.value),
  });

  const errBox = h("p", {
    class: "lb-ferror",
    role: "alert",
    text: () => err() || "",
    hidden: () => !err(),
  });

  const tabsMenu = h("menu", { class: "lb-tabs", role: "tablist" },
    h("li", { role: "presentation" },
      h("button", {
        type: "button",
        role: "tab",
        class: () => tab() === "login" ? "on" : "",
        "aria-selected": () => tab() === "login" ? "true" : "false",
        onClick: () => tab.set("login"),
      }, "LOG IN"),
    ),
    h("li", { role: "presentation" },
      h("button", {
        type: "button",
        role: "tab",
        class: () => tab() === "register" ? "on" : "",
        "aria-selected": () => tab() === "register" ? "true" : "false",
        onClick: () => tab.set("register"),
      }, "NEW HANDLE"),
    ),
  );

  const passkeyBtn = h("button", {
    class: "lb-btn lb-bp",
    type: "submit",
    disabled: () => busy() || !handle(),
    text: () => busy() ? "…" : tab() === "login" ? "USE PASSKEY" : "CREATE PASSKEY",
  });

  const noPasskeyHint = h("p", { class: "lb-fhint" }, "This browser doesn't support passkeys.");

  const devBtn = h("button", {
    class: "lb-btn lb-bs",
    type: "button",
    disabled: () => busy() || !handle(),
    onClick: () => doIt(devLogin),
  }, "DEV LOGIN (no passkey)");

  const form = h("form", {
    class: "lb-form",
    onSubmit: (e) => {
      e.preventDefault();
      if (passkey && !busy() && handle()) {
        doIt(tab.peek() === "login" ? loginPasskey : registerPasskey);
      }
    },
  },
    h("p", { class: "lb-field" },
      h("label", { class: "lb-flabel", for: "lb-auth-handle" }, "Handle"),
      handleInput,
      h("small", { class: "lb-fhint" }, "Public attribution on your puzzles."),
    ),
    errBox,
    passkey ? passkeyBtn : noPasskeyHint,
  );

  const dlg = h("dialog", {
    "aria-labelledby": "lb-auth-title",
    onClose,
    onClick: (e) => { if (e.target === dlg) onClose(); },
  },
    h("article", { class: "lb-card", onClick: (e) => e.stopPropagation() },
      h("header", null,
        h("h2", { id: "lb-auth-title", class: "lb-ct auth" }, "SIGN IN"),
        h("p", { class: "lb-cs" }, "Anonymous play · login only to submit"),
      ),
      tabsMenu,
      form,
      isDev() ? devBtn : null,
      h("button", { class: "lb-btn lb-bs", type: "button", onClick: onClose }, "Cancel"),
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
