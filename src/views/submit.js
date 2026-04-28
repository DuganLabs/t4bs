/* Single-file component: SUBMIT view.
   Posts to /api/submit with category + phrase. Live tile preview.
   Existing categories drive the @basenative/combobox typeahead, with
   `allowCreate` for new categories. */

import { signal, computed, effect } from "@basenative/runtime";
import { Combobox } from "@basenative/combobox";
import { h, reactiveList } from "../lib/dom.js";
import { api } from "../lib/api.js";

export function createSubmit({ existingCategories, onCancel, onSubmitted, toaster }) {
  const category = signal("");
  const phrase   = signal("");
  const busy     = signal(false);
  const err      = signal(null);

  const cleaned = computed(() =>
    phrase().trim().toUpperCase().replace(/[^A-Z ]/g, "").replace(/\s+/g, " ")
  );
  const words = computed(() => cleaned() ? cleaned().split(" ") : []);
  const totalLetters = computed(() => words().reduce((a, w) => a + w.length, 0));

  async function submit() {
    busy.set(true); err.set(null);
    try {
      await api.submit({ category: category().trim(), phrase: cleaned(), anchors: [] });
      toaster("SUBMITTED — pending review", "great");
      onSubmitted();
    } catch (e) {
      err.set(String(e.data?.detail || e.message || e));
    } finally {
      busy.set(false);
    }
  }

  // Combobox: signal-driven, allowCreate, runtime.effect hooks the
  // input value back to the category signal.
  const cb = Combobox({
    id: "lb-cat",
    name: "category",
    options: existingCategories() || [],
    value: category,
    allowCreate: true,
    createLabel: (input) => `+ NEW CATEGORY "${input.toUpperCase()}"`,
    placeholder: "Pick or add a category",
    ariaDescribedBy: "lb-cat-hint",
    onChange: (v) => category.set(String(v).toUpperCase()),
    onCreate: (label) => category.set(String(label).toUpperCase()),
    runtime: { effect },
  });

  // Wrapper element receives the combobox HTML; hydrate after the
  // wrapper is appended to the DOM (bind: ref runs synchronously,
  // before mount, so we wait one microtask via queueMicrotask).
  const cbWrapper = h("div", {
    class: "lb-cat-combobox",
    html: cb.html,
    bind: (el) => {
      const handle = cb.hydrate(el);
      // Mirror existingCategories changes back into the listbox.
      effect(() => handle.setOptions(existingCategories() || []));
    },
  });

  const phraseInput = h("input", {
    id: "lb-phrase",
    class: "lb-finput",
    autocapitalize: "characters",
    autocorrect: "off",
    spellcheck: "false",
    placeholder: "2–10 words · letters only",
    "aria-describedby": "lb-phrase-hint",
    onInput: (e) => phrase.set(e.target.value),
  });

  const preview = h("div", {
    class: () => `lb-preview${words().length === 0 ? " empty" : ""}`,
    "aria-hidden": "true",
  });
  reactiveList(preview, () => {
    const w = words();
    if (w.length === 0) return [document.createTextNode("Tiles preview as you type")];
    return w.map(word =>
      h("div", { class: "lb-pword" },
        ...word.split("").map(() => h("div", { class: "lb-ptile" })),
      )
    );
  });

  const errBox = h("div", {
    class: "lb-ferror",
    text: () => err() || "",
    hidden: () => !err(),
  });

  return h("main", { "aria-labelledby": "lb-submit-title" },
    h("h1", { id: "lb-submit-title", class: "sr-only" }, "Submit a phrase"),
    h("div", { class: "lb-sticky lb-sticky-narrow" }, "Submit a phrase"),
    h("div", { class: "lb-tagline" }, "It enters the moderation queue"),
    h("div", { class: "lb-form" },
      h("div", { class: "lb-field" },
        cbWrapper,
        h("span", {
          id: "lb-cat-hint",
          class: "lb-fhint",
          text: () => existingCategories()?.length > 0
            ? `Tap to pick from ${existingCategories().length} existing categories, or type a new one.`
            : "Type a category name. New categories show up here once approved.",
        }),
      ),
      h("div", { class: "lb-field" },
        h("label", { class: "lb-flabel", for: "lb-phrase" }, "Phrase"),
        phraseInput,
        h("span", {
          id: "lb-phrase-hint",
          class: "lb-fhint",
          text: () => `${words().length} word${words().length === 1 ? "" : "s"} · ${totalLetters()} letters · max 36`,
        }),
      ),
      h("div", { class: "lb-field" },
        h("span", { class: "lb-flabel" }, "Preview"),
        preview,
        h("span", {
          class: "lb-fhint",
          text: () => words().length === 0
            ? "Type a phrase above to see how it'll render."
            : "No starting hints. Players solve it cold.",
        }),
      ),
      errBox,
    ),
    h("button", {
      class: "lb-btn lb-bp",
      type: "button",
      disabled: () => busy() || !category() || !phrase(),
      text: () => busy() ? "…" : "SUBMIT FOR REVIEW",
      onClick: submit,
    }),
    h("button", { class: "lb-btn lb-bs", type: "button", onClick: onCancel }, "Cancel"),
  );
}
