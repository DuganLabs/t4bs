/* SUBMIT view — semantic mirror of src/bn/views/submit.js (SSR).

   <main data-bn-view="submit"> with a real <form>, <fieldset>, <legend>,
   <label>, <input>, <datalist>, and <output role="alert">. The combobox
   from @basenative/combobox sits inside the category <label>; the live
   tile preview is a <section data-bn-region="preview">. */

import { signal, computed, effect } from "@basenative/runtime";
import { Combobox } from "@basenative/combobox";
import { h } from "../lib/dom.js";
import { bindDisabled, bindHidden, bindList, bindText } from "../lib/bind.js";
import { api } from "../lib/api.js";

export function createSubmit({ existingCategories, onCancel, onSubmitted, toaster }) {
  const category = signal("");
  const phrase   = signal("");
  const busy     = signal(false);
  const err      = signal(null);

  const cleaned = computed(() =>
    phrase().trim().toUpperCase().replace(/[^A-Z ]/g, "").replace(/\s+/g, " "),
  );
  const words = computed(() => cleaned() ? cleaned().split(" ") : []);
  const totalLetters = computed(() => words().reduce((a, w) => a + w.length, 0));

  async function submit(e) {
    if (e) e.preventDefault();
    busy.set(true); err.set(null);
    try {
      await api.submit({ category: category().trim(), phrase: cleaned(), anchors: [] });
      toaster("SUBMITTED — pending review", "great");
      onSubmitted();
    } catch (e2) {
      err.set(String(e2.data?.detail || e2.message || e2));
    } finally {
      busy.set(false);
    }
  }

  /* Combobox lives inside the category <label>. */
  const cb = Combobox({
    id: "submit-category",
    name: "category",
    options: existingCategories() || [],
    value: category,
    allowCreate: true,
    createLabel: (input) => `+ NEW CATEGORY "${input.toUpperCase()}"`,
    placeholder: "Pick or add a category",
    ariaDescribedBy: "submit-cat-hint",
    onChange: (v) => category.set(String(v).toUpperCase()),
    onCreate: (label) => category.set(String(label).toUpperCase()),
    runtime: { effect },
  });

  const cbWrapper = h("span", {
    "data-bn-bind": "submit-combobox",
    "data-suggestions-id": "submit-categories",
    html: cb.html,
    bind: (el) => {
      const handle = cb.hydrate(el);
      effect(() => handle.setOptions(existingCategories() || []));
    },
  });

  /* Hint texts. */
  const catHint = h("small", { id: "submit-cat-hint" });
  bindText(catHint, () => existingCategories()?.length > 0
    ? `Tap to pick from ${existingCategories().length} existing categories, or type a new one.`
    : "Type a category name. New categories show up here once approved.",
  );

  const phraseHint = h("small", { id: "submit-phrase-hint", "data-bn-bind": "submit-phrase-hint" });
  bindText(phraseHint, () => `${words().length} word${words().length === 1 ? "" : "s"} · ${totalLetters()} letters · max 36`);

  /* Live tile preview. */
  const preview = h("section", {
    class: "lb-preview",
    "aria-label": "Phrase preview",
    "aria-hidden": "true",
    "data-bn-region": "preview",
    "data-bn-bind": "submit-preview",
  });
  bindList(preview, words, (word) =>
    h("div", { class: "lb-pword", role: "group" },
      ...word.split("").map(() => h("span", { class: "lb-ptile", role: "img", "aria-label": "tile" })),
    ),
  () => h("p", null, "Type a phrase to see how it'll render."));

  const previewHint = h("small", { class: "lb-fhint" });
  bindText(previewHint, () => words().length === 0
    ? "Type a phrase above to see how it'll render."
    : "No starting hints. Players solve it cold.",
  );

  /* Error output. */
  const errBox = h("output", {
    class: "lb-ferror",
    role: "alert",
    "data-bn-bind": "submit-error",
  });
  bindText(errBox, () => err() || "");
  bindHidden(errBox, () => !err());

  /* Phrase input. */
  const phraseInput = h("input", {
    id: "submit-phrase",
    name: "phrase",
    class: "lb-finput",
    autocapitalize: "characters",
    autocorrect: "off",
    spellcheck: "false",
    placeholder: "2–10 words · letters only",
    "aria-describedby": "submit-phrase-hint",
    onInput: (e) => phrase.set(e.target.value),
  });

  const submitBtn = h("button", {
    type: "submit",
    class: "lb-btn lb-bp",
    "data-bn-action": "submit-confirm",
  });
  bindText(submitBtn, () => busy() ? "…" : "SUBMIT FOR REVIEW");
  bindDisabled(submitBtn, () => busy() || !category() || !phrase());

  const cancelBtn = h("button", {
    type: "button",
    class: "lb-btn lb-bs",
    "data-bn-action": "submit-cancel",
    onClick: onCancel,
  }, "Cancel");

  const form = h("form", {
    class: "lb-form",
    "data-bn-action": "submit-form",
    "aria-describedby": "submit-hint",
    novalidate: "",
    onSubmit: submit,
  },
    h("fieldset", null,
      h("legend", null, "New round"),
      h("p", { class: "lb-field" },
        h("label", { for: "submit-category" }, "Category"),
        cbWrapper,
        catHint,
      ),
      h("p", { class: "lb-field" },
        h("label", { for: "submit-phrase" }, "Phrase"),
        phraseInput,
        phraseHint,
      ),
      h("p", { class: "lb-field" },
        h("span", { class: "lb-flabel" }, "Preview"),
        preview,
        previewHint,
      ),
      errBox,
    ),
    submitBtn,
    cancelBtn,
  );

  return h("main", {
    "aria-labelledby": "submit-title",
    "data-bn-view": "submit",
  },
    h("header", null,
      h("h1", { id: "submit-title", class: "sr-only" }, "Submit a phrase"),
      h("p", { class: "lb-sticky lb-sticky-narrow" }, "Submit a phrase"),
      h("p", { class: "lb-tagline" }, "It enters the moderation queue"),
    ),
    form,
  );
}
