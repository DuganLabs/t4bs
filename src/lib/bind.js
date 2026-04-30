/* BaseNative-flavored signal-to-DOM binding helpers.
   Same shape as PendingBusiness's lib/bind.ts: attach effects to existing
   DOM nodes by id or element ref so views can be expressed as
   "signals in, DOM mutations out" without juggling `effect` + manual
   property assignments at every call site.

   These complement the imperative `h()` builder in dom.js: the builder
   composes the semantic structure once, and these helpers keep it in
   sync with signals after mount. */

import { effect } from "@basenative/runtime";

/** @typedef {{ (): unknown } | { (): unknown, set: (v: unknown) => void, peek: () => unknown }} Signal */
/** @template T @typedef {(() => T) | { (): T }} Readable */

function read(source) {
  return source();
}

function resolve(idOrEl) {
  if (idOrEl == null) return null;
  if (typeof idOrEl !== "string") return idOrEl;
  return document.getElementById(idOrEl);
}

/** Bind a signal/computed to an element's textContent. */
export function bindText(idOrEl, source) {
  const el = resolve(idOrEl);
  if (!el) return;
  effect(() => { el.textContent = String(read(source) ?? ""); });
}

/** Bind a signal/computed to an attribute. null/undefined → removeAttribute. */
export function bindAttr(idOrEl, attr, source) {
  const el = resolve(idOrEl);
  if (!el) return;
  effect(() => {
    const v = read(source);
    if (v == null || v === false) el.removeAttribute(attr);
    else el.setAttribute(attr, v === true ? "" : String(v));
  });
}

/** Toggle a class based on a boolean signal. */
export function bindClass(idOrEl, className, source) {
  const el = resolve(idOrEl);
  if (!el) return;
  effect(() => { el.classList.toggle(className, !!read(source)); });
}

/** Bind the full className string. */
export function bindClassName(idOrEl, source) {
  const el = resolve(idOrEl);
  if (!el) return;
  effect(() => { el.className = String(read(source) ?? ""); });
}

/* Toggle visibility. Sets both the `hidden` attribute (for assistive
   tech + the no-JS HTML semantic) AND an `is-hidden` class (which
   carries `display: none !important` in styles.css — needed to win
   against rules with explicit `display:` (e.g. the lobby stats row's
   `display: flex`) that would otherwise defeat the UA `[hidden]` style). */
export function bindHidden(idOrEl, source) {
  const el = resolve(idOrEl);
  if (!el) return;
  effect(() => {
    const off = !!read(source);
    el.classList.toggle("is-hidden", off);
    if (off) el.setAttribute("hidden", "");
    else el.removeAttribute("hidden");
  });
}

/** Mirror a boolean signal to a form control's `disabled`. */
export function bindDisabled(idOrEl, source) {
  const el = resolve(idOrEl);
  if (!el) return;
  effect(() => { el.disabled = !!read(source); });
}

/**
 * Render a list signal into a container's children. Bulk replaceChildren
 * on every change — same approach as PB's bindList.
 */
export function bindList(idOrEl, source, render, empty) {
  const el = resolve(idOrEl);
  if (!el) return;
  effect(() => {
    const items = read(source);
    if (!items || items.length === 0) {
      el.replaceChildren(empty ? empty() : document.createComment("empty"));
      return;
    }
    el.replaceChildren(...items.map((item, i) => render(item, i)));
  });
}
