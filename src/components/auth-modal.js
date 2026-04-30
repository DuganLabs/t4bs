/* Single-file component: passkey sign-in modal.
   Wires @basenative/auth-webauthn/client via the existing src/lib/auth.js helpers. */

import { signal, effect } from "@basenative/runtime";
import { h } from "../lib/dom.js";
import { trapFocus } from "../lib/focus-trap.js";
import { isPasskeySupported, registerPasskey, loginPasskey, devLogin } from "../lib/auth.js";
import { isDev } from "../lib/game.js";

export function createAuthModal({ open, onClose, onAuthed }) {
  const tab    = signal("login"); // 'login' | 'register'
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
    class: "lb-finput",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: "false",
    autocomplete: "username",
    placeholder: "2–24 chars · letters, numbers, _ -",
    onInput: (e) => handle.set(e.target.value),
  });

  const errBox = h("div", {
    class: "lb-ferror",
    text: () => err() || "",
    hidden: () => !err(),
  });

  const tabsEl = h("div", { class: "lb-tabs" },
    h("button", {
      type: "button",
      class: () => tab() === "login" ? "on" : "",
      onClick: () => tab.set("login"),
    }, "LOG IN"),
    h("button", {
      type: "button",
      class: () => tab() === "register" ? "on" : "",
      onClick: () => tab.set("register"),
    }, "NEW HANDLE"),
  );

  const passkeyBtn = h("button", {
    "data-bn-button": "primary",
    type: "button",
    disabled: () => busy() || !handle(),
    text: () => busy() ? "…" : tab() === "login" ? "USE PASSKEY" : "CREATE PASSKEY",
    onClick: () => doIt(tab.peek() === "login" ? loginPasskey : registerPasskey),
  });

  const noPasskeyHint = h("div", { class: "lb-fhint" },
    "This browser doesn't support passkeys.");

  const devBtn = h("button", {
    "data-bn-button": "secondary",
    type: "button",
    disabled: () => busy() || !handle(),
    onClick: () => doIt(devLogin),
  }, "DEV LOGIN (no passkey)");

  const card = h("div", {
    "data-bn-dialog": "auth",
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "bn-auth-title",
    onClick: (e) => e.stopPropagation(),
  },
    h("h2", { "data-bn-dialog-title": "", "data-tone": "auth", id: "bn-auth-title" }, "SIGN IN"),
    h("p", { "data-bn-dialog-sub": "" }, "Anonymous play · login only to submit"),
    tabsEl,
    h("div", { class: "lb-form" },
      h("div", { class: "lb-field" },
        h("label", { class: "lb-flabel", for: "lb-auth-handle" }, "Handle"),
        handleInput,
        h("span", { class: "lb-fhint" }, "Public attribution on your puzzles."),
      ),
      errBox,
    ),
    passkey ? passkeyBtn : noPasskeyHint,
    isDev() ? devBtn : null,
    h("button", { "data-bn-button": "secondary", type: "button", onClick: onClose }, "Cancel"),
  );

  const overlay = h("div", {
    "data-bn-overlay": "",
    onClick: onClose,
    hidden: () => !open(),
  }, card);

  trapFocus(overlay, open, onClose);

  // Reset state each time the modal opens so stale errors don't linger.
  let lastOpen = false;
  effect(() => {
    const isOpen = open();
    if (isOpen && !lastOpen) {
      handle.set(""); err.set(null); busy.set(false); tab.set("login");
    }
    lastOpen = isOpen;
  });

  return overlay;
}
