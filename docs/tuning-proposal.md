# Tabs — tuning proposal for the word-guessing game

> Status: **proposal, 2026-09-14** · for the owner's decision before any code moves.
>
> Context: v2 (reveal-a-letter, PR #109) replaced the game's mechanic instead of
> fixing its economy, and the owner rejected it: "I'm just randomly pressing away
> at arbitrary letters. It's nothing like the game I asked for, had or wanted."
> This document is what to change about the ORIGINAL game — the one at commit
> `95f37cf` — and, just as important, what not to.

## 1. The game we are keeping

One category. One hidden multi-word phrase. Each word is a row of tiles. You
type letters into a word's open tiles, submit, and every tile comes back
**green** (right letter, right place), **yellow** (in this word, wrong place) or
**dark** (not in this word). Greens lock. Letters you've learned carry across
words — a letter seen anywhere in the phrase is marked present on the keyboard.
A few **anchor** tiles are turned over at the start. You can **stake** a tile
you're sure of for double points, and you can go **ALL IN** on the whole
remaining phrase for a bonus or a bust. The server judges every guess; the
answer never reaches the browser before the round is over.

That loop has deduction in every submit and a bet in every stake. It stays
exactly as it was. Restoring it is step 0 of the rollout below and touches
nothing in this proposal.

## 2. Why nobody finished a round

The numbers on 2026-09-13, from production:

| | |
|---|---|
| Rounds started, all time | 603 |
| Daily results recorded | **1** (a loss) |
| Rounds started, last 7 days | 139 |

The catalogue now has 430 phrases: 2–9 words each (median 3), 6–35 letters
(mean 15.8).

The whole problem is one rule: **four lives for the entire phrase, and any
word guess that isn't letter-perfect spends one.** Compare the attempt budget
per letter:

| | attempts | letters | attempts per letter |
|---|---|---|---|
| Wordle | 6 | 5 | 1.20 |
| Tabs v1, 2-word phrase (9 letters) | 4 | 9 | 0.44 |
| Tabs v1, 4-word phrase (16 letters) | 4 | 16 | 0.25 |
| Tabs v1, 6-word phrase (24 letters) | 4 | 24 | 0.17 |

A Wordle player gets six shots at one word. Tabs handed out three misses for
the whole board, and a busted stake took a second life on the same guess, so
two imperfect guesses could end a fresh round. The feedback loop — the part
that makes it a game — never got to run. Everything else that was bolted on
(stakes with teeth, cascade tokens, anchors, ALL IN) was a patch on that one
number.

## 3. The changes

Each change is one number or one rule, with the reason, and what it does to
the feel. They are independent; the rollout ships them one PR at a time so any
one can be reverted alone.

### 3.1 Attempts per word, not lives per phrase — the fix

Every word carries its own attempt counter. A miss spends an attempt on
**that word only**.

| word length | attempts |
|---|---|
| 1–3 letters | 3 |
| 4–6 letters | 4 |
| 7+ letters | 5 |

That is deliberately tighter than Wordle's six, because Tabs gives what Wordle
doesn't: the category, the anchors, and every letter learned from the other
words. Same 4-word / 16-letter phrase: 4 + 4 + 4 + 3 = 15 attempts instead of
4, about 0.9 per letter.

When a word's attempts run out it is **busted**: its letters are revealed in
the busted tone, it scores nothing, and the round continues — the player still
gets to finish the phrase. The round ends **Solved** when every word is green,
or **Finished** when the last unsolved word is either solved or busted with at
least one bust. Only Solved counts as a win for the streak. Nobody is left
staring at a dead board with three words unread.

Why not lives per phrase with a bigger number (say 12)? Because a shared pool
lets a player burn everything on the first word and the sixth word then has
no game in it. Per-word budgets guarantee every word is played.

### 3.2 Stakes go back to being a score bet

A stake is a sharpened claim about one tile. Right: that tile pays 2× (10
instead of 5). Wrong: −5 instead of −1 — and **no attempt is lost for the
stake itself**. The "stake with teeth" rule (a busted stake costs a life on
top of the miss) made −2 lives per guess possible and was the single fastest
way to lose; with attempts now per word it would end a word in two guesses.
The tension a stake should add is to the score, which is what the share card
shows.

### 3.3 ALL IN stays, and is honest about itself

Type the whole remaining phrase in one go. Right: +8 for every tile still
hidden, round Solved. Wrong: every unsolved word is busted, round Finished.
That is the same "game over" it always was, expressed in the new terms, and
the instructions will describe the control that actually exists (the ALL IN
button — the help text has named a SHOVE control that was never built).

### 3.4 Anchors: one per word that needs one

Today each puzzle carries two or three hand-placed anchors wherever the
submitter put them, so a six-word phrase can start with four blank words.
Rule: **every word of four or more letters gets exactly one anchor; words of
one to three letters get none** (they fall out of the category and the
neighbouring words). Applied by a catalogue migration that keeps a puzzle's
existing anchors where they already satisfy the rule and adds the missing
ones at the position that reveals the least (never the first letter). The
admin catalogue shows the count per puzzle.

### 3.5 Guess history — every attempt stays on the board

In v1 a submitted word showed its greens/yellows/darks for a beat and then
the open tiles cleared for the next attempt; the only memory of a guess was
the keyboard colour. Wordle's whole feel is that **your guesses persist and
you start a new row** — you reason from the rows above. Tabs gets the same:

- The engine records every attempt in full (`{ word, letters, feedback }`;
  v1's log kept only "which word, was it clean"), so the history is the
  server's and survives a reload.
- The **active word** is laid out like Wordle: one row per attempt, past
  attempts above with their feedback frozen, the next empty row is where you
  type. The attempt budget from 3.1 is simply the number of rows.
- Every **other word** shows one row — its current state — with a slim strip
  of its past attempts underneath (mini tiles, feedback colours only). Tap
  the word to expand it; that also makes it the active word. Solved words
  collapse to their green row; a busted word shows its rows and the reveal.
- A phrase can be nine words, so the board never shows every row of every
  word at once — only the word being worked on is tall. On a 390px phone a
  four-word phrase with the active word expanded is four rows plus three
  strips, about the height today's board already is.

The share grid gains a row per attempt for the active-word layout, the way
Wordle's does, so the brag reads as attempts used rather than tiles hidden.

### 3.6 Scoring, unchanged except where 3.2 says

+5 per new green, −1 per wrong tile, +10 for completing a word, a cascade
token for a word solved without a miss (spend it to reveal one tile
anywhere), ALL IN +8 per hidden tile. Par stays as the "strong player" score
on the end card and the share card so a number has context.

## 4. What it should do to the numbers

Targets for the first two weeks after 3.1 ships, read from the admin Stats
tab (rounds by day, daily completion, streaks):

| | v1 | target |
|---|---|---|
| Daily starters who reach an end card | ~0% (1 of the recorded starts) | ≥ 60% |
| Daily starters who Solve | 0% | 35–55% |
| Median attempts used on a solved 4-word phrase | — | 8–11 of 15 |
| Words busted per Finished round | — | 1 (rarely 2) |

If Solved lands above 65% the attempt table is too generous: drop the 4–6
letter row to 3. If it lands under 30%, raise the 1–3 letter row to 4 first
(short words are where a blind start hurts most). One row at a time, a week
between changes.

## 5. Rollout

| step | what | size | verifiable by |
|---|---|---|---|
| 0 | Restore v1 exactly: `shared/engine.js`, `shared/pure.js`, `/api/guess` + `/api/cascade` + `/api/all-in`, the v1 play view and its tests, on top of today's home page (the round plays in place on `/`), catalogue, daily schedule and admin. Letters keyboard gets ENTER and ⌫ back. | ~1 h | the v1 engine tests pass unchanged; a round on t4bs.com plays as it did at `95f37cf` |
| 1 | 3.1 attempts per word + 3.5 guess history (they are one layout: rows = attempts) | ~4 h | engine tests for the table, bust, Solved vs Finished and the full attempt log; the play view renders past rows and survives a reload with them; share grid marks busted words and attempts used |
| 2 | 3.2 stakes | ~30 m | engine tests: 2×/−5, no attempt cost |
| 3 | 3.3 ALL IN wording + bust semantics | ~30 m | help modal test; engine test |
| 4 | 3.4 anchor rule + catalogue migration | ~1 h | migration test over the 430 phrases: every ≥4-letter word has exactly one anchor, none at position 0 |

Each step is its own PR, checked and deployed from this machine. Step 0 goes
out the moment you say so; steps 1–4 wait for the decisions below.

## 6. Decisions only you can make

1. **Attempt table** (3.1): 3 / 4 / 5 by word length, or one flat number for
   every word (4)?
2. **A busted word**: continue the round with it revealed (proposed), or end
   the round on the first bust (harder, closer to v1's feel)?
3. **Stake downside** (3.2): −5 points (proposed), or keep the life cost
   (now: one attempt on that word)?
4. **History layout** (3.5): expand only the active word (proposed), or show
   every word's rows at once, Wordle-style, and accept a tall board?
