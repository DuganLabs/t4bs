# Tabs (T4BS) — Product Requirements Document, v2

> Status: **v2 — ground-up redesign, 2026-09-13** · Owner: Warren Dugan
>
> v1 of this document described the game as shipped through 2026-09-11. This
> version replaces it. §0 says why; everything after it is the game as it is
> being rebuilt. The v1 text is in git history (`docs/PRD.md` at `d1361ec`).

---

## 0. Why v2 exists

The numbers on 2026-09-13, from the production database:

| | |
|---|---|
| Rounds started, all time | 603 |
| Rounds started, last 7 days | 139 |
| Daily results recorded, all time | **1** |
| Daily results won | **0** |
| Approved puzzles | 12 |
| Share cards minted | 14 |

People start rounds. Nobody finishes one. The daily — the entire retention
mechanic — has been completed once in the product's life, and that one was a
loss.

Playing it explains the table. A round is four lives shared across the whole
phrase, and **any word guess that is not letter-perfect spends one.** On a
six-word phrase that is three misses in total. Two wrong three-letter guesses
(one staked) took a fresh round from four lives to one. The difficulty is
bimodal: recognise the phrase from the category and two anchor letters and the
round is trivial — type six words, done, no tension at all. Fail to recognise
it and there is no path in: Wordle-style feedback is built for deducing one
word over six attempts, and this hands out three attempts for six words.

The mechanics do not cohere because each was added to patch the last. Stakes
were "decorative" until they were given a life cost; anchors were added because
ten house puzzles "started from a blank grid against a shared pool of four
lives"; cascade tokens were added to hand back the letters the lives took away;
ALL IN is a game-over button whose instructions name a SHOVE control that does
not exist. Seven systems — lives, score, per-word feedback, stakes, cascades,
anchors, all-in — to deliver one decision the player never actually feels.

Twelve puzzles cannot sustain a daily. The picker is `hash(day) % 12`.

## 1. The game

**Tabs** is a word-guessing puzzle. One category. One hidden phrase, one row of
tiles per word. You type letters into a word's open tiles and submit; every
tile comes back **green** (right letter, right place — it locks), **yellow**
(in this word, elsewhere) or **dark** (not in this word). Letters you learn
carry across words. A few **anchor** tiles are turned over at the start. You
can **stake** a tile you're sure of for double points, bank a **reveal** by
solving a word clean, and go **ALL IN** on the whole remaining phrase.

