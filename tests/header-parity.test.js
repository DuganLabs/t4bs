/* The header must occupy the same box before and after hydration.

   What went wrong, measured in Chromium at 390x844 against t4bs.com:

     - SSR paint        : header 362x48 at (14, 20)
     - after hydration  : header 334x48 at (28, 36)

   i.e. a 16px vertical and 28px horizontal jump on every single load.
   Cause: [data-bn-region="shell"] — the wrapper the client mounts
   INSIDE the SSR-rendered #app — restated #app's own
   `padding: max(safe-top,16px) 14px calc(40px + safe-bottom)`, so the
   whole page inset a second time the moment the SPA took over.

   And with /assets/*.css blocked (a slow or failed stylesheet, which is
   the case the inlined critical CSS exists to cover) the same header
   painted at 68px instead of 48px, because <style data-bn-critical>
   carried the header band but not the nav's ul/li/button rules: <li>
   fell back to list-item and the menu stacked vertically.

   node --test has no layout engine, so this file guards the two source
   invariants that make those numbers true, rather than re-measuring
   them:

     A. Every box-affecting header rule in styles.css is mirrored,
        value for value, in the critical inline block — so the
        pre-stylesheet paint and the final paint agree.
     B. The shell contributes no box of its own — #app owns the page
        box, and nothing may inset it twice.
     C. The SSR header template and the client header component emit the
        same styling hooks, so the same CSS rules apply to both. (This
        is the class of drift that previously left the lives counter
        styled by [aria-label="Lives"] SSR-side and unstyled once the
        client made that label reactive.)

   Re-measure with a real browser when touching the header; these are
   the cheap guards, not a substitute for looking. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

import { renderPage } from "../src/bn/server/render.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "..", p), "utf8");

const STYLES = read("src/styles.css");
const LAYOUT_SRC = read("src/bn/views/layout.js");
const SSR_HEADER_SRC = read("src/bn/views/header.js");
const CLIENT_HEADER_SRC = read("src/components/header.js");
const HYDRATE_SRC = read("src/bn/client/hydrate.js");
const MAIN_SRC = read("src/main.js");

/* ── A very small CSS reader ───────────────────────────────────────────
   Enough for these two sheets: rules, plus one level of @media. It is
   deliberately not a real parser — if either file grows nested at-rules
   or comments inside a declaration list, this should be replaced rather
   than patched. */

/** Strip /* … *\/ comments without touching anything inside strings we care about. */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** `a[href="/x"]` → `a[href=/x]`; collapse whitespace. Lets the minified
 *  inline block and the readable sheet compare equal. */
function normalizeSelector(sel) {
  return sel
    .replace(/\[\s*([\w-]+)\s*=\s*["']?([^\]"']*)["']?\s*\]/g, "[$1=$2]")
    .replace(/\s*([>+~])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeValue(value) {
  return value
    .replace(/\s*!\s*important/gi, " !important")
    .replace(/\s*,\s*/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} css
 * @returns {Map<string, Map<string, string>>} "<media>||<selector>" → prop → value
 */
function readRules(css) {
  const out = new Map();
  const src = stripComments(css);

  /** @param {string} body @param {string} media */
  function readBlock(body, media) {
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(body))) {
      const selectors = m[1].split(",").map(normalizeSelector).filter(Boolean);
      /** @type {Map<string,string>} */
      const decls = new Map();
      for (const part of m[2].split(";")) {
        const idx = part.indexOf(":");
        if (idx < 0) continue;
        const prop = part.slice(0, idx).trim().toLowerCase();
        if (!prop) continue;
        decls.set(prop, normalizeValue(part.slice(idx + 1)));
      }
      for (const sel of selectors) {
        const key = `${media}||${sel}`;
        const existing = out.get(key) || new Map();
        for (const [k, v] of decls) existing.set(k, v);
        out.set(key, existing);
      }
    }
  }

  // Pull @media blocks out first, then read what's left as the base layer.
  let rest = "";
  let i = 0;
  while (i < src.length) {
    const at = src.indexOf("@media", i);
    if (at < 0) { rest += src.slice(i); break; }
    rest += src.slice(i, at);
    // Walk braces to find this at-rule's extent.
    const open = src.indexOf("{", at);
    let depth = 0;
    let j = open;
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") { depth--; if (depth === 0) break; }
    }
    const query = normalizeValue(src.slice(at + 6, open).replace(/\s*:\s*/g, ":"));
    readBlock(src.slice(open + 1, j), query);
    i = j + 1;
  }
  readBlock(rest, "");
  return out;
}

