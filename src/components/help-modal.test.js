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


  /* The design review's #4: "the lives rule is never explained, and
     it's harsher than it looks." The help modal walked through typing,
     staking, cascades and ALL IN without ever saying that a wrong guess
     costs a life, or that all words draw from ONE pool of four. A
     first-time player could lose a round to a rule the game never
     stated. */
  it("states the lives rule: one shared pool for the whole phrase", () => {
    const html = helpDialogHtml();
    assert.match(html, /four for the whole phrase/i);
    assert.match(html, /not four per word/i);
    assert.match(html, /same pool/i);
    // …and what spends one.
    assert.match(html, /isn't <em>fully<\/em> correct costs one|fully<\/em> correct costs one/i);
  });

  /* #5: the stake was sold as risk and only ever moved score, which
     floors at zero. It costs a life now — the copy has to say so. */
  it("states what a stake actually costs, not just what it pays", () => {
    const html = helpDialogHtml();
    assert.match(html, /double/i);
    assert.match(html, /one extra life/i);
    assert.doesNotMatch(html, /wrong costs double/i,
      "the old score-only framing must not survive alongside the life cost");
  });

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
});
