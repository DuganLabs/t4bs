/* PLAY view — the word-guessing board.

   Semantic mirror of src/bn/views/play-board.js (SSR): <main> with
   <header data-bn-region="play-summary">, <section data-bn-region="grid">,
   <section data-bn-region="knowledge">, <section data-bn-region="bank">,
   <section data-bn-region="keyboard">, plus the client-only end-of-round
   <dialog>.

   The loop: pick a word, type letters into its open tiles, stake the ones
   you're sure of, press Enter; the server answers green / yellow / dark per
   tile; greens lock; a miss spends one of THAT word's attempts; a word out
   of attempts is busted and the round goes on (docs/tuning-proposal.md).
   Every attempt stays on the board: the active word is laid out Wordle-
   style, past rows above the live row; the other words show their current
   row and a strip of their past attempts (§3.5).

   Two rules the tests hold this file to: it binds no touch handler of its
   own (@basenative/keyboard owns touch, and doing it twice typed two
   letters per tap), and it never synthesizes a click on a key. */

import { signal, computed, effect } from "@basenative/runtime";
import { Keyboard } from "@basenative/keyboard";
import { renderCard, renderDialog } from "@basenative/components";
import { bnButton, fromHTML, h } from "../lib/dom.js";
import { bindAttr, bindHidden, bindText } from "../lib/bind.js";
import { api } from "../lib/api.js";
import {
  openSlots, fullCount, computeKeyStatus, knowledgeSummary, historyFor, KEY_STATE_INFO,
} from "../lib/game.js";
import { PLAY_LAYOUT } from "../lib/keyboard-layout.js";
import { confetti } from "../lib/confetti.js";

