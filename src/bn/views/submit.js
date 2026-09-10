/* submit.html — exported as a string for both worker and vite
   bundling. Edit this file to change the template; the .js wrapper
   keeps it portable across the @basenative/server SSR worker and
   any node:test consumers. */

export default `<main aria-labelledby="submit-title" data-bn-view="submit">
  <h1 id="submit-title">Submit a phrase</h1>
  <p data-bn-region="tagline">It enters the moderation queue</p>

  <form data-bn-region="form" data-bn-action="submit-form" aria-describedby="submit-hint">
    <fieldset>
      <legend>New round</legend>

      <p data-bn-region="field">
        <label for="submit-category">Category</label>
        <span data-bn-bind="submit-combobox" data-suggestions-id="submit-categories">
          <input id="submit-category"
                 name="category"
                 data-bn-region="input"
                 list="submit-categories"
                 maxlength="30"
                 autocomplete="off"
                 autocapitalize="characters"
                 placeholder="Pick or add a category"
                 aria-describedby="submit-cat-hint" />
          <datalist id="submit-categories">
            <template @for="cat of existingCategories; track cat">
              <option :value="cat"></option>
            </template>
          </datalist>
        </span>
        <small id="submit-cat-hint" data-bn-region="hint">
          Tap to pick from existing categories, or type a new one.
        </small>
      </p>

      <p data-bn-region="field">
        <label for="submit-phrase">Phrase</label>
        <input id="submit-phrase"
               name="phrase"
               data-bn-region="input"
               autocapitalize="characters"
               autocorrect="off"
               spellcheck="false"
               placeholder="2–10 words · letters only"
               aria-describedby="submit-phrase-hint" />
        <small id="submit-phrase-hint" data-bn-region="hint" data-bn-bind="submit-phrase-hint">0 words · 0 letters · max 36</small>
      </p>

      <section aria-label="Phrase preview" aria-hidden="true" data-bn-region="preview" data-bn-bind="submit-preview">
        <p>Type a phrase to see how it'll render.</p>
      </section>

      <output role="alert" data-bn-region="error" data-bn-bind="submit-error" hidden></output>
    </fieldset>

    <button type="submit" data-bn-button="primary" data-bn-action="submit-confirm">
      SUBMIT FOR REVIEW
    </button>
    <button type="button" data-bn-button="secondary" data-bn-action="submit-cancel">Cancel</button>
  </form>
</main>
`;
