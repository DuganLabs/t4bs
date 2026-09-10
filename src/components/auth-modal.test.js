/* authDialogHtml() is a pure string renderer (built on
   @basenative/components' renderDialog()/renderTabs()) exported
   specifically so its markup is testable without a DOM —
   createAuthModal() itself calls document.createElement via
   fromHTML()/h() (and hands the switcher to initTabs()) and isn't
   testable without a browser, same as before this change (there was
   never an existing test for it). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { authDialogHtml } from "./auth-modal.js";

describe("authDialogHtml", () => {
  it("renders a native <dialog> with modal ARIA semantics", () => {
    const html = authDialogHtml();
    assert.match(html, /^<dialog /);
    assert.match(html, /data-bn="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /data-modal="true"/);
  });

  it("renders the login/register switcher as real tabs", () => {
    const html = authDialogHtml();
    assert.match(html, /data-bn="tabs"/);
    assert.match(html, /data-bn="tab-list"/);
    assert.match(html, /role="tablist"/);
    // Two tab buttons, both role="tab", with distinct aria-selected —
    // login active by default, matching the previous `tab = signal("login")`.
    const tabButtons = [...html.matchAll(/<button data-bn="tab" role="tab"[^>]*>/g)];
    assert.equal(tabButtons.length, 2);
    assert.ok(tabButtons.every((m) => m[0].includes('role="tab"')));
    assert.match(html, /data-tab="login"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-tab="login"/);
    assert.match(html, />LOG IN</);
    assert.match(html, />NEW HANDLE</);
  });

  it("emits the roving tabindex (components 0.7.0): only the active tab is in the tab sequence", () => {
    const html = authDialogHtml();
    const tabButtons = [...html.matchAll(/<button data-bn="tab" role="tab"[^>]*>/g)].map((m) => m[0]);
    const login    = tabButtons.find((b) => b.includes('data-tab="login"'));
    const register = tabButtons.find((b) => b.includes('data-tab="register"'));
    assert.ok(login && register, "expected a login and a register tab button");
    assert.match(login, /tabindex="0"/);
    assert.match(register, /tabindex="-1"/);
  });

  it("leaves aria-labelledby to createAuthModal() (title is in the content slot, not renderDialog's `title`)", () => {
    const html = authDialogHtml();
    const openTag = html.match(/^<dialog [^>]*>/)[0];
    // 0.7.0's renderDialog() emits aria-labelledby only for its own
    // `title` option — none is passed here, so nothing doubles up with
    // the #auth-title label createAuthModal() sets at mount.
    assert.doesNotMatch(openTag, /aria-labelledby/);
    assert.doesNotMatch(html, /data-bn="dialog-title"/);
  });

  it("keeps the existing title/subtitle/cancel-button attribute contract", () => {
    const html = authDialogHtml();
    assert.match(html, /id="auth-title"/);
    assert.match(html, /data-bn-region="title"/);
    assert.match(html, /data-tone="auth"/);
    assert.match(html, /data-bn-region="subtitle"/);
    assert.match(html, /data-bn-button="secondary"/);
    assert.match(html, /data-bn-action="auth-cancel"/);
    assert.match(html, />SIGN IN</);
    assert.match(html, />Cancel</);
  });

  it("has no close-X button (closable: false, matching the previous design)", () => {
    const html = authDialogHtml();
    assert.doesNotMatch(html, /data-bn="dialog-close"/);
  });

  it("leaves a form-slot placeholder for the signal-driven <form>", () => {
    const html = authDialogHtml();
    assert.match(html, /data-bn-region="form-slot"/);
    // Nothing password/passkey-shaped belongs in the pure string
    // renderer — that's h()-built by createAuthModal().
    assert.doesNotMatch(html, /<form/);
  });
});
