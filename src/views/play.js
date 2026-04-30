/* PLAY view — semantic, signal-driven mirror of src/bn/views/play.js (SSR).

   Same shape the SSR template produces (<main data-bn-view="play"> with
   <header data-bn-region="play-summary">, <section data-bn-region="grid">,
   <section data-bn-region="bank">, <section data-bn-region="keyboard">,
   <dialog data-bn-region="end-overlay">). The bind helpers in lib/bind.js
   wire signals into the existing nodes — no class-soup div builders, no
   imperative children-replace except for the phrase grid and letter bank
   where the cell count is inherently dynamic. */

import { signal, computed, effect } from "@basenative/runtime";
import { Keyboard } from "@basenative/keyboard";
import { h } from "../lib/dom.js";
import { bindAttr, bindHidden, bindText } from "../lib/bind.js";
import { api } from "../lib/api.js";
import { openSlots, fullCount, computeKeyStatus } from "../lib/game.js";
import { confetti } from "../lib/confetti.js";

export function createPlay({
  session,
  locked,
  presentGlobal,
  absentByWord,
  wordSolved,
  posFeedback,
  score,
  lives,
  tokens,
  phase,
  reveal,
  toaster,
  onResultRecorded,
  onShare,
  goLobby,
  retry,
}) {
  /* ── per-round UI signals ──────────────────────────────────────────── */
  const active     = signal(null);
  const s0         = session.peek() || { words: [] };
  const typed      = signal(s0.words.map(() => []));
  const wagers     = signal(s0.words.map(() => []));
  const allInMode  = signal(false);
  const casc       = signal(false);
  const feedback   = signal({});       // wi -> [{idx, letter, status}]
  const shaking    = signal(null);
  const cascDrop   = signal(null);
  const shareLbl   = signal(null);
  const announcement = signal("");
  let resultRecorded = false;

  /* ── derived ───────────────────────────────────────────────────────── */
  const keyStatus = computed(() => computeKeyStatus({
    session: session(),
    locked: locked(),
    presentGlobal: presentGlobal(),
    absentByWord: absentByWord(),
  }));

  const hintText = computed(() => {
    if (casc()) return "Cascade active. Tap any unrevealed tile in any unsolved word to reveal it.";
    if (phase() !== "playing") return "";
    if (active() === null) return "";
    const s = session();
    if (!s?.words) return "";
    const slots = openSlots(s.words[active()], locked()[active()] || {});
    const room = slots.length - (typed()[active()]?.length || 0);
    if (room === 0) return "Word complete. Press enter to submit or tap a tile to stake 2× points.";
    return `Type ${room} more letter${room === 1 ? "" : "s"} for word ${active() + 1}.`;
  });

  const cbarText = computed(() => {
    if (casc()) return "⚡ Earned reveal — pick any tile in any unsolved word";
    if (allInMode()) return `ALL IN — type the rest of the phrase · SHOVE to commit · +${allInBonus()} pts if right · 0 lives if wrong`;
    return "";
  });

  const allInBonus = computed(() => {
    const s = session();
    if (!s?.words) return 0;
    return fullCount(s.words, locked()) * 8;
  });

  const stakeText = computed(() => {
    const wagerCount = allInMode()
      ? wagers().reduce((acc, w) => acc + (w?.length || 0), 0)
      : (active() !== null ? (wagers()[active()]?.length || 0) : 0);
    if (wagerCount > 0) return `${wagerCount}× STAKED`;
    if (allInMode()) return "TYPE THE REST";
    return "";
  });

  /* ── effects: word focus + result recording ───────────────────────── */
  effect(() => {
    if (phase() !== "playing" || casc()) return;
    const ws = wordSolved();
    const a = active();
    if (a === null || ws[a]) {
      const next = ws.findIndex(s => !s);
      if (next !== -1) active.set(next);
    }
  });

  effect(() => {
    const p = phase();
    if (resultRecorded) return;
    if (p === "won" || p === "lost") {
      onResultRecorded(p === "won", score(), session()?.category);
      resultRecorded = true;
      if (p === "won") {
        confetti();
        announcement.set(`You won! Final score ${score()} points.`);
      } else {
        announcement.set(`Game over. Final score ${score()} points.`);
      }
      if (navigator.vibrate) navigator.vibrate(p === "won" ? [40, 40, 80] : 200);
    }
  });

  /* ── typing primitives ─────────────────────────────────────────────── */
  const findGlobalNextSlot = () => {
    const s = session();
    if (!s?.words) return null;
    for (let wi = 0; wi < s.words.length; wi++) {
      if (wordSolved()[wi]) continue;
      const slots = openSlots(s.words[wi], locked()[wi] || {});
      if ((typed()[wi]?.length || 0) < slots.length) return { wi, slotIdx: typed()[wi]?.length || 0 };
    }
    return null;
  };

  const typeLetter = (letter) => {
    if (phase() !== "playing" || casc()) return;
    if (allInMode()) {
      const next = findGlobalNextSlot();
      if (!next) return;
      typed.set(prev => prev.map((t, i) => i !== next.wi ? t : [...t, letter]));
      return;
    }
    const a = active();
    if (a === null) return;
    if (wordSolved()[a]) return;
    const s = session();
    if (!s?.words) return;
    const slots = openSlots(s.words[a], locked()[a] || {});
    if ((typed()[a]?.length || 0) >= slots.length) return;
    typed.set(prev => prev.map((t, i) => i !== a ? t : [...t, letter]));
  };

  const backspace = () => {
    if (phase() !== "playing" || casc()) return;
    if (allInMode()) {
      const t = typed();
      const s = session();
      if (!s?.words) return;
      for (let wi = s.words.length - 1; wi >= 0; wi--) {
        if ((t[wi]?.length || 0) > 0) {
          typed.set(prev => prev.map((row, i) => i !== wi ? row : row.slice(0, -1)));
          wagers.set(prev => prev.map((w, i) => i !== wi ? w : w.filter(s => s < (t[wi].length - 1))));
          return;
        }
      }
      return;
    }
    const a = active();
    if (a === null) return;
    if (wordSolved()[a]) return;
    typed.set(prev => prev.map((row, i) => i !== a ? row : row.slice(0, -1)));
    wagers.set(prev => prev.map((w, i) => i !== a ? w : w.filter(s => s < (typed()[a].length - 1))));
  };

  const enter = () => {
    if (allInMode()) { submitAllIn(); return; }
    const a = active();
    if (a === null) return;
    submit(a);
  };

  const toggleWager = (wi, slotIdx) => {
    if (phase() !== "playing" || casc() || wi !== active()) return;
    if (slotIdx >= typed()[wi].length) return;
    wagers.set(prev => prev.map((w, i) => {
      if (i !== wi) return w;
      return w.includes(slotIdx) ? w.filter(s => s !== slotIdx) : [...w, slotIdx];
    }));
  };

  /* ── submit one word ──────────────────────────────────────────────── */
  async function submit(wi) {
    if (phase() !== "playing" || casc() || wordSolved()[wi]) return;
    const s = session();
    if (!s?.words) return;
    const wordLen = s.words[wi];
    const lm = locked()[wi] || {};
    const slots = openSlots(wordLen, lm);
    if (typed()[wi].length < slots.length) {
      shaking.set(wi); setTimeout(() => shaking.set(null), 480);
      return;
    }
    try {
      const result = await api.guess(s.sessionId, wi, typed()[wi], wagers()[wi]);
      const fullGuess = [];
      for (let i = 0; i < wordLen; i++) {
        if (lm[i] !== undefined) fullGuess.push(lm[i]);
        else fullGuess.push(typed()[wi][slots.indexOf(i)]);
      }
      const fb = result.feedback.map((status, idx) => ({ idx, letter: fullGuess[idx], status }));
      feedback.set(prev => ({ ...prev, [wi]: fb }));
      locked.set(prev => prev.map((m, i) => i !== wi ? m : { ...result.locked }));
      presentGlobal.set(result.presentGlobal);
      absentByWord.set(prev => prev.map((row, i) => i !== wi ? row : result.absentByWord));
      posFeedback.set(prev => {
        const RANK = { green: 3, yellow: 2, absent: 1 };
        const next = prev.map(row => row.slice());
        result.feedback.forEach((status, idx) => {
          const cur = next[wi]?.[idx];
          if ((RANK[status] || 0) > (RANK[cur] || 0)) next[wi][idx] = status;
        });
        return next;
      });
      score.set(result.score);
      lives.set(result.lives);
      tokens.set(result.tokens);
      typed.set(prev => prev.map((t, i) => i !== wi ? t : []));
      wagers.set(prev => prev.map((w, i) => i !== wi ? w : []));

      const won = result.feedback.every(st => st === "green");
      if (won) {
        wordSolved.set(prev => prev.map((v, i) => i !== wi ? v : true));
        active.set(null);
        announcement.set(`Correct! Word ${wi + 1} solved. ${result.lives} lives remaining.`);
        toaster(`+${result.scoreDelta}pts`, "great");
        if (result.cascadeEarned) {
          setTimeout(() => {
            casc.set(true);
            announcement.set("Cascade earned! Tap any unrevealed tile to reveal it.");
          }, 600);
        }
      } else {
        shaking.set(wi); setTimeout(() => shaking.set(null), 480);
        announcement.set(`Incorrect. ${result.lives} lives remaining.`);
        toaster(`${result.scoreDelta}pts`, "bad");
      }
      setTimeout(() => {
        feedback.set(prev => { const n = { ...prev }; delete n[wi]; return n; });
        if (result.finished) {
          phase.set(result.finished);
          reveal.set(result.reveal);
        }
      }, 1100);
    } catch (e) {
      toaster(`error: ${String(e.message || e)}`, "bad");
    }
  }

  async function pickCascade(wi, li) {
    if (!casc() || tokens() <= 0 || wordSolved()[wi]) return;
    if ((locked()[wi] || {})[li] !== undefined) return;
    const s = session();
    if (!s) return;
    try {
      const result = await api.cascade(s.sessionId, wi, li);
      locked.set(prev => prev.map((m, i) => i !== wi ? m : { ...result.locked }));
      tokens.set(result.tokens);
      presentGlobal.set(result.presentGlobal);
      cascDrop.set(`${wi}-${li}`);
      setTimeout(() => cascDrop.set(null), 600);
      casc.set(false);
      active.set(wi);
      announcement.set(`Free letter revealed in word ${wi + 1}. ${result.tokens} tokens remaining.`);
      toaster("⚡ FREE LETTER", "cascade");
    } catch (e) {
      toaster(`error: ${String(e.message || e)}`, "bad");
    }
  }

  function openAllIn() {
    if (allInMode()) {
      allInMode.set(false);
      announcement.set("Fold. Returned to normal play.");
      return;
    }
    const s = session();
    if (!s?.words) return;
    typed.set(s.words.map(() => []));
    wagers.set(s.words.map(() => []));
    active.set(null);
    allInMode.set(true);
    announcement.set("All-in mode. Type the rest of the phrase to shove.");
  }

  async function submitAllIn() {
    const s = session();
    if (!s?.words || !allInMode()) return;
    const guesses = s.words.map((len, wi) => {
      const lm = locked()[wi] || {};
      const slots = openSlots(len, lm);
      let str = "";
      for (let i = 0; i < len; i++) {
        if (lm[i] !== undefined) str += lm[i];
        else {
          const idx = slots.indexOf(i);
          str += typed()[wi][idx] || "";
        }
      }
      return str;
    });
    if (guesses.some((g, i) => g.length !== s.words[i])) {
      toaster("FINISH TYPING THE PHRASE", "bad");
      announcement.set("Please finish typing the entire phrase before submitting.");
      return;
    }
    try {
      const result = await api.allIn(s.sessionId, guesses);
      allInMode.set(false);
      score.set(result.score);
      lives.set(result.lives);
      if (result.correct) {
        wordSolved.set(s.words.map(() => true));
        locked.set(s.words.map((len, wi) => {
          const m = {};
          for (let i = 0; i < len; i++) m[i] = result.reveal[wi][i];
          return m;
        }));
        posFeedback.set(s.words.map(len => Array(len).fill("green")));
        announcement.set(`All-in correct! Phrase solved. Score increased by ${result.scoreDelta} points.`);
        toaster(`ALL-IN CORRECT  +${result.scoreDelta}pts`, "great");
      } else {
        announcement.set("All-in busted. Game over.");
        toaster("ALL-IN BUSTED — GAME OVER", "bad");
      }
      setTimeout(() => {
        if (result.finished) {
          phase.set(result.finished);
          reveal.set(result.reveal);
        }
      }, 900);
    } catch (e) {
      toaster(`error: ${String(e.message || e)}`, "bad");
    }
  }

  /* ── physical keyboard ────────────────────────────────────────────── */
  effect(() => {
    if (phase() !== "playing" || casc() || (active() === null && !allInMode())) return;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Enter") { e.preventDefault(); enter(); }
      else if (e.key === "Backspace") { e.preventDefault(); backspace(); }
      else if (/^[a-zA-Z]$/.test(e.key)) { e.preventDefault(); typeLetter(e.key.toUpperCase()); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  /* ── DOM build ────────────────────────────────────────────────────── */

  const announceEl = h("output", {
    class: "sr-only",
    "aria-live": "polite",
    "aria-atomic": "true",
    "data-bn-region": "play-announce",
  });
  bindText(announceEl, announcement);

  /* Header / summary — mirrors SSR <header data-bn-region="play-summary">. */
  const titleEl = h("h1", { id: "play-title", class: "sr-only" });
  bindText(titleEl, () => {
    const s = session();
    return s ? `${s.category} — round #${s.id}` : "Loading…";
  });

  const numEl = h("small", { "data-bn-bind": "num" });
  bindText(numEl, () => {
    const s = session();
    return s ? `#${s.id} · ${s.category.toLowerCase()}` : "";
  });

  const stickyEl = h("p", { "data-bn-region": "play-sticky" });
  bindText(stickyEl, () => session()?.category || "");

  const subBy = h("strong");
  bindText(subBy, () => session()?.submittedBy || "?");
  const subEl = h("p", { "data-bn-bind": "sub" });
  effect(() => {
    const s = session();
    if (!s?.words) { subEl.replaceChildren(); return; }
    subEl.replaceChildren(
      document.createTextNode(`${s.words.length} words · ${s.totalLetters} letters · by `),
      subBy,
    );
  });

  const hintEl = h("p", {
    role: "status",
    "aria-live": "polite",
    "data-bn-region": "play-hint",
  });
  bindText(hintEl, hintText);
  bindAttr(hintEl, "data-active", () => active() !== null ? "" : null);

  const cbarEl = h("p", {
    role: "status",
    "aria-live": "polite",
    "data-bn-region": "play-cbar",
  });
  bindText(cbarEl, cbarText);
  bindAttr(cbarEl, "data-allin", () => (allInMode() && !casc()) ? "" : null);
  bindHidden(cbarEl, () => !casc() && !allInMode());

  const summary = h("header", { "data-bn-region": "play-summary" },
    titleEl,
    h("p", { "data-bn-region": "play-meta" }, numEl),
    stickyEl,
    subEl,
    hintEl,
    cbarEl,
  );

  /* Phrase grid — single effect rebuilds on every relevant signal change.
     One effect (rather than per-tile effects) is the same pattern PB's
     bindList uses: when state changes, replaceChildren atomically.
     Avoids the leaked-effects bug that per-tile subscriptions would
     introduce when the session swaps to a different word count. */
  const grid = h("section", {
    "aria-label": "Phrase grid",
    "data-bn-region": "grid",
  });

  effect(() => {
    const s = session();
    const lockedAll = locked();
    if (!s?.words || lockedAll.length !== s.words.length) return;

    let allInNext = null;
    if (allInMode()) {
      for (let w = 0; w < s.words.length; w++) {
        if (wordSolved()[w]) continue;
        const ss = openSlots(s.words[w], lockedAll[w] || {});
        if ((typed()[w]?.length || 0) < ss.length) {
          allInNext = { wi: w, slotIdx: typed()[w]?.length || 0 };
          break;
        }
      }
    }

    const wordEls = s.words.map((wordLen, wi) => {
      const lm = lockedAll[wi] || {};
      const slots = openSlots(wordLen, lm);
      const isAct = !allInMode() && active() === wi && !wordSolved()[wi] && !casc();
      const wagerSet = new Set(wagers()[wi] || []);
      const fbW = feedback()[wi];

      const wordProps = {
        role: "group",
        "data-bn-region": "word",
        "aria-label": `Word ${wi + 1}`,
        "data-word-index": wi,
        onClick: () => {
          if (casc() || allInMode()) return;
          if (!wordSolved()[wi]) active.set(wi);
        },
      };
      if (isAct) wordProps["data-active"] = "";
      if (allInMode() && !wordSolved()[wi]) wordProps["data-allin"] = "";
      if (wordSolved()[wi]) wordProps["data-solved"] = "";
      if (shaking() === wi) wordProps["data-shake"] = "";
      if (casc() && !wordSolved()[wi]) wordProps["data-casc-on"] = "";

      const word = h("div", wordProps);

      for (let li = 0; li < wordLen; li++) {
        const lockedLetter = lm[li];
        const slotIdx = slots.indexOf(li);
        const typedLetter = slotIdx >= 0 ? (typed()[wi]?.[slotIdx] ?? null) : null;
        const fbForTile = fbW?.find(f => f.idx === li);
        const isCascDrop = cascDrop() === `${wi}-${li}`;
        const isCascPick = casc() && lockedLetter === undefined && !wordSolved()[wi];
        const isWagered = slotIdx >= 0 && wagerSet.has(slotIdx) && typedLetter;
        const isCursor = allInMode()
          ? (allInNext?.wi === wi && allInNext?.slotIdx === slotIdx)
          : (isAct && slotIdx === (typed()[wi]?.length || 0));

        const tileProps = {
          role: "img",
          "data-bn-region": "tile",
          "data-word-index": wi,
          "data-cell-index": li,
          onClick: (e) => {
            e.stopPropagation();
            if (isCascPick) { pickCascade(wi, li); return; }
            if ((isAct || allInMode()) && typedLetter) { toggleWager(wi, slotIdx); return; }
            if (!wordSolved()[wi] && !casc() && !allInMode()) active.set(wi);
          },
        };
        let display = "";
        if (wordSolved()[wi]) { tileProps["data-solved"] = ""; display = lockedLetter || ""; }
        else if (lockedLetter !== undefined) { tileProps["data-locked"] = ""; display = lockedLetter; }
        else if (typedLetter) {
          tileProps["data-typed"] = "";
          if (allInMode()) tileProps["data-allin-typed"] = "";
          display = typedLetter;
        } else if (isCursor) tileProps["data-cursor"] = "";

        if (fbForTile) {
          tileProps["data-feedback"] = fbForTile.status;
          tileProps["data-fb-flip"] = "";
          display = fbForTile.letter;
        }
        if (isWagered) tileProps["data-wagered"] = "";
        if (isCascPick) tileProps["data-casc-pick"] = "";
        if (isCascDrop) tileProps["data-casc-drop"] = "";

        const pos = `position ${li + 1} of word ${wi + 1}`;
        let label;
        if (wordSolved()[wi]) label = `${lockedLetter} at ${pos}, word solved`;
        else if (lockedLetter !== undefined) label = `${lockedLetter} at ${pos}, locked`;
        else if (typedLetter) {
          let state = "typed";
          if (isWagered) state += ", staked 2 times";
          if (isCursor) state += ", cursor here";
          label = `${typedLetter} at ${pos}, ${state}`;
        } else {
          label = `Empty at ${pos}`;
          if (isCursor) label += ", cursor here";
          if (isCascPick) label += ", cascade reveal available";
        }
        if (fbForTile) label = `${fbForTile.letter} at ${pos}, ${fbForTile.status}`;
        tileProps["aria-label"] = label;

        word.append(h("span", tileProps, display));
      }
      return word;
    });

    grid.replaceChildren(...wordEls);
  });

  /* Letter bank — present / absent chips. */
  const presentRow = h("p", { "data-bn-region": "bank-present" });
  effect(() => {
    const pg = presentGlobal();
    if (pg.length === 0) {
      presentRow.replaceChildren(
        h("span", { "data-bn-role": "label" }, "in phrase:"),
        h("span", { "data-bn-role": "label" }, "—"),
      );
      return;
    }
    presentRow.replaceChildren(
      h("span", { "data-bn-role": "label" }, "in phrase:"),
      ...pg.map(L => h("span", { "data-bn-chip": "yellow" }, L)),
    );
  });

  const absentRow = h("p", { "data-bn-region": "bank-absent" });
  effect(() => {
    const a = active();
    if (a === null) { absentRow.replaceChildren(); return; }
    const abs = absentByWord()[a] || [];
    if (abs.length === 0) { absentRow.replaceChildren(); return; }
    absentRow.replaceChildren(
      h("span", { "data-bn-role": "label" }, `not in word ${a + 1}:`),
      ...abs.map(L => h("span", { "data-bn-chip": "absent" }, L)),
    );
  });

  const bank = h("section", {
    "aria-label": "Letter bank",
    "data-bn-region": "bank",
  }, presentRow, absentRow);

  /* Keyboard region — @basenative/keyboard mounts here. */
  const kb = Keyboard({
    layout: "qwerty",
    primary: "ENTER",
    label: "On-screen keyboard",
    state: keyStatus,
    runtime: { effect },
    onKey: typeLetter,
    onAction: (a) => {
      if (a === "ENTER") enter();
      else if (a === "BACKSPACE") backspace();
    },
    haptic: true,
    bindHardware: false,
  });

  const allInBtn = h("button", {
    type: "button",
    "data-bn-action": "all-in",
    onClick: openAllIn,
  });
  bindText(allInBtn, () => allInMode() ? "FOLD" : "ALL IN");
  bindAttr(allInBtn, "aria-label", () => allInMode()
    ? "Fold and resume normal play mode"
    : "Enter all-in mode: type all remaining letters and submit for bonus points or lose all lives");
  bindAttr(allInBtn, "data-on", () => allInMode() ? "" : null);
  effect(() => {
    allInBtn.disabled = casc() && !allInMode();
  });

  const stakeLbl = h("output", {
    "aria-live": "polite",
    "data-bn-region": "stake-label",
  });
  bindText(stakeLbl, stakeText);
  bindAttr(stakeLbl, "aria-label", () => {
    const wagerCount = allInMode()
      ? wagers().reduce((acc, w) => acc + (w?.length || 0), 0)
      : (active() !== null ? (wagers()[active()]?.length || 0) : 0);
    if (wagerCount > 0) return `${wagerCount} positions staked for 2 times points`;
    if (allInMode()) return "Type the remaining letters of the phrase";
    return null;
  });

  const kbActions = h("footer", { "data-bn-region": "kb-actions" }, allInBtn, stakeLbl);
  const kbHost = h("div", { html: kb.html });

  const keyboard = h("section", {
    "aria-label": "On-screen keyboard",
    "data-bn-region": "keyboard",
  }, kbActions, kbHost);
  bindAttr(keyboard, "data-allin", () => allInMode() ? "" : null);
  bindHidden(keyboard, () => phase() !== "playing");

  queueMicrotask(() => {
    const root = kbHost.querySelector('[data-bn="keyboard"]');
    if (!root) return;
    kb.hydrate(root);
    /* iOS Safari: @basenative/keyboard@1.0.0 calls preventDefault on
       touchstart, suppressing the synthetic click the dispatcher relies
       on. Synthesize the click on touchend until the upstream fix lands. */
    root.addEventListener("touchend", (e) => {
      const btn = e.target && e.target.closest && e.target.closest("[data-bn-kb-key]");
      if (!btn || btn.disabled) return;
      e.preventDefault();
      btn.click();
    }, { passive: false });
  });

  /* End-of-round dialog — overlay <div role="dialog"> wrapping a single
     <article> card. Markup is purely attribute-driven; styling is in
     styles.css under [data-bn-region="end-overlay"] and the shared
     dialog/card selectors. The <h2>'s data-tone toggles the win/lose
     accent color via [data-bn-region="title"][data-tone="..."]. */
  const endTitle  = h("h2", { "data-bn-region": "title" });
  const endSub    = h("p", { "data-bn-region": "subtitle" });
  const endReveal = h("p", { "data-bn-region": "reveal" });
  const endBy     = h("strong");
  const endCredit = h("p", { "data-bn-region": "credit" }, "submitted by ", endBy);
  const endScore  = h("output", { "data-bn-region": "end-score" });
  const endShare  = h("button", {
    type: "button",
    "data-bn-button": "primary",
    "data-bn-action": "share",
  });
  const endPrimary   = h("button", {
    type: "button",
    "data-bn-button": "secondary",
    "data-bn-action": "primary",
  });
  const endSecondary = h("button", {
    type: "button",
    "data-bn-button": "secondary",
    "data-bn-action": "secondary",
  });

  bindText(endScore, () => String(score()));
  bindAttr(endScore, "aria-label", () => `Final score ${score()} points`);
  bindText(endShare, () => shareLbl() || "Share result");
  bindText(endBy, () => session()?.submittedBy || "?");
  bindText(endTitle, () => phase() === "won" ? "Solved" : "House Wins");
  bindAttr(endTitle, "data-tone", () => phase() === "won" ? "win" : "lose");
  bindText(endSub, () => `${session()?.category || ""}${phase() === "lost" ? " · the answer was" : ""}`);
  bindText(endReveal, () => (reveal() || []).join(" "));
  bindText(endPrimary, () => phase() === "won" ? "Pick another" : "Try again");
  endSecondary.textContent = "Pick another";
  bindHidden(endSecondary, () => phase() !== "lost");

  endShare.addEventListener("click", () => {
    onShare({ won: phase() === "won" }).then(label => shareLbl.set(label));
  });
  endPrimary.addEventListener("click", () => {
    if (phase() === "won") goLobby();
    else retry();
  });
  endSecondary.addEventListener("click", goLobby);

  const endCard = h("article", {
    role: "document",
    onClick: (e) => e.stopPropagation(),
  },
    endTitle, endSub, endReveal, endCredit,
    endScore, h("p", { "data-bn-region": "score-label" }, "points"),
    endShare, endSecondary, endPrimary,
  );

  const endOverlay = h("div", {
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "play-end-title",
    "data-bn-region": "end-overlay",
  }, endCard);
  endTitle.id = "play-end-title";
  bindHidden(endOverlay, () => !((phase() === "won" || phase() === "lost") && !!reveal()));

  /* ── Root <main>: same shape as src/bn/views/play.js SSR template. ── */
  return h("main", {
    "aria-labelledby": "play-title",
    "data-bn-view": "play",
  }, announceEl, summary, grid, bank, keyboard, endOverlay);
}
