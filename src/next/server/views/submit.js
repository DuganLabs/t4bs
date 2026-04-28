/* SSR: submit view. Renders the form structure + a populated <datalist>
   of existing categories pulled from D1. The live tile preview and POST
   handling are hydrator territory — but the form posts via standard
   action on no-JS, falling back to a server-handled action below. */

import { esc } from "../../util/escape.js";

/** @param {{ existingCategories: string[] }} ctx */
export function ssrSubmit(ctx) {
  const cats = ctx.existingCategories || [];
  const options = cats.map(c => `<option value="${esc(c)}"></option>`).join("");
  const hint = cats.length > 0
    ? `Tap to pick from ${cats.length} existing categories, or type a new one.`
    : "Type a category name. New categories show up here once approved.";

  return `<main aria-labelledby="lb-submit-title" data-bn-view="submit">
    <h1 id="lb-submit-title" class="sr-only">Submit a phrase</h1>
    <div class="lb-sticky lb-sticky-narrow">Submit a phrase</div>
    <div class="lb-tagline">It enters the moderation queue</div>
    <div class="lb-form">
      <div class="lb-field">
        <label class="lb-flabel" for="lb-cat">Category</label>
        <input id="lb-cat" class="lb-finput" maxlength="30" list="lb-cat-list"
               autocomplete="off" autocapitalize="characters"
               placeholder="Pick or add a category"
               aria-describedby="lb-cat-hint"
               data-bn-bind="submit-cat" />
        <datalist id="lb-cat-list">${options}</datalist>
        <span id="lb-cat-hint" class="lb-fhint" data-bn-bind="submit-cat-hint">${esc(hint)}</span>
      </div>
      <div class="lb-field">
        <label class="lb-flabel" for="lb-phrase">Phrase</label>
        <input id="lb-phrase" class="lb-finput" autocapitalize="characters"
               autocorrect="off" spellcheck="false"
               placeholder="2–10 words · letters only"
               aria-describedby="lb-phrase-hint"
               data-bn-bind="submit-phrase" />
        <span id="lb-phrase-hint" class="lb-fhint" data-bn-bind="submit-phrase-hint">0 words · 0 letters · max 36</span>
      </div>
      <div class="lb-field">
        <span class="lb-flabel">Preview</span>
        <div class="lb-preview empty" aria-hidden="true" data-bn-bind="submit-preview">Tiles preview as you type</div>
        <span class="lb-fhint" data-bn-bind="submit-preview-hint">Type a phrase above to see how it'll render.</span>
      </div>
      <div class="lb-ferror is-hidden" data-bn-bind="submit-err"></div>
    </div>
    <button class="lb-btn lb-bp" type="button" disabled
            data-bn-action="submit-go" data-bn-bind="submit-go">SUBMIT FOR REVIEW</button>
    <button class="lb-btn lb-bs" type="button" data-bn-action="submit-cancel">Cancel</button>
  </main>`;
}
