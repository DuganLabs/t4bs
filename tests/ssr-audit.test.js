/* End-to-end audit of every SSR route's rendered HTML. The existing
   src/bn/hydrate.test.js covers the orchestration layer (renderPage
   shapes the right context, lobby renders the right anchors, etc.);
   this file is the spec-level companion: for every canonical route,
   assert the emitted HTML is well-formed and accessible.

   Each route is rendered with a representative context, then walked
   through a small set of HTML/a11y rules. Failures point at the
   specific defect (heading skip, button without name, input without
   label, etc.) so a regression in a future template change surfaces
   immediately rather than via a flaky Lighthouse run. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { renderPage } from "../src/bn/server/render.js";

const ASSETS = { js: "/assets/bn-hydrate.js", css: ["/assets/app.css"] };

function baseCtx(overrides = {}) {
  return {
    route: "lobby",
    pathname: "/",
    user: null,
    error: null,
    lobby: null,
    play: null,
    submit: { existingCategories: [] },
    moderate: { pending: null, forbidden: false },
    admin: { elevated: null, currentHandle: null, forbidden: false },
    ...overrides,
  };
}

const ROUTE_FIXTURES = {
  lobby: {
    pathname: "/",
    lobby: [
      { id: 1, category: "ANIMALS", submittedBy: "alice" },
      { id: 2, category: "ANIMALS", submittedBy: "bob" },
      { id: 3, category: "FOODS",   submittedBy: "carol" },
    ],
  },
  play: {
    pathname: "/play",
    play: {
      id: 7,
      category: "CAPITALS",
      submittedBy: "dave",
      words: [3, 4],
      anchors: [{ wi: 0, li: 0, letter: "P" }],
      totalLetters: 7,
    },
  },
  submit: {
    pathname: "/submit",
    submit: { existingCategories: ["ANIMALS", "FOODS"] },
  },
  moderate: {
    pathname: "/moderate",
    user: { handle: "warren", isModerator: true },
    moderate: {
      pending: [{ id: 4, category: "X", phrase: "TEST PHRASE", submittedBy: "alice" }],
      forbidden: false,
    },
  },
  admin: {
    pathname: "/admin",
    user: { handle: "warren", isAdmin: true },
    admin: {
      elevated: [{ handle: "alice", role: "moderator" }],
      currentHandle: "warren",
      forbidden: false,
    },
  },
  "not-found": {
    pathname: "/whatever",
  },
};

const ROUTES = Object.entries(ROUTE_FIXTURES).map(([route, fixture]) => ({ route, ...fixture }));

/* ── Audit primitives — small enough that the assertion message names
   what failed without the test having to repeat the rule. ── */

function ariaLabelledbyTargetExists(html) {
  const m = html.match(/<main[^>]*aria-labelledby="([^"]+)"/);
  if (!m) return { ok: false, reason: "main missing aria-labelledby" };
  const id = m[1];
  if (!new RegExp(`id="${id}"`).test(html)) {
    return { ok: false, reason: `main aria-labelledby="${id}" but no element with that id` };
  }
  return { ok: true };
}

function headingOrderMonotonic(html) {
  const headings = [...html.matchAll(/<h([1-6])\b/g)].map(m => Number(m[1]));
  let prev = 0;
  for (const lv of headings) {
    if (lv > prev + 1 && prev !== 0) {
      return { ok: false, reason: `heading skip: ${headings.join("→")}` };
    }
    prev = lv;
  }
  return { ok: true, headings };
}

function anchorsHaveHrefs(html) {
  /* Require word boundary after `<a` so we don't false-positive on
     `<article>`. */
  const m = html.match(/<a\s+(?![^>]*href=)[^>]*>/);
  if (m) return { ok: false, reason: `<a> without href: ${m[0].slice(0, 80)}` };
  return { ok: true };
}

function buttonsInsideFormsHaveType(html) {
  /* HTML default button type is "submit" — implicit-submit footguns
     are a perennial PR#-on-the-form regression. */
  const formStart = html.indexOf("<form");
  const formEnd   = html.indexOf("</form>");
  if (formStart < 0 || formEnd <= formStart) return { ok: true };
  const formContent = html.slice(formStart, formEnd);
  const m = formContent.match(/<button(?![^>]*\btype=)[^>]*>/);
  if (m) return { ok: false, reason: `button without type inside <form>: ${m[0].slice(0, 80)}` };
  return { ok: true };
}