/** The declarations that can move or resize a box. Colour, shadow and
 *  transition are free to differ between the two sheets. */
const BOX_PROPS = new Set([
  "display", "position", "box-sizing", "float",
  "width", "min-width", "max-width", "height", "min-height", "max-height",
  "inline-size", "min-inline-size", "block-size", "min-block-size",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "margin-block-start", "margin-inline-start",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border", "border-width", "border-top-width", "border-right-width",
  "border-bottom-width", "border-left-width", "border-style",
  "font", "font-size", "font-family", "line-height", "letter-spacing",
  "gap", "row-gap", "column-gap", "flex-wrap", "flex-shrink", "flex-grow",
  "flex-direction", "align-items", "justify-content", "flex",
  "text-align", "text-transform", "white-space", "text-overflow", "overflow",
  "list-style", "writing-mode", "top",
]);

/** Selectors whose box this test owns: the header shell and the
 *  visibility switch that decides whether its controls take up space. */
function isHeaderScoped(selector) {
  if (selector.includes(":hover") || selector.includes(":focus") || selector.includes(":active")) return false;
  return (
    selector.includes("header[data-bn-region=header]")
    || selector.includes("[data-bn-action=logo]")
    || selector === ".is-hidden"
  );
}

/** The <style data-bn-critical> block the SSR layout inlines into <head>. */
function criticalCss() {
  const m = LAYOUT_SRC.match(/<style data-bn-critical>([\s\S]*?)<\/style>/);
  assert.ok(m, "layout.js must inline a <style data-bn-critical> block");
  return m[1];
}

/* ── A. critical CSS is a complete copy of the header's box ─────────── */

describe("critical inline CSS covers the whole header box", () => {
  const sheet = readRules(STYLES);
  const critical = readRules(criticalCss());

  const headerRules = [...sheet].filter(([key]) => isHeaderScoped(key.split("||")[1]));

  it("finds header rules in styles.css to compare against", () => {
    assert.ok(headerRules.length >= 10, `only found ${headerRules.length} header rules — the scope predicate has gone stale`);
  });

  it("declares every box-affecting header rule the external sheet does", () => {
    /** @type {string[]} */
    const missing = [];
    for (const [key, decls] of headerRules) {
      for (const [prop, value] of decls) {
        if (!BOX_PROPS.has(prop)) continue;
        const inline = critical.get(key);
        const [media, selector] = key.split("||");
        const where = media ? `@media ${media} { ${selector} }` : selector;
        if (!inline) { missing.push(`${where} — rule absent, needs ${prop}: ${value}`); continue; }
        if (!inline.has(prop)) { missing.push(`${where} { ${prop}: ${value} } — property absent`); continue; }
        if (inline.get(prop) !== value) {
          missing.push(`${where} { ${prop} } — inline "${inline.get(prop)}" vs sheet "${value}"`);
        }
      }
    }
    assert.deepEqual(missing, [],
      "the inlined critical CSS must reproduce every box-affecting header rule, or the header "
      + "paints at one size before the stylesheet lands and another after — measured 68px vs 48px "
      + "at 390x844 when this drifted:\n  " + missing.join("\n  "));
  });

  it("carries the narrow-phone header overrides, not just the desktop ones", () => {
    const mq = [...critical.keys()].filter(k => k.startsWith("(max-width:420px)||"));
    assert.ok(mq.length > 0,
      "no (max-width:420px) block inline — every phone gets the desktop header metrics on first paint");
    assert.ok(
      mq.some(k => k.endsWith("||header[data-bn-region=header] li") || k.includes("header[data-bn-region=header] button")),
      "the phone override for the header's controls is missing from the inline block",
    );
  });
});

/* ── B. the shell adds no box of its own ────────────────────────────── */