This is the original game restored (commit `95f37cf`), with one economy fixed
— see `docs/tuning-proposal.md`, decided by the owner 2026-09-14. The
reveal-a-letter experiment that replaced it for a day (#109) is gone.

### 1.1 A round

1. The board shows the category and the phrase as rows of tiles, anchors
   locked. Every word shows how many attempts it has.
2. Pick a word (the first open one is active), type letters into its open
   tiles, tap tiles to stake them, press Enter.
3. The server judges the word. Greens lock. A miss spends one of **that
   word's** attempts — 3 for a word of 1–3 letters, 4 for 4–6, 5 for 7+.
4. Every attempt stays on the board: the active word is laid out Wordle-style,
   past rows above the live row; every other word shows its current row and a
   strip of its past attempts (tap to expand).
5. A word out of attempts is **busted**: revealed, worth nothing, and the round
   continues. The round ends **Solved** when every word is green, or
   **Finished** once every word is solved or busted with at least one bust.
   Only Solved counts for the streak.

### 1.2 Scoring

+5 per new green, −1 per wrong tile, +10 per word solved. A staked tile
doubles both ways: +10 right, −5 wrong, no attempt spent for the stake. A
word solved with no misses banks a reveal (⚡): tap any hidden tile in any
open word for a free letter. ALL IN: type the whole remaining phrase; right
pays +8 per tile still hidden, wrong busts every open word. **Par** is what a
clean solve scores (5 per non-anchor tile + 10 per word) unless an admin sets
one; the end card and share card show the score against it.

### 1.3 What is gone

Four lives for the whole phrase; a stake that cost a life; the letter-reveal
mechanic. Nothing else was removed.

### 1.4 One puzzle a day — and it is the home page

- **Daily:** one puzzle per UTC day, the same for everyone, one attempt,
  recorded, drives the streak. Picked from a **schedule** (§4.3), not a hash
  over the catalogue, so it cannot repeat until the catalogue has cycled and
  an admin can pin a puzzle to a date.
- **The page at `/` is that puzzle.** No lobby, no list of categories, no
  numbered "rounds". A visitor lands on the board with its anchors turned over
  and plays; a visitor who has played today lands on their result and the
  countdown. Sharing `t4bs.com` therefore always lands people on the right
  game, and a share link (`/s/{id}`) sends its reader home, not to the sender's
  puzzle.
- **There is no player-facing free play.** Categories have phrases, not
  rounds, and the list of them — phrase showing — is a moderator's surface:
  `/moderate` carries the catalogue with a *Preview* per phrase
  (`/play?play=<id>`), which opens that one puzzle without touching the daily
  or a streak. (Owner, 2026-09-13: "Categories don't have rounds. Stop making
  this the home page. It should be play 1 game a day.")

### 1.5 Sharing

End of round → share card. The grid shows which tiles were revealed and which
were still hidden at the solve — the hidden ones are the brag. Score against
par, category, streak. Same `/s/{id}` mechanism and OG pipeline as v1.

## 2. Goals and non-goals

Unchanged from v1, restated:

1. **Be a great game.** Tight loop, mobile-first, shareable, and — new —
   *finishable*. The measure is daily completions, which is currently one.
2. **Showcase BaseNative.** Every surface is built from `@basenative/*`.
3. **Free, ad-free, account-optional.** Play never needs an account.
4. **Polished.** Focus, motion preferences, haptics, sub-100ms perceived latency.

Non-goals: multiplayer, monetisation, native apps, browsers older than the last
two versions.

## 3. Content

Twelve puzzles is the other half of why the daily failed. v2 ships with a
catalogue of **at least 365** puzzles across the existing categories plus new
ones (idioms, song titles, book titles, landmarks, foods, sayings), authored
in `shared/seed-puzzles.js` with anchors and par, and applied by migration.
The submission queue stays for community phrases; it is no longer the only
source.

Rules for a puzzle (`shared/submission.js`, unchanged shape):
2–10 words, each 2–10 letters, 36 letters total at most, letters and spaces
only, at least one anchor and at most `maxAnchors(words)`. New: `par`
(integer, computed from the phrase if absent).

## 4. Admin

The v1 admin was two screens — a submission queue and a role picker — for a
catalogue nobody submitted to (0 pending, 3 users). v2's admin is the tool for
running the game.

One route, `/admin`, admin-only, tabbed (`@basenative/components` tabs):

### 4.1 Catalogue
Every puzzle: category, phrase, anchors, par, source, status, **plays / win
rate / median score** from `sessions`. Search and filter. Edit phrase,
category, anchors, par. Retire a puzzle (status `retired` — never deleted;
sessions and share cards reference it). Add a puzzle directly, bypassing the
queue.

The win-rate column is the point: a puzzle with 40 plays and a 5% win rate is
mis-anchored or mis-parred, and this is where you see it.

### 4.2 Daily
The next 30 days as a list, each with its scheduled puzzle. Pin any puzzle to
any future date; unpinned days fill from the shuffled cycle. Past days show
plays, completions, win rate.

### 4.3 Schedule model
`daily_schedule (day PK, puzzle_id, pinned INTEGER)`. A cron-free approach:
when `/api/daily` is asked for a day that has no row, the server fills it —
next unused puzzle in a deterministic shuffle of the catalogue seeded once —
and writes the row. Pinned rows are never overwritten. Result: no repeats until
every puzzle has been today's, and an admin can override any day.

### 4.4 Queue
The existing moderation queue, rendered by `@basenative/admin`, with the one
thing it lacked: reject asks for confirmation and a reason (T4-021), and
rejected items remain visible in a "decided" list.

### 4.5 People
The existing role management.

### 4.6 Stats
Rounds by day, daily completion rate, streak distribution, share cards. The
table in §0, live.

## 5. Data model

| Table | Change |
|---|---|
| `puzzles` | `+ par INTEGER`, `+ status 'retired'` in the CHECK, `+ plays/wins` are computed, not stored |
| `sessions` | `state` JSON is the v2 engine state (§6); v1 sessions are invalid and are purged by migration |
| `daily_schedule` | **new** — `day TEXT PK, puzzle_id INTEGER, pinned INTEGER DEFAULT 0` |
| `daily_results` | unchanged |
| `share_cards` | `grid` now encodes revealed/hidden per tile; `+ par INTEGER` |
| `submissions` | `+ reason TEXT` for rejections |
| `users`, `credentials`, `challenges`, `user_sessions` | unchanged |

## 6. Engine

`shared/engine.js` is rewritten. The store interfaces (`puzzles`, `sessions`,
`onFinish`) are kept so the D1 wiring and the Vite mock do not change.

State per session:

```
{ puzzleId, mode, day, playerKey, started,
  lives: 5, revealed: Set<letter>, missed: Set<letter>,
  solveAttempts: number, finished: null|'won'|'lost', score: 0 }
```

Operations — every one server-authoritative, the phrase never leaves the
server before `finished`:

- `startSession(puzzleId, opts)` → public shape: category, word lengths,
  anchor reveals, lives, par.
- `guessLetter(sessionId, letter)` → `{ hit: boolean, positions: [{wi, li}],
  lives, revealedCount, finished }`. A repeated letter is a no-op, not a life.
- `solve(sessionId, phrase)` → `{ correct, score, lives, finished, reveal }`.
  Wrong: `lives - 1`, nothing revealed.
- `resumeSession(sessionId)` → current board.

Scoring, pure, in `shared/pure.js`: `hiddenAtSolve * 10 + livesLeft * 5`.

## 7. Client

Same architecture as v1 (BaseNative SSR default, hydration client, `?legacy=1`
fallback). The play view is rebuilt:

- **Board**: words as tile groups; anchors and revealed letters filled;
  hidden tiles blank. Tap does nothing on the board — the keyboard is the
  only input, which removes the whole class of "which word am I in" bugs.
- **Keyboard**: `@basenative/keyboard`, with keys in three states: untried,
  hit, miss.
- **SOLVE**: one primary button. Opens a sheet with the phrase's word shape
  and a text input; Enter submits. Escape or "Keep guessing" closes it.
- **Status line**: lives as five marks, current score-if-solved-now, par.
  That one number — "solve now for 80" — is what makes the decision visible.
- **End dialog**: solved / revealed, score against par, streak, share.

Everything works without JavaScript for the first paint; the round itself
needs it, as in v1.

## 8. What this replaces in the backlog

Of the nine open t4bs tickets, four are made moot by the rewrite and are
closed by the PR that lands it: T4-030 (SHOVE — ALL IN is gone), T4-032
(submit category — the picker is rebuilt on the catalogue), T4-052 (dead
puzzle link copy — rebuilt), T4-053 (the FAB — the lobby is rebuilt). T4-021
is delivered by §4.4. The remaining four are independent of gameplay and
stay: T4-031 (404 hydration), T4-033 (analytics token), T4-051 (share-link
404 copy), T4-054 (legacy CSS reset).

## 9. Delivery

In order, each its own PR, each playable when it lands:

1. **Engine v2 + tests** — `shared/`, the three API routes, session purge
   migration. Nothing visible changes yet; the old client breaks against it,
   so this and (2) merge together.
2. **Play view v2** — the board, keyboard, SOLVE, end dialog, share grid.
3. **Content** — 365+ puzzles, `par`, `daily_schedule`, the scheduler.
4. **Admin v2** — catalogue, daily, queue with reasons, people, stats.
5. **Lobby copy and the four surviving tickets.**

## 10. Glossary

- **Anchor** — a letter revealed at the start. Every puzzle has at least one.
- **Life** — one of five. Lost on a missed letter or a wrong solve.
- **Solve** — typing the whole phrase. The only way to win.
- **Par** — the score a strong player gets on this puzzle.
- **Daily** — the day's one puzzle, scheduled, one attempt, drives the streak.
- **Streak** — consecutive UTC days whose daily was solved.

---

_v2 written 2026-09-13 against production data and a played round. Not yet
verified against code: nothing in §6–§7 exists until delivery step 1 merges._
