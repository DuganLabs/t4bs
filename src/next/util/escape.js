/* HTML escape helpers for SSR template literals.
   `esc` is for attribute / text content; `escJson` for inline <script> JSON
   payloads — closes the </script> sneak attack and escapes line separators
   that JSON.stringify leaves intact (U+2028 / U+2029 break legacy parsers). */

/** @param {unknown} value */
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const LINE_SEP_RE  = new RegExp("\\u2028", "g");
const PARA_SEP_RE  = new RegExp("\\u2029", "g");

/** @param {unknown} value */
export function escJson(value) {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LINE_SEP_RE, "\\u2028")
    .replace(PARA_SEP_RE, "\\u2029");
}

/** Joins parts, dropping `false`/`null`/`undefined` so views can use ternary
    expressions inline without sprinkling `|| ""` everywhere. */
export function join(...parts) {
  let out = "";
  for (const p of parts.flat(Infinity)) {
    if (p === false || p == null) continue;
    out += p;
  }
  return out;
}