describe("the hydrated shell does not restate #app's box", () => {
  const sheet = readRules(STYLES);

  /* #app is rendered by the SSR layout and already carries the page's
     padding, min-height and gradient. The shell is mounted INSIDE it, so
     anything additive it repeats is applied twice. */
  const ADDITIVE = [
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "margin", "margin-top", "margin-bottom",
    "border", "border-width", "min-height",
  ];

  const shellRules = [...sheet].filter(([key]) => key.split("||")[1].startsWith("[data-bn-region=shell]"));

  it("has a shell rule to check", () => {
    assert.ok(shellRules.length > 0, "no [data-bn-region=shell] rule found — has it been renamed?");
  });

  it("declares no padding, margin, border or min-height", () => {
    /** @type {string[]} */
    const offenders = [];
    for (const [key, decls] of shellRules) {
      for (const prop of ADDITIVE) {
        if (decls.has(prop)) offenders.push(`${key.split("||")[1]} { ${prop}: ${decls.get(prop)} }`);
      }
    }
    assert.deepEqual(offenders, [],
      "the shell is nested inside #app, which already supplies the page box — repeating any of these "
      + "insets the page a second time the instant hydration commits (measured: header 362x48 at (14,20) "
      + "before, 334x48 at (28,36) after):\n  " + offenders.join("\n  "));
  });

  it("keeps the play view's keyboard gutter on a single rule", () => {
    assert.match(STYLES, /body\[data-route="play"\] #app\s*\{[^}]*padding-bottom/,
      "body[data-route=\"play\"] #app must own the play gutter");
    for (const [name, src] of [["hydrate.js", HYDRATE_SRC], ["main.js", MAIN_SRC]]) {
      assert.match(src, /document\.body\.dataset\.route\s*=/,
        `${name} must keep <body data-route> in step with the router, or that single rule only works on the SSR paint`);
    }
  });
});

/* ── C. both header trees expose the same styling hooks ─────────────── */

