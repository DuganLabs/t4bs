/* Tiny imperative DOM helpers that lean on @basenative/runtime signals.
   Axioms: semantic HTML, zero inline style (via class= only), hosts pass through. */

import { effect } from "@basenative/runtime";
import { renderAlert, renderButton, renderSkeleton, renderSpinner } from "@basenative/components";
import { escapeText } from "@basenative/runtime/shared/escape";

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

/**
 * Build a live @basenative/components button: render the package's
 * markup, parse it, and wire the click handler.
 *
 * The package ships `renderButton` as a pure string renderer, which is
 * the right shape for SSR but awkward in the imperative views — every
 * call site would otherwise repeat fromHTML() + addEventListener().
 * Wrapping it here is what let T4BS retire its own
 * [data-bn-button="primary|secondary"] vocabulary: one adapter, and the
 * variant/size/disabled semantics stay the package's.
 *
 * The label is escaped here rather than handed to renderButton's HTML
 * slot, so no caller can accidentally push a value into markup.
 * (components 0.8.0 adds a `text` option that does this in the package —
 * BaseNative#186, opened off the back of this work; this wrapper becomes
 * a one-line pass-through then.)
 *
 * @param {string} label  Plain text, escaped before it reaches the slot
 * @param {{ variant?: string, type?: string, attrs?: string, onClick?: (e: Event) => void }} [options]
 * @returns {HTMLButtonElement}
 */
export function bnButton(label, options = {}) {
  const { onClick, ...renderOptions } = options;
  const el = /** @type {HTMLButtonElement} */ (
    fromHTML(renderButton(escapeText(label), renderOptions))
  );
  if (onClick) el.addEventListener("click", onClick);
  return el;
}

/**
 * Build a live @basenative/components alert and hand back both the
 * container (for bindHidden) and its text slot (for bindText), so a
 * signal-driven message only ever reaches the DOM as textContent — the
 * package's HTML slot is left empty.
 *
 * No T4BS hook attribute is added: styling keys off the package's own
 * [data-bn="alert"] (see styles.css), which is also why this needs no
 * `attrs` slot — components 0.7.0's renderAlert() has none.
 *
 * @param {{ variant?: string }} [options]
 * @returns {{ el: HTMLElement, content: HTMLElement }}
 */
export function bnAlert(options = {}) {
  const el = /** @type {HTMLElement} */ (fromHTML(renderAlert("", options)));
  return { el, content: /** @type {HTMLElement} */ (el.querySelector('[data-bn="alert-content"]')) };
}

/**
 * A labelled waiting state: @basenative/components' spinner (which
 * already carries role="status" + the accessible name) next to the
 * visible label, wrapped in a [data-bn-region="pending"] <p> so
 * styles.css can place it without this file touching style.
 *
 * Used wherever the UI has to admit it is still fetching — the lazily
 * imported route chunks, and the auth check on a guarded deep link.
 * Both used to render a bare "Loading …" paragraph, which is why a slow
 * phone made the submit form look like it had simply lost its category
 * picker.
 *
 * @param {string} label
 * @returns {HTMLElement}
 */
export function bnPending(label) {
  const el = h("p", { "data-bn-region": "pending" });
  el.innerHTML = renderSpinner({ size: "sm", label });
  el.append(document.createTextNode(" "), h("span", null, label));
  return el;
}

/**
 * Placeholder blocks sized like the content that is about to replace
 * them, so a pending view reserves its own space instead of letting the
 * real thing shove the page around when it lands.
 *
 * @param {{ width?: string, height?: string, count?: number, variant?: string }} [options]
 * @returns {HTMLElement}
 */
export function bnSkeleton(options = {}) {
  const el = h("div", { "data-bn-region": "skeleton", "aria-hidden": "true" });
  el.innerHTML = renderSkeleton(options);
  return el;
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
