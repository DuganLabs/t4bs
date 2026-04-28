/* submit.html — exported as a string for both worker and vite
   bundling. Edit this file to change the template; the .js wrapper
   keeps it portable across the @basenative/server SSR worker and
   any node:test consumers. */

export default `<main aria-labelledby="submit-title" data-bn-view="submit">
  <h1 id="submit-title">Submit a phrase</h1>
  <p>It enters the moderation queue.</p>

  <form data-bn-action="submit-form" aria-describedby="submit-hint">
    <fieldset>
      <legend>New round</legend>

      <p>
        <label for="submit-category">Category</label>
        <span data-bn-bind="submit-combobox" data-suggestions-id="submit-categories">
          <input id="submit-category"
                 name="category"
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
        <small id="submit-cat-hint">
          Tap to pick from existing categories, or type a new one.
        </small>
      </p>

      <p>
        <label for="submit-phrase">Phrase</label>
        <input id="submit-phrase"
               name="phrase"
               autocapitalize="characters"
               autocorrect="off"
               spellcheck="false"
               placeholder="2–10 words · letters only"
               aria-describedby="submit-phrase-hint" />
        <small id="submit-phrase-hint" data-bn-bind="submit-phrase-hint">0 words · 0 letters · max 36</small>
      </p>

      <section aria-label="Phrase preview" data-bn-region="preview" data-bn-bind="submit-preview">
        <p>Type a phrase to see how it'll render.</p>
      </section>

      <p role="alert" data-bn-bind="submit-error" hidden></p>
    </fieldset>

    <button type="submit" data-bn-action="submit-confirm" aria-label="Submit for review">
      Submit for review
    </button>
    <button type="button" data-bn-action="submit-cancel">Cancel</button>
  </form>
</main>
`;
