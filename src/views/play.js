/* PLAY view, v2 — the board, the keyboard, the Solve sheet, the end card.

   Semantic mirror of src/bn/views/play.js (SSR): <main data-bn-view="play">
   with <header data-bn-region="play-summary">, <section
   data-bn-region="grid">, <p data-bn-region="status">, <section
   data-bn-region="keyboard">, plus two client-only <dialog>s — the Solve
   sheet and the end-of-round card.

   There is no client game state. `session` is the server's last view of
   the round (lib/session-state.js) and every tap is a round-trip that
   replaces it. The board is a pure function of that view, rebuilt in one
   effect with replaceChildren — the same pattern the v1 grid used, kept
   because a per-tile subscription leaks the moment the word count changes.

   Two rules the tests hold this file to: it binds no touch handler of its
   own (@basenative/keyboard owns touch, and doing it twice typed two
   letters per tap), and it never synthesizes a click on a key. */

import { signal, computed, effect } from "@basenative/runtime";
import { Keyboard } from "@basenative/keyboard";
import { renderCard, renderDialog } from "@basenative/components";
import { bnButton, fromHTML, h } from "../lib/dom.js";
import { bindAttr, bindHidden, bindText } from "../lib/bind.js";
import { api } from "../lib/api.js";
import { keyStateFor, KEY_STATE_INFO } from "../lib/game.js";
import { confetti } from "../lib/confetti.js";

const LIVES_MAX = 5;

