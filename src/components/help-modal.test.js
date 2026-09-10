/* helpDialogHtml() is a pure string renderer (built on
   @basenative/components' renderDialog()) exported specifically so its
   markup is testable without a DOM — createHelpModal() itself calls
   document.createElement via fromHTML() and isn't testable without a
   browser, same as before this change (there was never an existing
   test for it). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { helpDialogHtml } from "./help-modal.js";

describe("helpDialogHtml", () => {
  it("renders a native <dialog> with modal ARIA semantics", () => {
    const html = helpDialogHtml();
    assert.match(html, /^<dialog /);
    assert.match(html, /data-bn="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /data-modal="true"/);
  });

  it("keeps the existing title/subtitle/body/button attribute contract", () => {
    const html = helpDialogHtml();
    assert.match(html, /id="help-title"/);
    assert.match(html, /data-bn-region="title"/);
    assert.match(html, /data-tone="help"/);
    assert.match(html, /data-bn-region="subtitle"/);
    assert.match(html, /data-bn-region="help-body"/);
    assert.match(html, /data-bn-button="primary"/);
    assert.match(html, /data-bn-action="help-close"/);
    assert.match(html, />HOW TO PLAY</);
    assert.match(html, />Got it</);
  });

  it("has no close-X button (closable: false, matching the previous design)", () => {
    const html = helpDialogHtml();
    assert.doesNotMatch(html, /data-bn="dialog-close"/);
  });

  it("leaves aria-labelledby to createHelpModal() (title is in the content slot, not renderDialog's `title`)", () => {
    const html = helpDialogHtml();
    const openTag = html.match(/^<dialog [^>]*>/)[0];
    // 0.7.0's renderDialog() emits aria-labelledby only for its own
    // `title` option — none is passed here, so nothing doubles up with
    // the #help-title label createHelpModal() sets at mount.
    assert.doesNotMatch(openTag, /aria-labelledby/);
    assert.doesNotMatch(html, /data-bn="dialog-title"/);
  });
});
