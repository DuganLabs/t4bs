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
    /* The close button is @basenative/components' renderButton() now,
       not T4BS's retired [data-bn-button] vocabulary. */
    assert.match(html, /<button data-bn="button" data-variant="primary"[^>]*data-bn-action="help-close"/);
    assert.match(html, />HOW TO PLAY</);
    assert.match(html, />Got it</);
  });

  it("wraps its content in a renderCard() article, the shared modal card chrome", () => {
    const html = helpDialogHtml();
    assert.match(html, /<article data-bn="card"/);
  });

  it("has no close-X button (closable: false, matching the previous design)", () => {
    const html = helpDialogHtml();
    assert.doesNotMatch(html, /data-bn="dialog-close"/);
  });



  /* The design review's #4: "the lives rule is never explained, and
     it's harsher than it looks." The help modal walked through typing,
     staking, cascades and ALL IN without ever saying that a wrong guess
     costs a life, or that all words draw from ONE pool of four. A
     first-time player could lose a round to a rule the game never
     stated. */

  /* #5: the stake was sold as risk and only ever moved score, which
     floors at zero. It costs a life now — the copy has to say so. */

  it("explains the daily/free-play split and where the streak comes from", () => {
    const html = helpDialogHtml();
    assert.match(html, /one daily puzzle per day/i);
    assert.match(html, /same one for everyone/i);
    assert.match(html, /00:00 UTC/);
    assert.match(html, /streak/i);
    assert.match(html, /never touches the streak/i);
  });

  it("tells the player their anchors are free letters, not a bug", () => {
    assert.match(helpDialogHtml(), /anchors/i);
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

  it("explains the two key states without relying on colour", () => {
    const html = helpDialogHtml();
    assert.match(html, /in the phrase, turned over/);
    assert.match(html, /not in the phrase/);
    assert.match(html, /&check;|✓/);
    assert.match(html, /&#10005;|✕/);
  });

  it("states the v2 rules: five lives, a wrong solve costs one, ten a hidden letter, par", () => {
    const html = helpDialogHtml();
    assert.match(html, /one of five lives/i);
    assert.match(html, /wrong costs one life and reveals nothing/i);
    assert.match(html, /still hidden when you solve is worth/i);
    assert.match(html, /par/i);
    assert.doesNotMatch(html, /stake|cascade|ALL IN|four lives/i);
  });
});
