/* Tiny imperative DOM helpers that lean on @basenative/runtime signals.
   Axioms: semantic HTML, zero inline style (via class= only), hosts pass through. */

import { effect } from "@basenative/runtime";

/**
 * h(tag, props, ...children) — like createElement, but plain DOM.
 * Special props:
 *   - class: string | () => string                (reactive when fn)
 *   - text:  string | () => string                (reactive when fn — sets textContent)
 *   - hidden: () => boolean                       (reactive — toggles `is-hidden` class)
 *   - data-*, aria-*, id, name, type, role, etc.: passed through
 *   - on*: event listener (e.g. onClick, onInput)
 *   - bind: ref => callback receiving the element after mount
 */
export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class" || k === "className") {
        if (typeof v === "function") effect(() => { el.className = v(); });
        else el.className = v;
      } else if (k === "text") {
        if (typeof v === "function") effect(() => { el.textContent = v(); });
        else el.textContent = v;
      } else if (k === "hidden") {
        // Reactive show/hide via class so we don't violate the no-inline-style axiom.
        if (typeof v === "function") effect(() => { el.classList.toggle("is-hidden", !!v()); });
        else el.classList.toggle("is-hidden", !!v);
      } else if (k === "html") {
        if (typeof v === "function") effect(() => { el.innerHTML = v(); });
        else el.innerHTML = v;
      } else if (k === "value") {
        if (typeof v === "function") effect(() => { el.value = v(); });
        else el.value = v;
      } else if (k === "checked") {
        if (typeof v === "function") effect(() => { el.checked = v(); });
        else el.checked = v;
      } else if (k === "disabled") {
        if (typeof v === "function") effect(() => { el.disabled = !!v(); });
        else if (v) el.disabled = true;
      } else if (k === "bind" && typeof v === "function") {
        v(el);
      } else if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k.startsWith("attr:")) {
        // attr:foo lets us pass attribute names that don't map to props 1:1
        const name = k.slice(5);
        if (typeof v === "function") effect(() => {
          const r = v();
          if (r === false || r == null) el.removeAttribute(name);
          else el.setAttribute(name, r);
        });
        else el.setAttribute(name, v);
      } else {
        if (typeof v === "function") effect(() => {
          const r = v();
          if (r === false || r == null) el.removeAttribute(k);
          else el.setAttribute(k, r);
        });
        else el.setAttribute(k, v);
      }
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === "string" || typeof child === "number") {
      el.append(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      el.append(child);
    } else if (typeof child === "function") {
      // A child that is a function becomes a reactive text node — useful for
      // small inline expressions where you don't want to wrap in a span.
      const t = document.createTextNode("");
      effect(() => { t.nodeValue = child(); });
      el.append(t);
    }
  }
  return el;
}

/**
 * Mount a callback that re-runs whenever a signal changes, replacing the
 * children of `host`. Used for list-shaped reactive content (lobby items,
 * tile rows, etc.) where `effect` + `replaceChildren` is cheaper than a full
 * keyed-diff implementation.
 */
export function reactiveList(host, fn) {
  effect(() => {
    const children = fn();
    host.replaceChildren(...children.filter(Boolean));
  });
}

/** Replace a host's contents once. */
export function mount(host, ...nodes) {
  host.replaceChildren(...nodes.flat().filter(Boolean));
}

/**
 * Parse a trusted HTML string (e.g. from a @basenative/components
 * renderX() call) into a single real DOM element, so it can be mounted
 * and wired up with addEventListener alongside the rest of an h()-built
 * tree. Uses a <template> so the parser doesn't apply the usual
 * context-element rules (e.g. a bare <tr> string getting dropped
 * outside a <table>) — <template>.innerHTML always parses as if it
 * were document fragment content.
 */
export function fromHTML(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return /** @type {HTMLElement} */ (tpl.content.firstElementChild);
}

/** Quick className builder: cn("a", cond && "b", { c: true }) → "a b c". */
export function cn(...parts) {
  const out = [];
  for (const p of parts) {
    if (!p) continue;
    if (typeof p === "string") out.push(p);
    else if (typeof p === "object") {
      for (const [k, v] of Object.entries(p)) if (v) out.push(k);
    }
  }
  return out.join(" ");
}
