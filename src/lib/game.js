/* Pure helpers shared by the BaseNative views.
   Engine logic stays in shared/engine.js (server-side).
   These functions are presentation-only — they shape session state for the UI. */

import { renderAccordion } from "@basenative/components";
import { escapeAttr, escapeText } from "@basenative/runtime/shared/escape";

export function openSlots(wordLen, locked) {
  const out = [];
  for (let i = 0; i < wordLen; i++) {
    if (locked[i] === undefined) out.push(i);
  }
  return out;
}

export function fullCount(words, locked) {
  return words.reduce(
    (acc, n, wi) => acc + (n - Object.keys(locked[wi] || {}).length),
    0
  );
}

/* Letter status for the on-screen keyboard.

   Owner's ruling (2026-09-10, bug report + follow-up): a letter ruled
   out while entering one word must stay fully usable — and correctly
   styled — when the player moves on to a subsequent word. The old
   implementation aggregated `absentByWord` across every word the
   player had tried (see git history / PR discussion) and marked a
   letter globally "absent" the moment it was ruled out of ONE tried
   word, even while other words remained untried and could still
   contain it. That read as (and was reported as) the key being
   disabled for later words.

   The fix scopes "absent" to the single ACTIVE word — the word the
   player is currently entering — and drops the cross-word
   aggregation entirely:
     green  — locked anywhere (unchanged: a letter whose position is
              already confirmed is unambiguously good news regardless
              of which word is active, and this was never part of the
              reported confusion).
     yellow — present somewhere in the phrase (`presentGlobal`) but
              not locked. This is the "elsewhere" state the ruling
              asked for: "not in this word but in the phrase". It was
              already computed this way and already took priority over
              "absent" — the bug was purely in the absent branch below.
     absent — ruled out specifically in the ACTIVE word. Says nothing
              about words the player hasn't tried yet, so switching to
              an untried word clears it back to "untried" instead of
              carrying a false "not here" verdict forward.
     (default/untried) — no claim either way yet.

   When there's no single active word (`active` is null — the brief
   window before the first word gets focus, or ALL-IN mode where the
   player fills every remaining word at once) we simply skip the
   absent computation: with no one word to scope it to, no absent
   claim is safe to make, and green/yellow keep working as before. */
export function computeKeyStatus({ session, active, locked, presentGlobal, absentByWord }) {
  if (!session) return {};
  const status = {};
  // Greens: any letter currently locked (anchors + green-locked from prior guesses)
  locked.forEach((lm) => {
    Object.values(lm || {}).forEach(L => { status[L] = "green"; });
  });
  // Elsewhere/present: letters known to be in the phrase but not locked yet
  presentGlobal.forEach(L => { if (status[L] !== "green") status[L] = "yellow"; });
  // Absent: ruled out in the ACTIVE word specifically — no claim about
  // words the player hasn't attempted yet.
  if (active !== null && active !== undefined) {
    (absentByWord[active] || []).forEach(L => {
      if (!status[L]) status[L] = "absent";
    });
  }
  return status;
}

/* Non-colour cues for each keyboard key state, so the four states the
   owner's ruling requires (untried / in this word / elsewhere in the
   phrase / not in this word) are distinguishable without relying on
   colour alone (WCAG 1.4.1). `glyph` is a small badge rendered via CSS
   (see .bn-kb-key--<state>::after in styles.css); `ariaSuffix` is
   appended to each key's aria-label so screen-reader users get the
   same information colour conveys visually. Every value below is
   unique on purpose — see game.test.js's "distinguishable without
   colour" check. */
export const KEY_STATE_INFO = {
  green:  { glyph: "✓", ariaSuffix: "confirmed in this word" },
  yellow: { glyph: "◆", ariaSuffix: "elsewhere in the phrase, not this word" },
  absent: { glyph: "✕", ariaSuffix: "not in this word" },
};

/* Group lobby puzzles by category — multiple submissions for the same subject
   collapse into a single card. Stable order: alphabetical by category. */
export function groupLobby(lobby) {
  if (!lobby) return null;
  const map = new Map();
  for (const p of lobby) {
    const key = p.category;
    if (!map.has(key)) map.set(key, { category: p.category, puzzles: [] });
    map.get(key).puzzles.push(p);
  }
  return [...map.values()].sort((a, b) => a.category.localeCompare(b.category));
}

/* ── FREE-PLAY BROWSE SHELF ──────────────────────────────────────────
   The lobby used to print ONE row per category, labelled with whatever
   `groupLobby` collapsed into it — "BY HOUSE" for a single-puzzle
   category, "2 PUZZLES" for Movie Quotes — and clicking it started a
   deterministic pick. So the rounds inside a category were unreachable
   and, worse, invisible: there was no way to tell from the lobby that
   Movie Quotes had two of them or what either one was.

   The owner's ask, clarified twice, was to "see games from other
   categories than today's puzzle on this specific screen". So each
   category is now a collapsible section listing every round it holds,
   and every round is individually startable.

   The daily is untouched and stays fixed: it is server-picked per UTC
   day, recorded once, and that is the only thing that makes the streak
   mean anything. Browsing is a free-play affordance only.

   These helpers return markup strings rather than DOM because BOTH
   trees consume them — src/bn/server/render.js interpolates the result
   into the SSR template, and src/views/lobby.js assigns it as
   innerHTML — which is what keeps the two trees identical here instead
   of merely similar. The `tag` split is the one deliberate difference
   and it is the project's established pattern: SSR emits real
   <a href="/play?play={id}"> so the shelf works with JavaScript off,
   and the hydrated SPA emits <button> because a client-side navigation
   to /play?play=… never re-runs the boot resolver that reads the query
   string. */

