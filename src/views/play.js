/* Single-file component: PLAY view.
   All game state is signal-driven. Calls into shared/engine.js indirectly via
   /api endpoints. The on-screen keyboard is @basenative/keyboard. */

import { signal, computed, effect } from "@basenative/runtime";
import { Keyboard } from "@basenative/keyboard";
import { h, reactiveList } from "../lib/dom.js";
import { api } from "../lib/api.js";
import { openSlots, fullCount, computeKeyStatus } from "../lib/game.js";
import { confetti } from "../lib/confetti.js";

export function createPlay({
  session,        // signal<object>      — initial public shape from /api/session
  locked,         // signal<array<map>>  — wi -> { li -> letter }
  presentGlobal,  // signal<string[]>
  absentByWord,   // signal<string[][]>
  wordSolved,     // signal<boolean[]>
  posFeedback,    // signal<(green|yellow|absent|null)[][]>
  score,          // signal<number>
  lives,          // signal<number>
  tokens,         // signal<number>
  phase,          // signal<'playing'|'won'|'lost'>
  reveal,         // signal<string[] | null>
  toaster,        // (text, type) => void
  onResultRecorded, // (won, score, category) => void
  onShare,        // ({ won }) => Promise<string>  — returns label
  goLobby,
  retry,          // () => void  — restart the same puzzle
}) {
  // ── per-render UI signals ──────────────────────────────────────────────
  const active    = signal(null);
  const typed     = signal(session.peek().words.map(() => []));
  const wagers    = signal(session.peek().words.map(() => []));
  const allInMode = signal(false);
  const casc      = signal(false);
  const feedback  = signal({});       // wi -> [{idx, letter, status}]
  const shaking   = signal(null);
  const cascDrop  = signal(null);
  const shareLbl  = signal(null);
  let resultRecorded = false;

  // ── accessibility announcements ────────────────────────────────────────
  const announcement = signal("");

  // ── derived ────────────────────────────────────────────────────────────
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
    const slots = openSlots(s.words[active()], locked()[active()]);
    const room = slots.length - typed()[active()].length;
    if (room === 0) return "Word complete. Press enter to submit or tap a tile to stake 2× points.";
    return `Type ${room} more letter${room === 1 ? "" : "s"} for word ${active() + 1}.`;
  });

  const allInBonus = computed(() => fullCount(session().words, locked()) * 8);

  // ── auto-pick the first unsolved word when phase changes / a word solves ──
  effect(() => {
    if (phase() !== "playing" || casc()) return;
    const ws = wordSolved();
    const a = active();
    if (a === null || ws[a]) {
      const next = ws.findIndex(s => !s);
      if (next !== -1) active.set(next);
    }
  });

  // ── record result + confetti when round ends ──
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

  // ── typing primitives ──────────────────────────────────────────────────
  const findGlobalNextSlot = () => {
    const s = session();
    if (!s) return null;
    for (let wi = 0; wi < s.words.length; wi++) {
      if (wordSolved()[wi]) continue;
      const slots = openSlots(s.words[wi], locked()[wi]);
      if (typed()[wi].length < slots.length) return { wi, slotIdx: typed()[wi].length };
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
    const slots = openSlots(session().words[a], locked()[a]);
    if (typed()[a].length >= slots.length) return;
    typed.set(prev => prev.map((t, i) => i !== a ? t : [...t, letter]));
  };

  const backspace = () => {
    if (phase() !== "playing" || casc()) return;
    if (allInMode()) {
      const t = typed();
      for (let wi = session().words.length - 1; wi >= 0; wi--) {
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

  // ── submit one word ────────────────────────────────────────────────────
  async function submit(wi) {
    if (phase() !== "playing" || casc() || wordSolved()[wi]) return;
    const s = session();
    const wordLen = s.words[wi];
    const lm = locked()[wi];
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
        const wagerCount = wagers().length > 0 ? 0 : 0; // wagers reset above
        const wagerNote = wagerCount > 0 ? ` · ${wagerCount}× STAKE WON` : "";
        const msg = `Correct! Word ${wi + 1} solved. ${result.lives} lives remaining.`;
        announcement.set(msg);
        toaster(`+${result.scoreDelta}pts${wagerNote}`, "great");
        if (result.cascadeEarned) {
          setTimeout(() => {
            casc.set(true);
            announcement.set("Cascade earned! Tap any unrevealed tile to reveal it.");
          }, 600);
        }
      } else {
        shaking.set(wi); setTimeout(() => shaking.set(null), 480);
        const msg = `Incorrect. ${result.lives} lives remaining.`;
        announcement.set(msg);
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

  // ── cascade pick ────
  async function pickCascade(wi, li) {
    if (!casc() || tokens() <= 0 || wordSolved()[wi]) return;
    if (locked()[wi][li] !== undefined) return;
    try {
      const result = await api.cascade(session().sessionId, wi, li);
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

  // ── all-in ────
  function openAllIn() {
    if (allInMode()) {
      allInMode.set(false);
      announcement.set("Fold. Returned to normal play.");
      return;
    }
    typed.set(session().words.map(() => []));
    wagers.set(session().words.map(() => []));
    active.set(null);
    allInMode.set(true);
    announcement.set("All-in mode. Type the rest of the phrase to shove.");
  }
  async function submitAllIn() {
    const s = session();
    if (!s || !allInMode()) return;
    const guesses = s.words.map((len, wi) => {
      const lm = locked()[wi];
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

  // ── physical keyboard ──
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

  // ── Accessibility: visually-hidden announcement region ──
  const ariaLive = h("div", {
    class: "sr-only",
    role: "status",
    "aria-live": "polite",
    "aria-atomic": "true",
    text: announcement,
  });

  // ── DOM build ──────────────────────────────────────────────────────────
  const cbar = h("div", {
    class: () => `lb-cbar${allInMode() && !casc() ? " lb-cbar-allin" : ""}`,
    role: "status",
    "aria-live": "polite",
    text: () => {
      if (casc()) return "⚡ Earned reveal — pick any tile in any unsolved word";
      if (allInMode()) return `ALL IN — type the rest of the phrase · SHOVE to commit · +${allInBonus()} pts if right · 0 lives if wrong`;
      return "";
    },
    hidden: () => !casc() && !allInMode(),
  });

  const phraseGrid = h("div", { class: "lb-phrase" });
  reactiveList(phraseGrid, () => {
    const s = session();
    const words = s.words;
    let allInNext = null;
    if (allInMode()) {
      for (let wi = 0; wi < words.length; wi++) {
        if (wordSolved()[wi]) continue;
        const ss = openSlots(words[wi], locked()[wi]);
        if (typed()[wi].length < ss.length) { allInNext = { wi, slotIdx: typed()[wi].length }; break; }
      }
    }

    return words.map((wordLen, wi) => {
      const lm = locked()[wi];
      const slots = openSlots(wordLen, lm);
      const isAct = !allInMode() && active() === wi && !wordSolved()[wi] && !casc();
      const cascOn = casc() && !wordSolved()[wi];
      const fbW = feedback()[wi];
      const wagerSet = new Set(wagers()[wi]);

      const wordCls = [
        "lb-word",
        isAct ? "active" : "",
        allInMode() && !wordSolved()[wi] ? "allin" : "",
        wordSolved()[wi] ? "solved" : "",
        shaking() === wi ? "shake" : "",
        cascOn ? "casc-on" : "",
      ].filter(Boolean).join(" ");

      const wordEl = h("div", {
        class: wordCls,
        onClick: () => {
          if (casc() || allInMode()) return;
          if (!wordSolved()[wi]) active.set(wi);
        },
      });

      for (let li = 0; li < wordLen; li++) {
        const lockedLetter = lm[li];
        const slotIdx = slots.indexOf(li);
        const typedLetter = slotIdx >= 0 ? typed()[wi][slotIdx] : null;
        const isCursor = allInMode()
          ? (allInNext?.wi === wi && allInNext?.slotIdx === slotIdx)
          : (isAct && slotIdx === typed()[wi].length);
        const fbForTile = fbW?.find(f => f.idx === li);
        const isCascDrop = cascDrop() === `${wi}-${li}`;
        const isCascPick = casc() && lockedLetter === undefined && !wordSolved()[wi];
        const isWagered = slotIdx >= 0 && wagerSet.has(slotIdx) && typedLetter;

        const cls = ["lb-tile"];
        let display;

        if (wordSolved()[wi]) { cls.push("solved-tile"); display = lockedLetter; }
        else if (lockedLetter !== undefined) {
          cls.push("locked-green"); display = lockedLetter;
        }
        else if (typedLetter) {
          cls.push(allInMode() ? "typed allin-typed" : "typed");
          display = typedLetter;
        }
        else { if (isCursor) cls.push("cursor"); display = ""; }

        if (fbForTile) { cls.push("fb-flip", `fb-${fbForTile.status}`); display = fbForTile.letter; }
        if (isWagered) cls.push("wagered");
        if (isCascPick) cls.push("casc-pick");
        if (isCascDrop) cls.push("casc-drop");

        const pos = `position ${li + 1} of word ${wi + 1}`;
        let tileLabel;
        if (wordSolved()[wi]) tileLabel = `${lockedLetter} at ${pos}, word solved`;
        else if (lockedLetter !== undefined) tileLabel = `${lockedLetter} at ${pos}, locked`;
        else if (typedLetter) {
          let state = "typed";
          if (isWagered) state += ", staked 2 times";
          if (isCursor) state += ", cursor here";
          tileLabel = `${typedLetter} at ${pos}, ${state}`;
        }
        else {
          tileLabel = `Empty at ${pos}`;
          if (isCursor) tileLabel += ", cursor here";
          if (isCascPick) tileLabel += ", cascade reveal available";
        }
        if (fbForTile) tileLabel = `${fbForTile.letter} at ${pos}, ${fbForTile.status}`;

        wordEl.append(h("div", {
          class: cls.join(" "),
          role: "img",
          "aria-label": tileLabel,
          onClick: (e) => {
            e.stopPropagation();
            if (isCascPick) { pickCascade(wi, li); return; }
            if ((isAct || allInMode()) && typedLetter) { toggleWager(wi, slotIdx); return; }
            if (!wordSolved()[wi] && !casc() && !allInMode()) active.set(wi);
          },
        }, display));
      }
      return wordEl;
    });
  });

  // Knowledge bank
  const bankPresentRow = h("div", { class: "lb-bank-row" });
  reactiveList(bankPresentRow, () => {
    const out = [h("span", { class: "lb-bank-label" }, "in phrase:")];
    const pg = presentGlobal();
    if (pg.length === 0) out.push(h("span", { class: "lb-bank-label" }, "—"));
    else for (const L of pg) out.push(h("span", { class: "lb-chip yellow" }, L));
    return out;
  });
  const bankAbsentRow = h("div", { class: "lb-bank-row" });
  reactiveList(bankAbsentRow, () => {
    const a = active();
    if (a === null) return [];
    const abs = absentByWord()[a] || [];
    if (abs.length === 0) return [];
    return [
      h("span", { class: "lb-bank-label" }, `not in word ${a + 1}:`),
      ...abs.map(L => h("span", { class: "lb-chip absent" }, L)),
    ];
  });
  const bank = h("div", { class: "lb-bank" }, bankPresentRow, bankAbsentRow);

  // ── @basenative/keyboard wiring ──
  const kb = Keyboard({
    layout: "qwerty",
    primary: "ENTER",
    label: "On-screen keyboard",
    state: keyStatus,                  // computed → re-applies on signal change
    runtime: { effect },
    onKey: typeLetter,
    onAction: (a) => {
      if (a === "ENTER") enter();
      else if (a === "BACKSPACE") backspace();
    },
    haptic: true,
    bindHardware: false,               // we have our own Esc/letter listener above
  });

  const kbWrap = h("div", {
    class: () => `lb-kb-wrap${allInMode() ? " allin" : ""}`,
    "aria-label": () => allInMode() ? "Keyboard in all-in mode" : "On-screen keyboard for game play",
    role: "region",
    hidden: () => phase() !== "playing",
  });

  // All-in toggle row
  const allInBtn = h("button", {
    class: () => `lb-kb-allin${allInMode() ? " on" : ""}`,
    type: "button",
    onClick: openAllIn,
    "aria-label": () => allInMode() ? "Fold and resume normal play mode" : "Enter all-in mode: type all remaining letters and submit for bonus points or lose all lives",
    text: () => allInMode() ? "FOLD" : "ALL IN",
    disabled: () => casc() && !allInMode(),
  });
  const stakeLbl = h("span", {
    class: "lb-kb-stake",
    "aria-live": "polite",
    "aria-label": () => {
      const wagerCount = allInMode()
        ? wagers().reduce((acc, w) => acc + (w?.length || 0), 0)
        : (active() !== null ? (wagers()[active()]?.length || 0) : 0);
      if (wagerCount > 0) return `${wagerCount} positions staked for 2 times points`;
      if (allInMode()) return "Type the remaining letters of the phrase";
      return "";
    },
    text: () => {
      const wagerCount = allInMode()
        ? wagers().reduce((acc, w) => acc + (w?.length || 0), 0)
        : (active() !== null ? (wagers()[active()]?.length || 0) : 0);
      if (wagerCount > 0) return `${wagerCount}× STAKED`;
      if (allInMode()) return "TYPE THE REST";
      return "";
    },
  });

  const kbActions = h("div", { class: "lb-kb-actions" }, allInBtn, stakeLbl);
  const kbHost = h("div", { html: kb.html });
  kbWrap.append(kbActions, kbHost);
  // Hydrate the keyboard once it's in the tree.
  queueMicrotask(() => {
    const root = kbHost.querySelector('[data-bn="keyboard"]');
    if (!root) return;
    kb.hydrate(root);
    // iPhone workaround: @basenative/keyboard@1.0.0's preventFocusSteal
    // calls preventDefault on touchstart, which on iOS Safari suppresses
    // the synthetic click that the keyboard's dispatch handler relies on.
    // Synthesize a click on touchend so the dispatch fires on iPhone.
    // Drop this once the package bumps to 1.0.1 (fix lands upstream).
    root.addEventListener("touchend", (e) => {
      const btn = e.target && e.target.closest && e.target.closest("[data-bn-kb-key]");
      if (!btn || btn.disabled) return;
      e.preventDefault();
      btn.click();
    }, { passive: false });
  });

  // ── End-state overlays ──
  const wonOverlay = createEndOverlay({
    open: () => phase() === "won" && !!reveal(),
    title: "Solved",
    titleClass: "lb-ct win",
    session,
    score,
    reveal,
    onShare: () => onShare({ won: true }).then(label => shareLbl.set(label)),
    shareLbl,
    primaryLabel: "Pick another",
    onPrimary: goLobby,
    secondary: null,
  });

  const lostOverlay = createEndOverlay({
    open: () => phase() === "lost" && !!reveal(),
    title: "House Wins",
    titleClass: "lb-ct lose",
    session,
    score,
    reveal,
    onShare: () => onShare({ won: false }).then(label => shareLbl.set(label)),
    shareLbl,
    primaryLabel: "Try again",
    onPrimary: () => retry(),
    secondaryLabel: "Pick another",
    onSecondary: goLobby,
    subtitleSuffix: " · the answer was",
  });

  return h("div", { class: "lb-play-host" },
    ariaLive,
    h("main", { "aria-labelledby": "lb-play-title" },
      h("h1", { id: "lb-play-title", class: "sr-only", text: () => `${session().category} — round #${session().id}` }),
      h("div", { class: "lb-num", text: () => `#${session().id} · ${session().category.toLowerCase()}` }),
      h("div", { class: "lb-sticky", text: () => session().category }),
      h("div", { class: "lb-sub" },
        () => `${session().words.length} words · ${session().totalLetters} letters · by `,
        h("b", { text: () => session().submittedBy || "?" }),
      ),
      h("div", {
        class: () => `lb-hint ${active() !== null ? "on" : ""}`,
        "aria-live": "polite",
        text: hintText,
      }),
      cbar,
      phraseGrid,
      bank,
    ),
    kbWrap,
    wonOverlay,
    lostOverlay,
  );
}

function createEndOverlay({
  open, title, titleClass,
  session, score, reveal,
  onShare, shareLbl,
  primaryLabel, onPrimary,
  secondaryLabel, onSecondary,
  subtitleSuffix = "",
}) {
  const card = h("div", {
    class: "lb-card",
    role: "dialog",
    "aria-modal": "true",
    onClick: (e) => e.stopPropagation(),
  },
    h("div", { class: titleClass, text: title }),
    h("div", { class: "lb-cs", text: () => `${session().category}${subtitleSuffix}` }),
    h("div", { class: "lb-reveal", text: () => (reveal() || []).join(" ") }),
    h("div", { class: "lb-cred" },
      "submitted by ",
      h("b", { text: () => session().submittedBy || "?" })
    ),
    h("div", { class: "lb-cf", "aria-label": () => `Final score ${score()} points`, text: () => String(score()) }),
    h("div", { class: "lb-cfl" }, "points"),
    h("button", {
      class: "lb-btn lb-bp",
      type: "button",
      text: () => shareLbl() || "Share result",
      onClick: onShare,
    }),
    secondaryLabel
      ? h("button", { class: "lb-btn", type: "button", onClick: onSecondary }, secondaryLabel)
      : null,
    h("button", { class: "lb-btn lb-bs", type: "button", onClick: onPrimary }, primaryLabel),
  );

  return h("div", {
    class: "lb-ov",
    hidden: () => !open(),
  }, card);
}
