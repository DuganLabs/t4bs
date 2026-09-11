/* SUBMIT view — semantic mirror of src/bn/views/submit.js (SSR).

   <main data-bn-view="submit"> with a real <form>, <fieldset>, <legend>,
   <label>, <input>, <datalist>, and <output role="alert">. The combobox
   from @basenative/combobox sits inside the category <label>; the live
   tile preview is a <section data-bn-region="preview">. */

import { signal, computed, effect } from "@basenative/runtime";
import { Combobox } from "@basenative/combobox";
import { h } from "../lib/dom.js";
import { bindDisabled, bindHidden, bindText } from "../lib/bind.js";
import { api } from "../lib/api.js";
import { maxAnchors, suggestAnchors } from "../../shared/submission.js";

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

  /* ANCHORS — the piece that was missing end to end.
     `api.submit` used to hard-code `anchors: []`, so every community
     puzzle shipped with the same blank grid the ten house puzzles had,
     even though the README and PRD both describe anchor letters as the
     player's bootstrap. The picker below seeds a sensible default the
     moment a valid phrase exists and lets the submitter tap tiles to
     change it; shared/submission.js now rejects a phrase with none, so
     this is a real field, not a nicety.

     Stored as "wi:li" strings so toggling is a Set operation. */
  const anchorKeys = signal(/** @type {string[]} */([]));
  const anchorSet = computed(() => new Set(anchorKeys()));
  const anchorCap = computed(() => maxAnchors(words()));
  /* Re-seed whenever the phrase's shape changes — an anchor at word 4
     means nothing after the submitter deletes word 4. */
  let lastShape = "";
  effect(() => {
    const shape = words().map(w => w.length).join(",");
    if (shape === lastShape) return;
    lastShape = shape;
    anchorKeys.set(suggestAnchors(cleaned()).map(a => `${a.wi}:${a.li}`));
  });

  function toggleAnchor(wi, li) {
    const key = `${wi}:${li}`;
    const cur = anchorKeys();
    if (cur.includes(key)) {
      anchorKeys.set(cur.filter(k => k !== key));
      return;
    }
    if (cur.length >= anchorCap()) return;
    if (cur.length + 1 >= totalLetters()) return;   // leave something to solve
    anchorKeys.set([...cur, key]);
  }

  const anchors = computed(() => anchorKeys().map(k => {
    const [wi, li] = k.split(":").map(Number);
    return { wi, li };
  }));

  async function submit(e) {
    if (e) e.preventDefault();
    busy.set(true); err.set(null);
    try {
      await api.submit({ category: category().trim(), phrase: cleaned(), anchors: anchors() });
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
  const catHint = h("small", { id: "submit-cat-hint", "data-bn-region": "hint" });
  bindText(catHint, () => existingCategories()?.length > 0
    ? `Tap to pick from ${existingCategories().length} existing categories, or type a new one.`
    : "Type a category name. New categories show up here once approved.",
  );

  const phraseHint = h("small", { id: "submit-phrase-hint", "data-bn-region": "hint", "data-bn-bind": "submit-phrase-hint" });
  bindText(phraseHint, () => `${words().length} word${words().length === 1 ? "" : "s"} · ${totalLetters()} letters · max 36`);

  /* Live tile preview. Styling is attribute-driven via
     [data-bn-region="preview"] under main[data-bn-view="submit"];
     each word row is a [role="group"] and each tile is a [role="img"]. */
  const preview = h("section", {
    "aria-label": "Phrase preview — tap a tile to give it away as a starting letter",
    "data-bn-region": "preview",
    "data-bn-bind": "submit-preview",
  });
  /* Rebuilt on every phrase/anchor change: the cell count is dynamic
     and each tile's state depends on the anchor set. */
  effect(() => {
    const ws = words();
    if (ws.length === 0) {
      preview.replaceChildren(h("p", null, "Type a phrase to see how it'll render."));
      return;
    }
    const picked = anchorSet();
    preview.replaceChildren(...ws.map((word, wi) =>
      h("div", { role: "group", "aria-label": `Word ${wi + 1}` },
        ...word.split("").map((letter, li) => {
          const on = picked.has(`${wi}:${li}`);
          return h("button", {
            type: "button",
            "data-bn-region": "preview-tile",
            "data-anchor": on ? "" : null,
            "aria-pressed": on ? "true" : "false",
            "aria-label": on
              ? `${letter} at position ${li + 1} of word ${wi + 1} — given away as a starting letter. Tap to hide it.`
              : `Position ${li + 1} of word ${wi + 1} — hidden. Tap to give ${letter} away as a starting letter.`,
            onClick: () => toggleAnchor(wi, li),
          }, on ? letter : "");
        }),
      ),
    ));
  });

  const previewHint = h("small", { "data-bn-region": "hint" });
  bindText(previewHint, () => {
    if (words().length === 0) return "Type a phrase above, then pick its starting letters.";
    const n = anchorKeys().length;
    return `${n} starting letter${n === 1 ? "" : "s"} revealed (max ${anchorCap()}). Tap a tile to change it — every puzzle needs at least one.`;
  });

  /* Error output. */
  const errBox = h("output", {
    "data-bn-region": "error",
    role: "alert",
    "data-bn-bind": "submit-error",
  });
  bindText(errBox, () => err() || "");
  bindHidden(errBox, () => !err());

  /* Phrase input. */
  const phraseInput = h("input", {
    id: "submit-phrase",
    name: "phrase",
    "data-bn-region": "input",
    autocapitalize: "characters",
    autocorrect: "off",
    spellcheck: "false",
    placeholder: "2–10 words · letters only",
    "aria-describedby": "submit-phrase-hint",
    onInput: (e) => phrase.set(e.target.value),
  });

  const submitBtn = h("button", {
    type: "submit",
    "data-bn-button": "primary",
    "data-bn-action": "submit-confirm",
  });
  bindText(submitBtn, () => busy() ? "…" : "SUBMIT FOR REVIEW");
  bindDisabled(submitBtn, () => busy() || !category() || !phrase() || anchorKeys().length === 0);

  const cancelBtn = h("button", {
    type: "button",
    "data-bn-button": "secondary",
    "data-bn-action": "submit-cancel",
    onClick: onCancel,
  }, "Cancel");

  const form = h("form", {
    "data-bn-region": "form",
    "data-bn-action": "submit-form",
    "aria-describedby": "submit-hint",
    novalidate: "",
    onSubmit: submit,
  },
    h("fieldset", null,
      h("legend", null, "New round"),
      h("p", { "data-bn-region": "field" },
        // @basenative/combobox renders its actual <input> as
        // "${id}-input" (`submit-category` is just the wrapper <span>'s
        // id) — point the label there directly instead of duplicating a
        // second <label> via the component's own `label` option, so the
        // combobox has a real accessible name instead of axe's
        // label-title-only (the wrapper <div>/<span> isn't a labelable
        // element).
        h("label", { for: "submit-category-input" }, "Category"),
        cbWrapper,
        catHint,
      ),
      h("p", { "data-bn-region": "field" },
        h("label", { for: "submit-phrase" }, "Phrase"),
        phraseInput,
        phraseHint,
      ),
      h("p", { "data-bn-region": "field" },
        h("span", { "data-bn-region": "flabel" }, "Starting letters"),
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
      h("p", { "data-bn-region": "sticky", "data-bn-variant": "narrow" }, "Submit a phrase"),
      h("p", { "data-bn-region": "tagline" }, "It enters the moderation queue"),
    ),
    form,
  );
}