function inputsHaveLabels(html) {
  const issues = [];
  for (const m of html.matchAll(/<input[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const id = m[1];
    const inputTag = m[0];
    /* Skip non-textual inputs (hidden / submit etc.) — only labelable
       controls need an associated label. */
    if (/\btype="hidden"|\btype="submit"|\btype="reset"|\btype="button"/.test(inputTag)) continue;
    const hasLabelFor = new RegExp(`<label[^>]*for="${id}"`).test(html);
    const hasAriaLabel = /\baria-label=|\baria-labelledby=/.test(inputTag);
    if (!hasLabelFor && !hasAriaLabel) issues.push(`input id="${id}" missing label`);
  }
  return issues.length ? { ok: false, reason: issues.join("; ") } : { ok: true };
}

function buttonsHaveAccessibleName(html) {
  const issues = [];
  /* Greedy-but-non-greedy match across nested tags so wrapper <span>s
     inside the button still reveal text content. */
  const re = /<button[^>]*>([\s\S]*?)<\/button>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const innerText = m[1].replace(/<[^>]+>/g, "").trim();
    const hasAriaName = /\baria-label="[^"]+"|\baria-labelledby="[^"]+"/.test(tag);
    if (!innerText && !hasAriaName) issues.push(`button no name: ${tag.slice(0, 80)}`);
  }
  return issues.length ? { ok: false, reason: issues.join("; ") } : { ok: true };
}

/* ── Per-route suite ── */

describe("SSR audit — every route emits accessible, spec-conformant HTML", () => {
  for (const ctx of ROUTES) {
    describe(`route=${ctx.route}`, () => {
      const html = renderPage(baseCtx(ctx), ASSETS);

      it("has a doctype and <html lang>", () => {
        assert.ok(html.startsWith("<!DOCTYPE html>"), "missing doctype");
        assert.match(html, /<html[^>]*\blang=/);
      });

      it("has a <title>, viewport meta, and rel=canonical", () => {
        const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
        assert.ok(title.length >= 5, `weak <title>: "${title}"`);
        assert.match(html, /name="viewport"/);
        assert.match(html, /rel="canonical"/);
      });

      it("has a noscript fallback inside the body", () => {
        const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/) || [])[1] || "";
        assert.match(body, /<noscript>/i, "no <noscript> in body");
      });

      it("main aria-labelledby points at a real id", () => {
        const r = ariaLabelledbyTargetExists(html);
        assert.ok(r.ok, r.reason);
      });

      it("heading order is monotonic (no skipped levels)", () => {
        const r = headingOrderMonotonic(html);
        assert.ok(r.ok, r.reason);
      });

      it("every <a> has an href", () => {
        const r = anchorsHaveHrefs(html);
        assert.ok(r.ok, r.reason);
      });

      it("every <button> inside a <form> has an explicit type", () => {
        const r = buttonsInsideFormsHaveType(html);
        assert.ok(r.ok, r.reason);
      });

      it("every text-style <input id> has an associated <label for> or aria-label", () => {
        const r = inputsHaveLabels(html);
        assert.ok(r.ok, r.reason);
      });

      it("every <button> has an accessible name (text content or aria-label)", () => {
        const r = buttonsHaveAccessibleName(html);
        assert.ok(r.ok, r.reason);
      });
    });
  }
});

/* ── Defensive shaping — the bug that prompted this whole sweep. ── */

describe("renderPage tolerates partial play contexts", () => {
  /* shapePlay() used to throw "play.anchors is not iterable" when the
     incoming play row was missing either field. Adding `|| []` guards
     makes the SSR robust to malformed input — fail open with an empty
     grid rather than 500 the whole page. */

  it("does not throw when play.anchors is null", () => {
    const ctx = baseCtx({
      route: "play",
      pathname: "/play",
      play: { id: 1, category: "X", submittedBy: "a", words: [3], anchors: null, totalLetters: 3 },
    });
    assert.doesNotThrow(() => renderPage(ctx, ASSETS));
  });

  it("does not throw when play.anchors is undefined", () => {
    const ctx = baseCtx({
      route: "play",
      pathname: "/play",
      play: { id: 1, category: "X", submittedBy: "a", words: [3], totalLetters: 3 },
    });
    assert.doesNotThrow(() => renderPage(ctx, ASSETS));
  });

  it("does not throw when play.words is null", () => {
    const ctx = baseCtx({
      route: "play",
      pathname: "/play",
      play: { id: 1, category: "X", submittedBy: "a", words: null, anchors: [], totalLetters: 0 },
    });
    assert.doesNotThrow(() => renderPage(ctx, ASSETS));
  });
});