/**
 * Shape each category group into the rounds the browse shelf lists.
 * Rounds are sorted by puzzle id so the server and the client number
 * them identically.
 *
 * @param {{ category: string, puzzles: { id: number, submittedBy: string }[] }[] | null} groups
 */
export function browseCategories(groups) {
  if (!groups) return null;
  return groups.map((group) => {
    const sorted = [...group.puzzles].sort((a, b) => a.id - b.id);
    return {
      category: group.category,
      count: sorted.length,
      /* Summary line. @basenative/components escapes the accordion
         title as text, so the count rides in the same string rather
         than in its own element. */
      title: `${group.category} · ${sorted.length} ${sorted.length === 1 ? "round" : "rounds"}`,
      rounds: sorted.map((p, i) => ({
        id: p.id,
        label: `Round ${i + 1}`,
        credit: `by ${p.submittedBy}`,
        playHref: `/play?play=${p.id}`,
        ariaLabel: `Free play: ${group.category}, round ${i + 1}, by ${p.submittedBy}`
          + ". Practice — does not count toward your streak.",
      })),
    };
  });
}

/**
 * The rounds inside one category, as a list of start controls.
 *
 * @param {{ rounds: { id: number, label: string, credit: string, playHref: string, ariaLabel: string }[] }} cat
 * @param {"a"|"button"} tag
 */
export function renderBrowseRounds(cat, tag) {
  const rows = cat.rounds.map((r) => {
    const specific = tag === "a"
      ? `href="${escapeAttr(r.playHref)}"`
      : `type="button"`;
    return `<li><${tag} ${specific}`
      + ` data-bn-action="lobby-pick"`
      + ` data-puzzle-id="${escapeAttr(String(r.id))}"`
      + ` aria-label="${escapeAttr(r.ariaLabel)}">`
      + `<strong>${escapeText(r.label)}</strong>`
      + `<small>${escapeText(r.credit)}</small>`
      + `</${tag}></li>`;
  }).join("");
  return `<ul role="list" data-bn-region="rounds">${rows}</ul>`;
}

/**
 * The whole shelf: @basenative/components' accordion, one section per
 * category. The id is pinned rather than left to the package's
 * `nextId()` counter, which would otherwise hand the server and the
 * client different values and desynchronise the `name=` grouping that
 * makes the sections mutually exclusive.
 *
 * @param {{ category: string, puzzles: { id: number, submittedBy: string }[] }[] | null} groups
 * @param {"a"|"button"} tag
 */
export function renderBrowseShelf(groups, tag) {
  const cats = browseCategories(groups) || [];
  return renderAccordion({
    id: "lobby-browse",
    attrs: 'data-bn-region="browse"',
    items: cats.map((cat) => ({
      title: cat.title,
      content: renderBrowseRounds(cat, tag),
    })),
  });
}

/* The daily puzzle used to be picked HERE, in the browser, off the
   local calendar date (`dailySeed`/`dailyPuzzle`/`dailyFromGroups`,
   removed in this change). Nothing on the server agreed with that pick,
   so players in different time zones got different "dailies" and any
   client could POST /api/session with any id and clear the catalogue in
   one sitting. Selection now lives in shared/daily.js and is resolved
   server-side (`GET /api/daily`, `POST /api/session {mode:"daily"}`);
   the client only renders what the server says today is. */

/**
 * Everything the player has actually worked out, at phrase level.
 *
 * The grid and the keyboard show the state of ONE word at a time;
 * nothing summarised the round. Resuming mid-phrase meant counting
 * solved words and locked tiles by eye. This is the read-out behind
 * <section data-bn-region="knowledge"> in the play view.
 *
 * @param {{
 *   words: number[] | undefined,
 *   locked: Array<Record<number, string>>,
 *   wordSolved: boolean[],
 *   presentGlobal: string[],
 *   lives: number,
 *   tokens: number,
 *   livesAllowed?: number,
 * }} input
 */
export function knowledgeSummary({
  words, locked, wordSolved, presentGlobal, lives, tokens, livesAllowed = 4,
}) {
  const ws = words || [];
  const totalLetters = ws.reduce((a, n) => a + n, 0);
  const knownLetters = ws.reduce(
    (acc, _n, wi) => acc + Object.keys(locked?.[wi] || {}).length,
    0,
  );
  const solvedWords = (wordSolved || []).filter(Boolean).length;
  /* Letters proven to be in the phrase but not yet placed anywhere —
     the "you know more than the grid shows" number. */
  const lockedLetters = new Set();
  ws.forEach((_n, wi) => Object.values(locked?.[wi] || {}).forEach(L => lockedLetters.add(L)));
  const floating = (presentGlobal || []).filter(L => !lockedLetters.has(L)).length;

  return {
    solvedWords,
    totalWords: ws.length,
    knownLetters,
    totalLetters,
    floating,
    lives,
    livesAllowed,
    tokens,
    /* Which unsolved word has the highest share of letters already
       locked — the cheapest next target, and the thing players were
       eyeballing the grid to work out. */
    bestTarget: ws.reduce((best, len, wi) => {
      if (wordSolved?.[wi]) return best;
      const known = Object.keys(locked?.[wi] || {}).length;
      const ratio = len > 0 ? known / len : 0;
      if (!best || ratio > best.ratio) return { wi, ratio, known, len };
      return best;
    }, /** @type {{wi:number,ratio:number,known:number,len:number}|null} */(null)),
  };
}

export const isDev = () => !!(import.meta && import.meta.env && import.meta.env.DEV);