/** Every data-bn-action / data-bn-role value a source emits, however quoted. */
function styleHooks(src) {
  /** @type {Set<string>} */
  const hooks = new Set();
  for (const m of src.matchAll(/["']?(data-bn-(?:action|role))["']?\s*[:=]\s*["']([^"']+)["']/g)) {
    hooks.add(`${m[1]}=${m[2]}`);
  }
  return hooks;
}

describe("SSR and client headers expose the same styling hooks", () => {
  const ssr = styleHooks(SSR_HEADER_SRC);
  const client = styleHooks(CLIENT_HEADER_SRC);

  it("finds hooks on both sides", () => {
    assert.ok(ssr.size >= 5, `SSR header exposes only ${ssr.size} hooks`);
    assert.ok(client.size >= 5, `client header exposes only ${client.size} hooks`);
  });

  it("agrees on the full hook set", () => {
    const onlySsr = [...ssr].filter(h => !client.has(h)).sort();
    const onlyClient = [...client].filter(h => !ssr.has(h)).sort();
    assert.deepEqual({ onlySsr, onlyClient }, { onlySsr: [], onlyClient: [] },
      "styles.css keys the header's sizes off these attributes, so a hook on one side only means that "
      + "control is sized by the stylesheet in one tree and by the UA in the other");
  });

  it("puts both headers' controls in a <ul>, so `header li` sizes them", () => {
    for (const [name, src] of [["SSR", SSR_HEADER_SRC], ["client", CLIENT_HEADER_SRC]]) {
      assert.match(src, /\bul\b/, `${name} header must build its controls as a list`);
      assert.match(src, /\bli\b/, `${name} header must wrap each control in <li>`);
    }
  });
});

/* ── Every variant used is a variant the stylesheets declare ────────── */

describe("no component renders with an undeclared variant", () => {
  /* An undeclared variant is not a runtime error — the attribute is
     simply written out and nothing matches it, so the control renders
     with no styling at all. That has shipped twice in this org, so it
     gets a test rather than a code review. */

  const require_ = createRequire(import.meta.url);
  const PACKAGE_CSS = readFileSync(
    join(dirname(require_.resolve("@basenative/components")), "components.css"),
    "utf8",
  );

  /** Variants the @basenative/components stylesheet declares, for any component. */
  const declaredPackage = new Set(
    [...PACKAGE_CSS.matchAll(/\[data-variant=["']?([\w-]+)["']?\]/g)].map(m => m[1]),
  );
  /** T4BS's own data-bn-variant hooks. */
  const declaredLocal = new Set(
    [...STYLES.matchAll(/\[data-bn-variant=["']?([\w-]+)["']?\]/g)].map(m => m[1]),
  );

  const VIEW_SOURCES = [
    "src/views/lobby.js", "src/views/play.js", "src/views/submit.js",
    "src/views/moderate.js", "src/views/admin.js",
    "src/components/header.js", "src/components/toast.js",
    "src/components/help-modal.js", "src/components/auth-modal.js",
    "src/bn/client/hydrate.js", "src/main.js",
    "src/bn/views/lobby.js", "src/bn/views/play.js", "src/bn/views/submit.js",
    "src/bn/views/moderate.js", "src/bn/views/admin.js", "src/bn/views/not_found.js",
  ];

  it("declares every @basenative/components variant the app asks for", () => {
    /** @type {string[]} */
    const undeclared = [];
    for (const file of VIEW_SOURCES) {
      const src = stripComments(read(file));
      for (const m of src.matchAll(/\bvariant:\s*["']([\w-]+)["']/g)) {
        if (!declaredPackage.has(m[1])) undeclared.push(`${file}: variant "${m[1]}"`);
      }
    }
    assert.deepEqual(undeclared, [],
      "@basenative/components' stylesheet has no rule for these, so they render unstyled:\n  "
      + undeclared.join("\n  "));
  });

  it("declares every T4BS data-bn-variant the app emits", () => {
    /** @type {string[]} */
    const undeclared = [];
    for (const file of VIEW_SOURCES) {
      const src = stripComments(read(file));
      for (const m of src.matchAll(/data-bn-variant=\\?["']([\w-]+)\\?["']/g)) {
        if (!declaredLocal.has(m[1])) undeclared.push(`${file}: data-bn-variant="${m[1]}"`);
      }
    }
    assert.deepEqual(undeclared, [],
      "styles.css has no rule for these, so they render unstyled:\n  " + undeclared.join("\n  "));
  });
});

/* ── The rendered header, through the real SSR renderer ─────────────── */

describe("the rendered SSR header", () => {
  const ASSETS = { js: "/assets/bn-hydrate.js", css: ["/assets/app.css"], views: {} };
  const baseCtx = (o = {}) => ({
    route: "lobby", pathname: "/", user: null, error: null,
    lobby: null, daily: null, play: null,
    submit: { existingCategories: [] },
    moderate: { pending: null, forbidden: false },
    admin: { elevated: null, currentHandle: null, forbidden: false },
    ...o,
  });
  /* Anchored on role="banner" so it can't latch onto the word "header"
     inside a comment or a <head> further up the document. */
  const headerOf = (html) => (html.match(/<header role="banner"[\s\S]*?<\/header>/) || [""])[0];

  it("sizes its score/lives/tokens readouts off data-bn-role, like the client does", () => {
    const html = renderPage(baseCtx({
      route: "play",
      pathname: "/play",
      play: { id: 1, category: "X", submittedBy: "a", words: [3], anchors: [], totalLetters: 3 },
    }), ASSETS);
    const header = headerOf(html);
    for (const role of ["score", "lives", "tokens"]) {
      assert.match(header, new RegExp(`data-bn-role="${role}"`),
        `the play header must mark its ${role} readout with data-bn-role — the aria-label the CSS `
        + "used to match on is reactive client-side and silently stops matching after hydration");
    }
  });

  it("emits one <ul> of controls in every signed-in state", () => {
    for (const user of [
      null,
      { handle: "w", role: "user", isAdmin: false, isModerator: false },
      { handle: "w", role: "moderator", isAdmin: false, isModerator: true },
      { handle: "w", role: "admin", isAdmin: true, isModerator: true },
    ]) {
      const header = headerOf(renderPage(baseCtx({ user }), ASSETS));
      assert.equal((header.match(/<ul\b/g) || []).length, 1,
        `header for ${JSON.stringify(user)} must contain exactly one control list`);
      assert.match(header, /<nav\b/, "header must wrap its controls in a <nav>");
    }
  });
});
