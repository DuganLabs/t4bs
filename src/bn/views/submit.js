/* submit.html — exported as a string for both worker and vite
   bundling. Edit this file to change the template; the .js wrapper
   keeps it portable across the @basenative/server SSR worker and
   any node:test consumers.

   The two buttons are @basenative/components' renderButton() output,
   interpolated at module-evaluation time — the template is a plain JS
   template literal, so a pure string renderer composes into it without
   any build step. The category <input> deliberately stays hand-written:
   it is the no-JS fallback for @basenative/combobox (which owns the
   control after hydration) and carries a sibling <datalist> that
   renderInput()'s field wrapper has no slot for.

   The always-empty, always-hidden error placeholder that used to sit at
   the end of the <fieldset> is gone: the SSR shell has no error to
   report (renderPage's submit context carries none), it was replaced
   wholesale on hydration, and nothing read its data-bn-bind marker. The
   live error box is created by the client view's bnAlert(). */

import { renderButton } from "@basenative/components";

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

    </fieldset>

    ${renderButton("SUBMIT FOR REVIEW", {
      variant: "primary",
      type: "submit",
      attrs: 'data-bn-action="submit-confirm"',
    })}
    ${renderButton("Cancel", {
      variant: "secondary",
      attrs: 'data-bn-action="submit-cancel"',
    })}
  </form>
</main>
`;
