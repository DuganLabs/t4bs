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
import { LETTER_LAYOUT } from "../lib/keyboard-layout.js";
import { confetti } from "../lib/confetti.js";

const FIRST_TIP = "Tap a letter to turn it over — every one you use is ten points off. Know the phrase? Solve it.";

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
  /* The coach line under the board. It is ALSO the screen-reader
     announcement: one visible, aria-live sentence that says what just
     happened and what the next tap costs, so sighted and non-sighted
     players read the same game. */
  const announcement = signal(FIRST_TIP);
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
        if (r.finished) return;                       // the end card says the rest
        announcement.set(coachAfterHit(ch, r));
      } else {
        shakeMiss.set(true);
        setTimeout(() => shakeMiss.set(false), 400);
        if (!r.finished) announcement.set(coachAfterMiss(ch, r));
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
        announcement.set(r.lives === 1
          ? "Not it — that cost a life, and it was the second-to-last. Nothing revealed."
          : `Not it — one life spent, nothing revealed. ${r.lives} of ${LIVES_MAX} left; the number under Solve hasn't moved.`);
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

  /* What the coach says. The number under Solve is the whole game, so
     every line ends by pointing at it. */
  function coachAfterHit(ch, r) {
    const n = r.positions.length;
    const tiles = `${n} tile${n === 1 ? "" : "s"}`;
    if (r.hiddenCount === 0) return `${ch}: ${tiles}. Every letter is showing — solve it to bank your lives.`;
    if (r.scoreIfSolved <= r.par) return `${ch}: ${tiles}. ${r.hiddenCount} still hidden. You're under par now — solving beats revealing.`;
    return `${ch}: ${tiles}. ${r.hiddenCount} still hidden — solve now for ${r.scoreIfSolved}, or turn over another for ten less each.`;
  }
  function coachAfterMiss(ch, r) {
    if (r.lives === 1) return `${ch} isn't in it. Last life — one more miss ends the round.`;
    return `${ch} isn't in it. ${r.lives} of ${LIVES_MAX} lives left; nothing revealed, score untouched.`;
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
  const coachEl = h("p", {
    "aria-live": "polite", "aria-atomic": "true",
    "data-bn-region": "coach",
  });
  bindText(coachEl, announcement);
  bindHidden(coachEl, () => !playing());

  const titleEl = h("h1", { id: "play-title", class: "sr-only" });
  bindText(titleEl, () => {
    const s = session();
    if (!s) return "Loading…";
    return s.mode === "daily" ? `Today's puzzle — ${s.category}` : `${s.category} — preview`;
  });

  const stickyEl = h("p", { "data-bn-region": "play-sticky", "aria-hidden": "true" });
  bindText(stickyEl, () => session()?.category || "");

  const metaEl = h("p", { "data-bn-region": "play-meta" });
  bindText(metaEl, () => {
    const s = session();
    if (!s?.words) return "";
    return `${s.words.length} words · ${s.totalLetters} letters · par ${s.par} · by ${s.submittedBy || "?"}`;
  });

  const summary = h("header", { "data-bn-region": "play-summary" }, stickyEl, metaEl);

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

  /* ── DOM: scoreboard — lives, the number under Solve, par ──────────── */
  const livesEl = h("span", { "data-bn-region": "lives" });
  effect(() => {
    const n = session()?.lives ?? 0;
    livesEl.replaceChildren(...Array.from({ length: LIVES_MAX }, (_, i) =>
      h("i", { "aria-hidden": "true", "data-lost": i >= n ? "" : null }, "♥")));
    livesEl.setAttribute("aria-label", `${n} of ${LIVES_MAX} lives`);
  });

  /* "Solve now for N" is the one number the game is about: it starts at
     the puzzle's maximum and drops ten per tile turned over, and the
     decision every turn is whether to take it or spend it. Big, tabular,
     in the middle of the strip. */
  const nowLabel = h("small");
  const nowNum   = h("strong");
  bindText(nowLabel, () => over() ? "Scored" : "Solve now for");
  bindText(nowNum, () => {
    const s = session();
    if (!s) return "";
    return String(over() ? s.score : s.scoreIfSolved);
  });
  const nowEl = h("span", { "data-bn-region": "now" }, nowLabel, nowNum);
  bindAttr(nowEl, "data-under-par", () => {
    const s = session();
    return s && !over() && s.scoreIfSolved <= s.par ? "" : null;
  });

  const parNum = h("strong");
  bindText(parNum, () => String(session()?.par ?? ""));
  const parEl = h("span", { "data-bn-region": "par" }, h("small", null, "Par"), parNum);

  const scoreboard = h("p", { "data-bn-region": "scoreboard", role: "status" },
    livesEl, nowEl, parEl);

  const solveBtn = bnButton("Solve", {
    variant: "primary",
    attrs: 'data-bn-action="solve"',
    onClick: openSolve,
  });
  effect(() => { solveBtn.disabled = !playing() || busy(); });
  const solveWrap = h("div", { "data-bn-region": "solve" }, solveBtn);
  bindHidden(solveWrap, () => !playing());

  /* ── DOM: keyboard — letters only, see lib/keyboard-layout.js ──────── */
  const keyStatus = computed(() => keyStateFor(session()));
  const kb = Keyboard({
    id: "play-kb",
    layout: LETTER_LAYOUT,
    label: "Letters",
    state: keyStatus,
    runtime: { effect },
    onKey: guess,
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
       accessible name has to say the same thing the colour does. A tried
       key is final either way, so it also leaves the tab order. */
    const charKeys = root.querySelectorAll('[data-bn-kb-key][data-kb-type="char"]');
    effect(() => {
      const map = keyStatus();
      const live = playing();
      charKeys.forEach((btn) => {
        const letter = btn.dataset.kbKey;
        const info = KEY_STATE_INFO[map[letter]];
        btn.setAttribute("aria-label", info ? `${letter}, ${info.ariaSuffix}` : `${letter}`);
        btn.disabled = !live || !!info;
      });
    });
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
  const endPrimary   = bnButton("Done",         { variant: "secondary", attrs: 'data-bn-action="primary"' });
  const endSecondary = bnButton("Done",         { variant: "secondary", attrs: 'data-bn-action="secondary"' });

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
  /* The daily is one attempt, so its only way out is "done"; a preview
     round that was lost can be replayed. */
  bindText(endPrimary, () => {
    if (session()?.mode === "daily") return "Done for today";
    return phase() === "won" ? "Done" : "Try again";
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
  /* The daily is played on the home page; a preview round is played on
     /play. Same tree, different landmark name and skin. */
  const isDaily = () => session()?.mode === "daily";
  const previewNote = h("p", { "data-bn-region": "preview-note" }, "Preview · does not count toward a streak");
  bindHidden(previewNote, isDaily);
  const dayLabel = h("p", { "data-bn-region": "day-label" });
  bindText(dayLabel, () => session()?.day ? `Today · ${session().day}` : "Today");
  bindHidden(dayLabel, () => !isDaily());

  const main = h("main", { "aria-labelledby": "play-title" },
    titleEl, dayLabel, previewNote, summary, grid, scoreboard, coachEl, solveWrap, keyboard, solveSheet, endOverlay,
  );
  bindAttr(main, "data-bn-view", () => isDaily() ? "home" : "play");
  return main;
}