export function createPlay({
  session,
  phase,
  apply,
  toaster,
  onResultRecorded,
  onDailyUpdate,
  onShare,
  goLobby,
  retry,
}) {
  const busy         = signal(false);
  const justHit      = signal(null);     // letter that just turned over, for the flip
  const shakeMiss    = signal(false);
  const shareLbl     = signal(null);
  const announcement = signal("");
  const dailyAfter   = signal(null);
  let resultRecorded = false;

  const playing = computed(() => phase() === "playing");
  const over    = computed(() => phase() === "won" || phase() === "lost");

  /* ── moves ─────────────────────────────────────────────────────────── */

  async function guess(letter) {
    const s = session();
    if (!s || !playing() || busy()) return;
    const ch = String(letter).toUpperCase();
    if (s.revealed.includes(ch) || s.missed.includes(ch)) return;
    busy.set(true);
    try {
      const r = await api.letter(s.sessionId, ch);
      settle(r);
      if (r.repeat) return;
      if (r.hit) {
        justHit.set(ch);
        setTimeout(() => justHit.set(null), 500);
        announcement.set(`${ch}: ${r.positions.length} tile${r.positions.length === 1 ? "" : "s"}. ${r.hiddenCount} still hidden — solve now for ${r.scoreIfSolved}.`);
      } else {
        shakeMiss.set(true);
        setTimeout(() => shakeMiss.set(false), 400);
        announcement.set(`${ch} is not in the phrase. ${r.lives} of ${LIVES_MAX} lives left.`);
        if (navigator.vibrate) navigator.vibrate(60);
      }
    } catch (e) {
      toaster(friendly(e), "bad");
    } finally {
      busy.set(false);
    }
  }

  async function solve(text) {
    const s = session();
    if (!s || !playing() || busy()) return;
    const attempt = String(text || "").trim();
    if (!attempt) { toaster("TYPE THE PHRASE FIRST", "bad"); return; }
    busy.set(true);
    try {
      const r = await api.solve(s.sessionId, attempt);
      settle(r);
      if (r.correct) {
        announcement.set(`Solved with ${r.hiddenAtSolve} of ${r.totalLetters} letters still hidden. ${r.score} points, par ${r.par}.`);
      } else if (r.finished === "lost") {
        announcement.set("Not it, and that was the last life. Round over.");
      } else {
        toaster(`NOT IT · ${r.lives} ${r.lives === 1 ? "LIFE" : "LIVES"} LEFT`, "bad");
        announcement.set(`Not it. One life. ${r.lives} of ${LIVES_MAX} left, nothing revealed.`);
        if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      }
    } catch (e) {
      toaster(friendly(e), "bad");
    } finally {
      busy.set(false);
    }
  }

  /** Every server response is the whole round; make it current. */
  function settle(r) {
    apply(r);
    if (r.daily) { dailyAfter.set(r.daily); onDailyUpdate?.(r.daily); }
  }

  function friendly(e) {
    const code = e?.data?.error || e?.message || "";
    if (code === "no-session" || code === "puzzle-gone") return "THAT ROUND IS GONE — PICK ANOTHER";
    if (code === "finished") return "THIS ROUND IS OVER";
    return "COULDN'T REACH THE SERVER — TRY AGAIN";
  }

  /* ── result recording (once) ───────────────────────────────────────── */
  effect(() => {
    const p = phase();
    if (resultRecorded || (p !== "won" && p !== "lost")) return;
    resultRecorded = true;
    const s = session();
    onResultRecorded(p === "won", s?.score ?? 0, s?.category, s?.mode || "free");
    if (p === "won") { confetti(); if (navigator.vibrate) navigator.vibrate([40, 40, 80]); }
    else if (navigator.vibrate) navigator.vibrate(200);
  });

  /* ── physical keyboard: letters guess, Enter opens Solve ───────────── */
  effect(() => {
    if (!playing()) return;
    const onKey = (e) => {
      if (solveSheet.open || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[a-zA-Z]$/.test(e.key)) { e.preventDefault(); guess(e.key); }
      else if (e.key === "Enter") { e.preventDefault(); openSolve(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ── DOM: header ───────────────────────────────────────────────────── */
  const announceEl = h("output", {
    class: "sr-only", "aria-live": "polite", "aria-atomic": "true",
    "data-bn-region": "play-announce",
  });
  bindText(announceEl, announcement);

  const titleEl = h("h1", { id: "play-title", class: "sr-only" });
  bindText(titleEl, () => session() ? `${session().category} — round #${session().id}` : "Loading…");

  const stickyEl = h("p", { "data-bn-region": "play-sticky" });
  bindText(stickyEl, () => session()?.category || "");

  const metaEl = h("p", { "data-bn-region": "play-meta" });
  bindText(metaEl, () => {
    const s = session();
    if (!s?.words) return "";
    return `${s.words.length} words · ${s.totalLetters} letters · par ${s.par} · by ${s.submittedBy || "?"}`;
  });

  const summary = h("header", { "data-bn-region": "play-summary" }, titleEl, stickyEl, metaEl);

  /* ── DOM: board ────────────────────────────────────────────────────── */
  const grid = h("section", { "aria-label": "Phrase", "data-bn-region": "grid" });
  bindAttr(grid, "data-shake", () => shakeMiss() ? "" : null);

  effect(() => {
    const s = session();
    if (!s?.board) return;
    const anchors = new Set((s.anchors || []).map(a => `${a.wi}:${a.li}`));
    const hit = justHit();
    grid.replaceChildren(...s.board.map((row, wi) => {
      const word = h("div", { role: "group", "data-bn-region": "word", "aria-label": `Word ${wi + 1}, ${row.length} letters` });
      row.forEach((ch, li) => {
        const on = ch !== null;
        const props = { role: "img", "data-bn-region": "tile" };
        if (on) props["data-on"] = "";
        if (anchors.has(`${wi}:${li}`)) props["data-anchor"] = "";
        if (on && hit && ch === hit) props["data-just"] = "";
        if (over() && !s.revealed.includes(ch)) props["data-unearned"] = "";
        props["aria-label"] = on
          ? `${ch}, position ${li + 1} of word ${wi + 1}${over() && !s.revealed.includes(ch) ? ", never revealed" : ""}`
          : `hidden, position ${li + 1} of word ${wi + 1}`;
        word.append(h("span", props, on ? ch : ""));
      });
      return word;
    }));
  });

  /* ── DOM: status line — lives, the number under the button, par ────── */
  const livesEl = h("span", { "data-bn-region": "lives" });
  effect(() => {
    const n = session()?.lives ?? 0;
    livesEl.replaceChildren(...Array.from({ length: LIVES_MAX }, (_, i) =>
      h("i", { "aria-hidden": "true", "data-lost": i >= n ? "" : null }, "●")));
    livesEl.setAttribute("aria-label", `${n} of ${LIVES_MAX} lives`);
  });

  const nowEl = h("span", { "data-bn-region": "now" });
  bindText(nowEl, () => {
    const s = session();
    if (!s) return "";
    if (over()) return `${s.score} pts · par ${s.par}`;
    return `Solve now for ${s.scoreIfSolved} · par ${s.par}`;
  });

  const solveBtn = bnButton("Solve", {
    variant: "primary",
    attrs: 'data-bn-action="solve"',
    onClick: openSolve,
  });
  effect(() => { solveBtn.disabled = !playing() || busy(); });

  const status = h("p", { "data-bn-region": "status", role: "status", "aria-live": "polite" },
    livesEl, nowEl, solveBtn);

  /* ── DOM: keyboard ─────────────────────────────────────────────────── */
  const keyStatus = computed(() => keyStateFor(session()));
  const kb = Keyboard({
    layout: "qwerty",
    primary: "ENTER",
    label: "Letters",
    state: keyStatus,
    runtime: { effect },
    onKey: guess,
    onAction: (a) => { if (a === "ENTER") openSolve(); },
    haptic: true,
    bindHardware: false,
  });
  const kbHost = h("div", { html: kb.html });
  const keyboard = h("section", { "data-bn-region": "keyboard" }, kbHost);
  bindHidden(keyboard, () => !playing());

  queueMicrotask(() => {
    const root = kbHost.querySelector('[data-bn="keyboard"]');
    if (!root) return;
    kb.hydrate(root);
    /* The package only toggles classes when `state` changes; the
       accessible name has to say the same thing the colour does. */
    const charKeys = root.querySelectorAll('[data-bn-kb-key][data-kb-type="char"]');
    effect(() => {
      const map = keyStatus();
      charKeys.forEach((btn) => {
        const letter = btn.dataset.kbKey;
        const info = KEY_STATE_INFO[map[letter]];
        btn.setAttribute("aria-label", info ? `${letter}, ${info.ariaSuffix}` : `${letter}`);
        btn.disabled = !!info;
      });
    });
    const enter = root.querySelector('[data-bn-kb-key="ENTER"]');
    if (enter) { enter.textContent = "SOLVE"; enter.setAttribute("aria-label", "Solve the phrase"); }
  });

  /* ── DOM: the Solve sheet ──────────────────────────────────────────── */
  const solveInput = h("input", {
    type: "text",
    name: "phrase",
    autocomplete: "off",
    autocapitalize: "characters",
    autocorrect: "off",
    spellcheck: "false",
    enterkeyhint: "go",
    "aria-label": "The whole phrase",
    "data-bn-region": "solve-input",
  });
  const solveShape = h("p", { "data-bn-region": "solve-shape" });
  bindText(solveShape, () => {
    const s = session();
    if (!s?.board) return "";
    return s.board.map(row => row.map(ch => ch ?? "_").join("")).join("  ");
  });
  const solveCost = h("p", { "data-bn-region": "solve-cost" });
  bindText(solveCost, () => {
    const s = session();
    if (!s) return "";
    return `Right: ${s.scoreIfSolved} points. Wrong: one life, nothing revealed.`;
  });
  const solveForm = h("form", { "data-bn-region": "solve-form", novalidate: "" },
    solveShape, solveInput, solveCost,
    h("div", { "data-bn-region": "solve-actions" },
      bnButton("Keep guessing", { variant: "secondary", type: "button", attrs: 'data-bn-action="keep"', onClick: closeSolve }),
      bnButton("Solve it", { variant: "primary", type: "submit", attrs: 'data-bn-action="solve-go"' }),
    ),
  );
  solveForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = solveInput.value;
    closeSolve();
    await solve(text);
  });

  const solveSheet = /** @type {HTMLDialogElement} */ (fromHTML(renderDialog({
    id: "play-solve",
    title: "Solve the phrase",
    modal: true,
    closable: true,
    attrs: 'data-bn-region="solve-sheet"',
  })));
  solveSheet.querySelector('[data-bn="dialog-body"]').append(solveForm);

  function openSolve() {
    if (!playing() || busy() || solveSheet.open) return;
    solveInput.value = "";
    solveSheet.showModal();
    queueMicrotask(() => solveInput.focus());
  }
  function closeSolve() { if (solveSheet.open) solveSheet.close(); }

  /* ── DOM: end of round ─────────────────────────────────────────────── */
  const endTitle  = h("h2", { id: "play-end-title", "data-bn-region": "title" });
  const endSub    = h("p", { "data-bn-region": "subtitle" });
  const endReveal = h("p", { "data-bn-region": "reveal" });
  const endHow    = h("p", { "data-bn-region": "how" });
  const endMode   = h("p", { "data-bn-region": "end-mode" });
  const endScore  = h("output", { "data-bn-region": "end-score" });
  const endPar    = h("p", { "data-bn-region": "score-label" });
  const endBy     = h("strong");
  const endCredit = h("p", { "data-bn-region": "credit" }, "submitted by ", endBy);
  const endShare     = bnButton("Share result", { variant: "primary",   attrs: 'data-bn-action="share"' });
  const endPrimary   = bnButton("Pick another", { variant: "secondary", attrs: 'data-bn-action="primary"' });
  const endSecondary = bnButton("Pick another", { variant: "secondary", attrs: 'data-bn-action="secondary"' });

  bindText(endTitle, () => phase() === "won" ? (session()?.hiddenCount === 0 ? "Revealed" : "Solved") : "House wins");
  bindAttr(endTitle, "data-tone", () => phase() === "won" ? "win" : "lose");
  bindText(endSub, () => `${session()?.category || ""}${phase() === "lost" ? " · it was" : ""}`);
  bindText(endReveal, () => (session()?.reveal || []).join(" "));
  bindText(endHow, () => {
    const s = session();
    if (!s || phase() !== "won") return "";
    const hidden = s.hiddenAtSolve ?? s.hiddenCount ?? 0;
    if (hidden === 0) return `Every letter turned over — ${s.lives} ${s.lives === 1 ? "life" : "lives"} kept.`;
    return `Solved with ${hidden} of ${s.totalLetters} letters still hidden · ${s.lives} ${s.lives === 1 ? "life" : "lives"} kept.`;
  });
  bindText(endMode, () => {
    const d = dailyAfter();
    if (d) {
      const n = d.streak || 0;
      return n > 0 ? `Daily ${d.day} · streak 🔥${n}` : `Daily ${d.day} · streak reset`;
    }
    return session()?.mode === "daily" ? "Daily" : "Free play · streak untouched";
  });
  bindText(endScore, () => String(session()?.score ?? 0));
  bindAttr(endScore, "aria-label", () => `Final score ${session()?.score ?? 0} points`);
  bindText(endPar, () => {
    const s = session();
    if (!s) return "points";
    const d = (s.score ?? 0) - (s.par ?? 0);
    if (phase() !== "won") return `points · par ${s.par}`;
    if (d > 0) return `points · ${d} over par`;
    if (d === 0) return "points · par";
    return `points · ${-d} under par`;
  });
  bindText(endBy, () => session()?.submittedBy || "?");
  bindText(endShare, () => shareLbl() || "Share result");
  bindText(endPrimary, () => {
    if (phase() === "won") return "Pick another";
    return session()?.mode === "daily" ? "Back to lobby" : "Try again";
  });
  bindHidden(endSecondary, () => phase() !== "lost" || session()?.mode === "daily");

  endShare.addEventListener("click", () => {
    onShare({ won: phase() === "won" }).then(label => shareLbl.set(label));
  });
  endPrimary.addEventListener("click", () => {
    if (phase() === "won" || session()?.mode === "daily") goLobby();
    else retry();
  });
  endSecondary.addEventListener("click", goLobby);

  const endCard = fromHTML(renderCard());
  endCard.setAttribute("role", "document");
  endCard.querySelector('[data-bn="card-body"]').append(
    endTitle, endSub, endReveal, endHow, endCredit, endMode,
    endScore, endPar,
    endShare, endSecondary, endPrimary,
  );

  const endOverlay = /** @type {HTMLDialogElement} */ (fromHTML(renderDialog({
    id: "play-end",
    modal: true,
    closable: false,
    attrs: 'data-bn-region="end-overlay"',
  })));
  endOverlay.setAttribute("aria-labelledby", "play-end-title");
  endOverlay.querySelector('[data-bn="dialog-body"]').append(endCard);
  /* The round is over and every way forward is inside this dialog. */
  endOverlay.addEventListener("cancel", (e) => e.preventDefault());

  effect(() => {
    const open = over() && !!session()?.reveal;
    if (open && !endOverlay.open) {
      closeSolve();
      /* Let the last tile flip land before the card covers it. */
      setTimeout(() => { if (!endOverlay.open && endOverlay.isConnected) endOverlay.showModal(); }, 700);
    } else if (!open && endOverlay.open) {
      endOverlay.close();
    }
  });

  /* ── Root <main>: same shape as src/bn/views/play.js SSR template ──── */
  return h("main", { "aria-labelledby": "play-title", "data-bn-view": "play" },
    announceEl, summary, grid, status, keyboard, solveSheet, endOverlay,
  );
}
