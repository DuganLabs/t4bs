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

  it("explains the keyboard's four letter states, not just by colour name", () => {
    /* Owner's ruling (2026-09-10): the keyboard needs a legend once it
       grew a 4th distinguishable state, and it must not lean on colour
       words alone — pair each state with its non-colour glyph too so
       the explanation itself doesn't assume colour vision. Regression
       coverage for "if there is no legend, add the minimum that makes
       the states self-explanatory." */
    const html = helpDialogHtml();
    assert.match(html, /confirmed in this word/);
    assert.match(html, /elsewhere in the phrase, not this word/);
    assert.match(html, /not in this word/);
    // Each state's glyph badge (matches the ::after content in
    // styles.css and game.js's KEY_STATE_INFO) appears in the copy —
    // not color-only language.
    assert.match(html, /&check;|✓/);
    assert.match(html, /&#9670;|◆/);
    assert.match(html, /&#10005;|✕/);
    // The "never locked out for the next word" half of the ruling.
    assert.match(html, /never.*locked out.*next word|locked out.*next word/i);
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