export function createPlay({
  round,
  toaster,
  onResultRecorded,
  onDailyUpdate,
  onShare,
  goLobby,
  retry,
}) {
  const {
    session, locked, presentGlobal, absentByWord, wordSolved, busted,
    attempts, attemptsMax, guessLog, score, tokens, phase, reveal, apply,
  } = round;

  /* ── per-round UI signals ──────────────────────────────────────────── */
  const active     = signal(null);
  const s0         = session.peek() || { words: [] };
  const typed      = signal(s0.words.map(() => []));
  const wagers     = signal(s0.words.map(() => []));
  const allInMode  = signal(false);
  const casc       = signal(false);
  const flipping   = signal(null);          // wi whose last row is flipping in
  const shaking    = signal(null);
  const cascDrop   = signal(null);
  const expanded   = signal(null);          // a non-active word whose strip is opened
  const shareLbl   = signal(null);
  const announcement = signal("");
  const dailyAfter = signal(null);
  let resultRecorded = false;

  const playing = computed(() => phase() === "playing");
  const over    = computed(() => phase() === "won" || phase() === "lost");
  const done    = (wi) => !!wordSolved()[wi] || !!busted()[wi];

  /* ── derived ───────────────────────────────────────────────────────── */
  const keyStatus = computed(() => computeKeyStatus({
    session: session(), active: active(), locked: locked(),
    presentGlobal: presentGlobal(), absentByWord: absentByWord(),
  }));

  const allInBonus = computed(() => {
    const s = session();
    if (!s?.words) return 0;
    return fullCount(s.words, locked()) * 8;
  });

  const wagerCount = computed(() => allInMode()
    ? wagers().reduce((acc, w) => acc + (w?.length || 0), 0)
    : (active() !== null ? (wagers()[active()]?.length || 0) : 0));

  const hintText = computed(() => {
    if (casc()) return "Reveal earned — tap any hidden tile in any open word for a free letter.";
    if (!playing()) return "";
    if (allInMode()) return `ALL IN: type the rest of the phrase, then Enter. Right: +${allInBonus()}. Wrong: every open word is busted.`;
    const a = active();
    if (a === null) return "Tap a word to work on it.";
    const s = session();
    if (!s?.words) return "";
    const slots = openSlots(s.words[a], locked()[a] || {});
    const room = slots.length - (typed()[a]?.length || 0);
    const left = attempts()[a] ?? 0;
    if (room === 0) return `Enter to submit — a miss spends one of this word's ${left} attempt${left === 1 ? "" : "s"}.`;
    return `Type ${room} more letter${room === 1 ? "" : "s"} for word ${a + 1} · ${left} attempt${left === 1 ? "" : "s"} left.`;
  });

  const stakeText = computed(() => {
    const n = wagerCount();
    if (n > 0) return `${n} STAKED · 2× RIGHT · −5 WRONG`;
    if (allInMode()) return "TYPE THE REST";
    return "";
  });

  /* ── effects: word focus + result recording ───────────────────────── */
  effect(() => {
    if (!playing() || casc() || allInMode()) return;
    const a = active();
    if (a === null || done(a)) {
      const next = wordSolved().findIndex((solved, i) => !solved && !busted()[i]);
      if (next !== -1) active.set(next);
    }
  });

  effect(() => {
    const p = phase();
    if (resultRecorded || (p !== "won" && p !== "lost")) return;
    resultRecorded = true;
    const s = session();
    onResultRecorded(p === "won", score(), s?.category, s?.mode || "free");
    if (p === "won") { confetti(); announcement.set(`Solved. ${score()} points.`); }
    else announcement.set(`Finished. ${score()} points.`);
    if (navigator.vibrate) navigator.vibrate(p === "won" ? [40, 40, 80] : 200);
  });

  /* ── typing ────────────────────────────────────────────────────────── */
  const findGlobalNextSlot = () => {
    const s = session();
    if (!s?.words) return null;
    for (let wi = 0; wi < s.words.length; wi++) {
      if (done(wi)) continue;
      const slots = openSlots(s.words[wi], locked()[wi] || {});
      if ((typed()[wi]?.length || 0) < slots.length) return { wi, slotIdx: typed()[wi]?.length || 0 };
    }
    return null;
  };

  const typeLetter = (letter) => {
    if (!playing() || casc()) return;
    const L = String(letter).toUpperCase();
    if (allInMode()) {
      const next = findGlobalNextSlot();
      if (!next) return;
      typed.set(prev => prev.map((t, i) => i !== next.wi ? t : [...t, L]));
      return;
    }
    const a = active();
    if (a === null || done(a)) return;
    const s = session();
    if (!s?.words) return;
    const slots = openSlots(s.words[a], locked()[a] || {});
    if ((typed()[a]?.length || 0) >= slots.length) return;
    typed.set(prev => prev.map((t, i) => i !== a ? t : [...t, L]));
  };

  const backspace = () => {
    if (!playing() || casc()) return;
    if (allInMode()) {
      const t = typed();
      const s = session();
      if (!s?.words) return;
      for (let wi = s.words.length - 1; wi >= 0; wi--) {
        if ((t[wi]?.length || 0) > 0) {
          typed.set(prev => prev.map((row, i) => i !== wi ? row : row.slice(0, -1)));
          wagers.set(prev => prev.map((w, i) => i !== wi ? w : w.filter(x => x < (t[wi].length - 1))));
          return;
        }
      }
      return;
    }
    const a = active();
    if (a === null || done(a)) return;
    typed.set(prev => prev.map((row, i) => i !== a ? row : row.slice(0, -1)));
    wagers.set(prev => prev.map((w, i) => i !== a ? w : w.filter(x => x < (typed()[a].length - 1))));
  };

  const enter = () => {
    if (allInMode()) { submitAllIn(); return; }
    const a = active();
    if (a === null) return;
    submit(a);
  };

  const toggleWager = (wi, slotIdx) => {
    if (!playing() || casc()) return;
    if (!allInMode() && wi !== active()) return;
    if (slotIdx >= (typed()[wi]?.length || 0)) return;
    wagers.set(prev => prev.map((w, i) => {
      if (i !== wi) return w;
      return w.includes(slotIdx) ? w.filter(x => x !== slotIdx) : [...w, slotIdx];
    }));
  };

  /* Every server response is the whole round; make it current. */
  function settle(r) {
    apply(r);
    if (r.daily) { dailyAfter.set(r.daily); onDailyUpdate?.(r.daily); }
  }

  function friendly(e) {
    const code = e?.data?.error || e?.message || "";
    if (code === "no-session" || code === "puzzle-gone") return "THAT ROUND IS GONE";
    if (code === "finished") return "THIS ROUND IS OVER";
    if (code === "incomplete-guess") return "FILL EVERY TILE FIRST";
    return "COULDN'T REACH THE SERVER — TRY AGAIN";
  }

  /* ── submit one word ──────────────────────────────────────────────── */
  async function submit(wi) {
    if (!playing() || casc() || done(wi)) return;
    const s = session();
    if (!s?.words) return;
    const lm = locked()[wi] || {};
    const slots = openSlots(s.words[wi], lm);
    if ((typed()[wi]?.length || 0) < slots.length) {
      shaking.set(wi); setTimeout(() => shaking.set(null), 480);
      return;
    }
    try {
      const r = await api.guess(s.sessionId, wi, typed()[wi], wagers()[wi]);
      typed.set(prev => prev.map((t, i) => i !== wi ? t : []));
      wagers.set(prev => prev.map((w, i) => i !== wi ? w : []));
      flipping.set(wi); setTimeout(() => flipping.set(null), 700);
      settle(r);

      const sign = r.scoreDelta >= 0 ? "+" : "";
      const allGreen = r.feedback.every(st => st === "green");
      if (allGreen) {
        announcement.set(`Word ${wi + 1} solved. ${sign}${r.scoreDelta} points.`);
        toaster(`${sign}${r.scoreDelta}pts`, "great");
        if (r.cascadeEarned && !r.finished) {
          setTimeout(() => {
            casc.set(true);
            announcement.set("Clean solve — a reveal earned. Tap any hidden tile in any open word.");
          }, 600);
        }
      } else if (r.bustedNow) {
        shaking.set(wi); setTimeout(() => shaking.set(null), 480);
        announcement.set(`Word ${wi + 1} is out of attempts — it was ${r.letters ? r.locked[wi] && Object.values(r.locked[wi]).join("") : ""}. It scores nothing; the rest of the phrase is still yours.`);
        toaster(`WORD ${wi + 1} BUSTED · ${sign}${r.scoreDelta}pts`, "bad");
      } else {
        shaking.set(wi); setTimeout(() => shaking.set(null), 480);
        const left = r.attempts[wi];
        announcement.set(r.stakeBusted
          ? `Not it, and a staked tile was wrong. ${left} attempt${left === 1 ? "" : "s"} left on this word.`
          : `Not it. ${left} attempt${left === 1 ? "" : "s"} left on this word.`);
        toaster(r.stakeBusted ? `STAKE MISSED · ${sign}${r.scoreDelta}pts` : `Not quite · ${sign}${r.scoreDelta}pts`, "bad");
      }
    } catch (e) {
      toaster(friendly(e), "bad");
    }
  }

  async function pickCascade(wi, li) {
    if (!casc() || tokens() <= 0 || done(wi)) return;
    if ((locked()[wi] || {})[li] !== undefined) return;
    const s = session();
    if (!s) return;
    try {
      const r = await api.cascade(s.sessionId, wi, li);
      settle(r);
      cascDrop.set(`${wi}-${li}`);
      setTimeout(() => cascDrop.set(null), 600);
      casc.set(false);
      if (!done(wi)) active.set(wi);
      announcement.set(`Free letter revealed in word ${wi + 1}. ${r.tokens} reveal${r.tokens === 1 ? "" : "s"} left.`);
      toaster("⚡ FREE LETTER", "cascade");
    } catch (e) {
      toaster(friendly(e), "bad");
    }
  }

  function openAllIn() {
    if (allInMode()) {
      allInMode.set(false);
      announcement.set("Folded. Back to one word at a time.");
      return;
    }
    const s = session();
    if (!s?.words) return;
    typed.set(s.words.map(() => []));
    wagers.set(s.words.map(() => []));
    active.set(null);
    allInMode.set(true);
    announcement.set(`All in. Type the rest of the phrase and press Enter: +${allInBonus()} if right, every open word busted if wrong.`);
  }

  async function submitAllIn() {
    const s = session();
    if (!s?.words || !allInMode()) return;
    const guesses = s.words.map((len, wi) => {
      const lm = locked()[wi] || {};
      const slots = openSlots(len, lm);
      let str = "";
      for (let i = 0; i < len; i++) {
        str += lm[i] !== undefined ? lm[i] : (typed()[wi][slots.indexOf(i)] || "");
      }
      return str;
    });
    if (guesses.some((g, i) => g.length !== s.words[i])) {
      toaster("FINISH TYPING THE PHRASE", "bad");
      return;
    }
    try {
      const r = await api.allIn(s.sessionId, guesses);
      allInMode.set(false);
      settle(r);
      if (r.correct) {
        announcement.set(`All in — correct. +${r.scoreDelta} points.`);
        toaster(`ALL IN · +${r.scoreDelta}pts`, "great");
      } else {
        announcement.set("All in — wrong. Every open word is busted.");
        toaster("ALL IN BUSTED", "bad");
      }
    } catch (e) {
      toaster(friendly(e), "bad");
    }
  }

  /* ── physical keyboard ────────────────────────────────────────────── */
  effect(() => {
    if (!playing() || casc()) return;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Enter") { e.preventDefault(); enter(); }
      else if (e.key === "Backspace") { e.preventDefault(); backspace(); }
      else if (/^[a-zA-Z]$/.test(e.key)) { e.preventDefault(); typeLetter(e.key); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  /* ── DOM: header ──────────────────────────────────────────────────── */
  const announceEl = h("output", { class: "sr-only", "aria-live": "polite", "aria-atomic": "true", "data-bn-region": "play-announce" });
  bindText(announceEl, announcement);

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
    return `${s.words.length} words · ${s.totalLetters} letters · by ${s.submittedBy || "?"}`;
  });

  const hintEl = h("p", { role: "status", "aria-live": "polite", "data-bn-region": "play-hint" });
  bindText(hintEl, hintText);
  bindAttr(hintEl, "data-active", () => active() !== null && playing() ? "" : null);
  bindAttr(hintEl, "data-allin", () => allInMode() ? "" : null);

  const isDaily = () => session()?.mode === "daily";
  const previewNote = h("p", { "data-bn-region": "preview-note" }, "Preview · does not count toward a streak");
  bindHidden(previewNote, isDaily);
  const dayLabel = h("p", { "data-bn-region": "day-label" });
  bindText(dayLabel, () => session()?.day ? `Today · ${session().day}` : "Today");
  bindHidden(dayLabel, () => !isDaily());

  const summary = h("header", { "data-bn-region": "play-summary" }, stickyEl, metaEl, hintEl);

  /* ── DOM: the board ───────────────────────────────────────────────── */
  const grid = h("section", { "aria-label": "Phrase grid", "data-bn-region": "grid" });

  /** One row of frozen feedback — a past attempt. */
  function historyRow(wi, g, mini) {
    const row = h("div", { "data-bn-region": mini ? "past-mini" : "past", role: "img",
      "aria-label": `Attempt on word ${wi + 1}: ${g.letters.join("")} — ${g.feedback.filter(f => f === "green").length} right, ${g.feedback.filter(f => f === "yellow").length} elsewhere` });
    g.letters.forEach((L, li) => {
      row.append(h("span", { "data-bn-region": "tile", "data-feedback": g.feedback[li], "data-staked": (g.staked || []).includes(li) ? "" : null, "aria-hidden": "true" }, mini ? "" : L));
    });
    return row;
  }

  effect(() => {
    const s = session();
    const lockedAll = locked();
    if (!s?.words || lockedAll.length !== s.words.length) return;
    const log = guessLog();
    const overNow = over();

    let allInNext = null;
    if (allInMode()) {
      for (let w = 0; w < s.words.length; w++) {
        if (done(w)) continue;
        const ss = openSlots(s.words[w], lockedAll[w] || {});
        if ((typed()[w]?.length || 0) < ss.length) { allInNext = { wi: w, slotIdx: typed()[w]?.length || 0 }; break; }
      }
    }

    const wordEls = s.words.map((wordLen, wi) => {
      const lm = lockedAll[wi] || {};
      const slots = openSlots(wordLen, lm);
      const solved = !!wordSolved()[wi];
      const bust = !!busted()[wi];
      const isAct = !allInMode() && active() === wi && !solved && !bust && !casc();
      const wagerSet = new Set(wagers()[wi] || []);
      const past = historyFor(log, wi);
      const showRows = isAct || expanded() === wi || (overNow && past.length > 0 && !solved);
      const left = attempts()[wi] ?? 0;
      const max = attemptsMax()[wi] ?? left;

      const wordProps = {
        role: "group",
        "data-bn-region": "word",
        "aria-label": `Word ${wi + 1}, ${wordLen} letters, ${solved ? "solved" : bust ? "busted" : `${left} of ${max} attempts left`}`,
        "data-word-index": wi,
        onClick: () => {
          if (casc() || allInMode() || !playing()) return;
          if (!done(wi)) active.set(wi);
          else expanded.set(expanded() === wi ? null : wi);
        },
      };
      if (isAct) wordProps["data-active"] = "";
      if (allInMode() && !done(wi)) wordProps["data-allin"] = "";
      if (solved) wordProps["data-solved"] = "";
      if (bust) wordProps["data-busted"] = "";
      if (shaking() === wi) wordProps["data-shake"] = "";
      if (casc() && !done(wi)) wordProps["data-casc-on"] = "";
      const word = h("div", wordProps);

      /* Past attempts: full rows above the live row for the word in play;
         a strip of mini rows for the others. */
      if (past.length > 0) {
        const hist = h("div", { "data-bn-region": showRows ? "history" : "history-strip" });
        past.forEach((g, gi) => {
          const el = historyRow(wi, g, !showRows);
          if (gi === past.length - 1 && flipping() === wi) el.setAttribute("data-fb-flip", "");
          hist.append(el);
        });
        word.append(hist);
      }

      /* The live row. */
      const live = h("div", { "data-bn-region": "row" });
      for (let li = 0; li < wordLen; li++) {
        const lockedLetter = lm[li];
        const slotIdx = slots.indexOf(li);
        const typedLetter = slotIdx >= 0 ? (typed()[wi]?.[slotIdx] ?? null) : null;
        const isCascDrop = cascDrop() === `${wi}-${li}`;
        const isCascPick = casc() && lockedLetter === undefined && !done(wi);
        const isWagered = slotIdx >= 0 && wagerSet.has(slotIdx) && typedLetter;
        const isCursor = allInMode()
          ? (allInNext?.wi === wi && allInNext?.slotIdx === slotIdx)
          : (isAct && slotIdx === (typed()[wi]?.length || 0));

        const tileProps = {
          role: "img", "data-bn-region": "tile", "data-word-index": wi, "data-cell-index": li,
          onClick: (e) => {
            e.stopPropagation();
            if (isCascPick) { pickCascade(wi, li); return; }
            if ((isAct || allInMode()) && typedLetter) { toggleWager(wi, slotIdx); return; }
            if (!done(wi) && !casc() && !allInMode() && playing()) active.set(wi);
          },
        };
        let display = "";
        if (solved) { tileProps["data-solved"] = ""; display = lockedLetter || ""; }
        else if (bust) { tileProps["data-busted"] = ""; display = lockedLetter || ""; }
        else if (lockedLetter !== undefined) { tileProps["data-locked"] = ""; display = lockedLetter; }
        else if (typedLetter) { tileProps["data-typed"] = ""; if (allInMode()) tileProps["data-allin-typed"] = ""; display = typedLetter; }
        else if (isCursor) tileProps["data-cursor"] = "";
        if (isWagered) tileProps["data-wagered"] = "";
        if (isCascPick) tileProps["data-casc-pick"] = "";
        if (isCascDrop) tileProps["data-casc-drop"] = "";

        const pos = `position ${li + 1} of word ${wi + 1}`;
        let label;
        if (solved) label = `${lockedLetter} at ${pos}, word solved`;
        else if (bust) label = `${lockedLetter} at ${pos}, revealed — word busted`;
        else if (lockedLetter !== undefined) label = `${lockedLetter} at ${pos}, locked`;
        else if (typedLetter) label = `${typedLetter} at ${pos}, typed${isWagered ? ", staked" : ""}${isCursor ? ", cursor here" : ""}`;
        else { label = `Empty at ${pos}`; if (isCursor) label += ", cursor here"; if (isCascPick) label += ", reveal available"; }
        tileProps["aria-label"] = label;
        live.append(h("span", tileProps, display));
      }
      word.append(live);

      const att = h("small", { "data-bn-region": "attempts" });
      if (solved) att.textContent = past.some(g => !g.allGreen) ? "solved" : "solved · clean";
      else if (bust) att.textContent = "busted · 0 pts";
      else att.textContent = `${left} of ${max} attempt${max === 1 ? "" : "s"}`;
      if (bust) att.setAttribute("data-tone", "bust");
      word.append(att);
      return word;
    });

    grid.replaceChildren(...wordEls);
  });

  /* ── Knowledge read-out ────────────────────────────────────────────── */
  const know = computed(() => knowledgeSummary({
    words: session()?.words, locked: locked(), wordSolved: wordSolved(), busted: busted(),
    presentGlobal: presentGlobal(), attempts: attempts(), attemptsMax: attemptsMax(), tokens: tokens(),
  }));

  function knowStat(valueFn, label, ariaFn, tone) {
    const strong = h("strong");
    bindText(strong, valueFn);
    const li = h("li", { "data-bn-region": "know-stat" }, strong, h("small", null, label));
    if (tone) li.setAttribute("data-tone", tone);
    bindAttr(li, "aria-label", ariaFn);
    return li;
  }

  const knowList = h("ul", { role: "list" },
    knowStat(() => `${know().solvedWords}/${know().totalWords}`, "WORDS", () => `${know().solvedWords} of ${know().totalWords} words solved`),
    knowStat(() => `${know().knownLetters}/${know().totalLetters}`, "LETTERS", () => `${know().knownLetters} of ${know().totalLetters} letters locked in`),
    knowStat(() => `${know().attemptsLeft}`, "ATTEMPTS LEFT", () => `${know().attemptsLeft} of ${know().attemptsTotal} attempts left across the phrase`, "attempts"),
    knowStat(() => `⚡${know().tokens}`, "REVEALS", () => `${know().tokens} reveal${know().tokens === 1 ? "" : "s"} banked`),
  );
  const knowHint = h("p", { "data-bn-region": "know-hint" });
  bindText(knowHint, () => {
    const k = know();
    const bits = [];
    if (k.floating > 0) bits.push(`${k.floating} letter${k.floating === 1 ? "" : "s"} known to be in the phrase, not yet placed`);
    if (k.bustedWords > 0) bits.push(`${k.bustedWords} word${k.bustedWords === 1 ? "" : "s"} busted`);
    if (k.bestTarget && k.bestTarget.known > 0) bits.push(`easiest next: word ${k.bestTarget.wi + 1} (${k.bestTarget.known}/${k.bestTarget.len} known)`);
    return bits.length ? bits.join(" · ") : "Nothing deduced yet — a solved word narrows every other word.";
  });
  const knowledge = h("section", { "aria-label": "What you know so far", "data-bn-region": "knowledge" }, knowList, knowHint);
  bindHidden(knowledge, () => !playing());

  /* ── Letter bank ──────────────────────────────────────────────────── */
  const presentRow = h("p", { "data-bn-region": "bank-present" });
  effect(() => {
    const pg = presentGlobal();
    presentRow.replaceChildren(
      h("span", { "data-bn-role": "label" }, "in phrase:"),
      ...(pg.length ? pg.map(L => h("span", { "data-bn-chip": "yellow" }, L)) : [h("span", { "data-bn-role": "label" }, "—")]),
    );
  });
  const absentRow = h("p", { "data-bn-region": "bank-absent" });
  effect(() => {
    const a = active();
    const abs = a === null ? [] : (absentByWord()[a] || []);
    if (!abs.length) { absentRow.replaceChildren(); return; }
    absentRow.replaceChildren(
      h("span", { "data-bn-role": "label" }, `not in word ${a + 1}:`),
      ...abs.map(L => h("span", { "data-bn-chip": "absent" }, L)),
    );
  });
  const bank = h("section", { "aria-label": "Letter bank", "data-bn-region": "bank" }, presentRow, absentRow);
  bindHidden(bank, () => !playing());

  /* ── Keyboard ─────────────────────────────────────────────────────── */
  const kb = Keyboard({
    id: "play-kb",
    layout: PLAY_LAYOUT,
    primary: "ENTER",
    label: "On-screen keyboard",
    state: keyStatus,
    runtime: { effect },
    onKey: typeLetter,
    onAction: (a) => { if (a === "ENTER") enter(); else if (a === "BACKSPACE") backspace(); },
    haptic: true,
    bindHardware: false,
  });

  const allInBtn = h("button", { type: "button", "data-bn-action": "all-in", onClick: openAllIn });
  bindText(allInBtn, () => allInMode() ? "FOLD" : "ALL IN");
  bindAttr(allInBtn, "aria-label", () => allInMode()
    ? "Fold and go back to one word at a time"
    : "All in: type every remaining letter and submit the whole phrase for a bonus, or bust every open word");
  bindAttr(allInBtn, "data-on", () => allInMode() ? "" : null);
  effect(() => { allInBtn.disabled = casc() && !allInMode(); });

  const stakeLbl = h("output", { "aria-live": "polite", "data-bn-region": "stake-label" });
  bindText(stakeLbl, stakeText);
  bindAttr(stakeLbl, "aria-label", () => {
    const n = wagerCount();
    if (n > 0) return `${n} tile${n === 1 ? "" : "s"} staked: double points if right, minus five each if wrong`;
    if (allInMode()) return "Type the remaining letters of the phrase";
    return null;
  });

  const kbActions = h("footer", { "data-bn-region": "kb-actions" }, allInBtn, stakeLbl);
  const kbHost = h("div", { html: kb.html });
  const keyboard = h("section", { "data-bn-region": "keyboard" }, kbActions, kbHost);
  bindAttr(keyboard, "data-allin", () => allInMode() ? "" : null);
  bindHidden(keyboard, () => !playing());

  queueMicrotask(() => {
    const root = kbHost.querySelector('[data-bn="keyboard"]');
    if (!root) return;
    kb.hydrate(root);
    const charKeys = root.querySelectorAll('[data-bn-kb-key][data-kb-type="char"]');
    effect(() => {
      const map = keyStatus();
      charKeys.forEach((btn) => {
        const letter = btn.dataset.kbKey;
        const info = KEY_STATE_INFO[map[letter]];
        btn.setAttribute("aria-label", info ? `${letter} key, ${info.ariaSuffix}` : `${letter} key`);
      });
    });
  });

  /* ── End of round ─────────────────────────────────────────────────── */
  const endTitle  = h("h2", { id: "play-end-title", "data-bn-region": "title" });
  const endSub    = h("p", { "data-bn-region": "subtitle" });
  const endReveal = h("p", { "data-bn-region": "reveal" });
  const endHow    = h("p", { "data-bn-region": "how" });
  const endBy     = h("strong");
  const endCredit = h("p", { "data-bn-region": "credit" }, "submitted by ", endBy);
  const endMode   = h("p", { "data-bn-region": "end-mode" });
  const endScore  = h("output", { "data-bn-region": "end-score" });
  const endPar    = h("p", { "data-bn-region": "score-label" });
  const endShare     = bnButton("Share result", { variant: "primary",   attrs: 'data-bn-action="share"' });
  const endPrimary   = bnButton("Done",         { variant: "secondary", attrs: 'data-bn-action="primary"' });
  const endSecondary = bnButton("Done",         { variant: "secondary", attrs: 'data-bn-action="secondary"' });

  bindText(endTitle, () => phase() === "won" ? "Solved" : "Finished");
  bindAttr(endTitle, "data-tone", () => phase() === "won" ? "win" : "lose");
  bindText(endSub, () => `${session()?.category || ""}${phase() === "lost" ? " · the phrase was" : ""}`);
  bindText(endReveal, () => (reveal() || []).join(" "));
  bindText(endHow, () => {
    const k = know();
    if (phase() === "won") return `Every word solved · ${k.attemptsTotal - k.attemptsLeft} attempt${k.attemptsTotal - k.attemptsLeft === 1 ? "" : "s"} used`;
    return `${k.bustedWords} word${k.bustedWords === 1 ? "" : "s"} busted · ${k.solvedWords} solved`;
  });
  bindText(endMode, () => {
    const d = dailyAfter();
    if (d) { const n = d.streak || 0; return n > 0 ? `Daily ${d.day} · streak 🔥${n}` : `Daily ${d.day} · streak reset`; }
    return session()?.mode === "daily" ? "Daily" : "Preview · streak untouched";
  });
  bindText(endScore, () => String(score()));
  bindAttr(endScore, "aria-label", () => `Final score ${score()} points`);
  bindText(endPar, () => {
    const par = session()?.par;
    if (!par) return "points";
    const d = score() - par;
    return d > 0 ? `points · ${d} over par` : d === 0 ? "points · par" : `points · ${-d} under par`;
  });
  bindText(endBy, () => session()?.submittedBy || "?");
  bindText(endShare, () => shareLbl() || "Share result");
  bindText(endPrimary, () => {
    if (session()?.mode === "daily") return "Done for today";
    return phase() === "won" ? "Done" : "Try again";
  });
  bindHidden(endSecondary, () => phase() !== "lost" || session()?.mode === "daily");

  endShare.addEventListener("click", () => { onShare({ won: phase() === "won" }).then(label => shareLbl.set(label)); });
  endPrimary.addEventListener("click", () => { if (phase() === "won" || session()?.mode === "daily") goLobby(); else retry(); });
  endSecondary.addEventListener("click", goLobby);

  const endCard = fromHTML(renderCard());
  endCard.setAttribute("role", "document");
  endCard.querySelector('[data-bn="card-body"]').append(
    endTitle, endSub, endReveal, endHow, endCredit, endMode, endScore, endPar,
    endShare, endSecondary, endPrimary,
  );
  const endOverlay = /** @type {HTMLDialogElement} */ (fromHTML(renderDialog({
    id: "play-end", modal: true, closable: false, attrs: 'data-bn-region="end-overlay"',
  })));
  endOverlay.setAttribute("aria-labelledby", "play-end-title");
  endOverlay.querySelector('[data-bn="dialog-body"]').append(endCard);
  endOverlay.addEventListener("cancel", (e) => e.preventDefault());

  effect(() => {
    const open = over() && !!reveal();
    if (open && !endOverlay.open) {
      /* Let the last row flip land before the card covers it. */
      setTimeout(() => { if (!endOverlay.open && endOverlay.isConnected) endOverlay.showModal(); }, 900);
    } else if (!open && endOverlay.open) {
      endOverlay.close();
    }
  });

  /* ── Root ─────────────────────────────────────────────────────────── */
  const main = h("main", { "aria-labelledby": "play-title" },
    announceEl, titleEl, dayLabel, previewNote, summary, grid, knowledge, bank, keyboard, endOverlay,
  );
  bindAttr(main, "data-bn-view", () => isDaily() ? "home" : "play");
  return main;
}
