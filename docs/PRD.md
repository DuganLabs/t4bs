# T4BS — Product Requirements Document

> Status: **draft** · Owner: Warren Dugan · Last updated: 2026-04-26
>
> This PRD is the canonical source of truth for what t4bs is, who it's for, and what it does. Issues and milestones in [DuganLabs/t4bs](https://github.com/DuganLabs/t4bs) reflect this document — when reality drifts, update the doc *and* the issues.

---

## 1. Overview

**Tabs** (visual mark `T4BS`, secret meaning *Time For BS*) is a quick category puzzle. The player gets a single category, a hidden multi-word phrase, and four lives **shared across the whole phrase** — any word guess that isn't fully correct spends one, whichever word it was. They type letters into the tiles, *stake* the positions they're sure about (double points if right, one extra life if wrong), and gamble on a final ALL IN guess for the kill. Every guess is server-authoritative — the answer never crosses the wire until the round is over.

There is one **daily** puzzle per UTC day, the same one for every player, chosen server-side and recorded once per player per day; solving it grows a streak. **Free play** is the rest of the catalogue, unlimited and unrecorded.

The game is the public flagship for **BaseNative** (DuganLabs's open-source shared runtime + abstractions library). When BaseNative ships a new primitive — auth, OG image rendering, virtual keyboard, admin tooling — Tabs is where it gets shown off in production.

Made by **The Synonym Toast Bunch** (the group; the game's domain is `t4bs.com` because Synonym Toast Bunch is too long).

### One-line pitch
"Pick one, solve it. Stake what you know, gamble on what you don't."

---

## 2. Goals

1. **Be a great game.** Tight loop: 30–90 seconds per round, addictive, mobile-first, sharable.
2. **Showcase BaseNative.** Every architectural decision should make BaseNative look good. If t4bs needs something BaseNative can't do, that's a BaseNative bug.
3. **Stay free, ad-free, account-optional.** Anyone can play unauthenticated. Auth gates submission/moderation, never play.
4. **Polished UX.** "DIALED" is the bar. Focus management, motion preferences, haptics, sub-100ms perceived latency.

## Non-goals

- Multiplayer or real-time PvP. The game is single-player vs the house.
- Monetization. No ads, no subscriptions, no IAPs.
- Native mobile apps. PWA is fine; native is overkill for this scope.
- Cross-platform parity beyond modern browsers (Safari/Chrome/Firefox, last 2 versions).

---

## 3. Users

### Primary: the player
Curious, casually competitive, plays on phone in spare moments. Wants quick rounds, fair difficulty, and shareable wins. Does not want an account.

### Secondary: the contributor
Wants to submit phrases for the queue. Needs an account (passkey only). May earn moderator status.

### Tertiary: the moderator / admin
Approves submission queue, manages other moderators (admin-only). Lightweight tool, not a CMS.

---

## 4. Key flows

### 4.1 Play a round
1. Lobby → *today's puzzle* (server-picked, one per UTC day, once per player) or a
   free-play card → server creates a session, returns words/anchors/lives/score.
   Anchor letters are mandatory content, not optional flavour: every puzzle opens
   with at least one position revealed.
2. Type letters into tiles using on-screen keyboard.
3. Tap a tile to *stake* it — double points on that position if it's right, one
   extra life lost if any staked position is wrong (capped at one extra per guess).
4. Submit guess → server reveals green/yellow/absent feedback per position, and
   spends a life unless the word came back fully correct.
5. Repeat until phrase solved or out of lives. The knowledge panel under the grid
   keeps words-solved / letters-known / lives-left visible throughout.
6. End-state overlay: solved → confetti + share; busted → reveal answer + retry/share.
7. Resume mid-round if user reloads (server is authoritative; client localStorage holds session id).

### 4.2 ALL IN
Mid-round, player can press ALL IN to type the *full* remaining phrase in one shove. If correct, max bonus. If wrong, game over.

### 4.3 Submit a phrase
Authenticated user → submit form → preview → POST → enters `submissions` queue with `status='pending'`.

### 4.4 Approve queue (mods + admins)
`/moderate` → list of pending submissions → approve (copies into `puzzles` table) or reject. Audit trail in `decided_by`.

### 4.5 Promote a moderator (admins only)
`/admin` → search by handle → promote to moderator/admin or demote to user. Audit trail in `users.role_changed_*`.

### 4.6 Share a result
End-state → "Share result" → POST `/api/share-cards` mints an id → native share sheet with text + `https://t4bs.com/s/{id}` URL → recipient sees a custom OG card with their score, category, and tile grid.

---

## 5. Data model

Stored in Cloudflare D1 (`tabs-db`).

| Table | Purpose | Key fields |
|---|---|---|
| `puzzles` | Approved phrases playable from the lobby | `id`, `category`, `phrase`, `anchors` (JSON), `submitted_by`, `status` |
| `daily_results` | One row per player per UTC day — makes the daily un-replayable and the streak real | `player_key`, `day`, `puzzle_id`, `outcome`, `score` (PK `player_key,day`) |
| `submissions` | Pending/decided user submissions | `id`, `category`, `phrase`, `anchors`, `submitted_by`, `status`, `decided_by`, `decided_at` |
| `sessions` | Active in-flight game sessions | `id`, `puzzle_id`, `state` (JSON of engine state), `updated_at` |
| `users` | Authenticated users | `id`, `handle` (unique CI), `role` (`user`\|`moderator`\|`admin`), `role_changed_*` |
| `credentials` | WebAuthn passkeys | `id`, `user_id`, `public_key`, `counter`, `transports` |
| `challenges` | Short-lived WebAuthn challenges | `challenge`, `user_id`, `purpose`, `expires_at` |
| `user_sessions` | Active auth sessions (cookie tokens) | `id`, `user_id`, `expires_at` |
| `share_cards` | Minted share-card records | `id` (slug), `session_id`, `user_id`, `category`, `score`, `won`, `grid` |

**KV:** `OG_CACHE` namespace caches rendered PNGs (`og:default:v1`, `og:score:{id}`) and font/wasm assets (`font:inter-{weight}`, `wasm:resvg-{ver}`).

---

## 6. Design principles

- **Server is the source of truth.** Letters, scores, lives, anchors — all server-computed. Client renders what the server returns.
- **The answer never crosses the wire** until the round is finished.
- **Mobile-first, thumb-reachable.** All actions sit within the bottom 60% of the screen.
- **Motion has meaning.** Tile flips signal feedback. Confetti signals win. `prefers-reduced-motion` honored.
- **Color tokens (canonical):** bg `#0C0B09` · accent `#E8920A` · tile `#FFF3E0` · letter `#5C2A00` · green `#3F9D5B` · yellow `#E8B73B` · muted `#988570`.
- **Type:** `Bebas Neue` for in-app numerics + headers (current); Inter on OG cards (server-rendered).
- **A11y is product, not polish.** Labels, focus rings, ARIA-live for score updates, hit-targets ≥ 44pt.

---

## 7. Architecture

### Today (Apr 2026)
- Vite SPA (React 18) on Cloudflare Pages.
- Cloudflare Pages Functions (Workers runtime) for `/api/*`, `/og/*`, `/s/*`.
- Cloudflare D1 for persistence.
- Cloudflare KV for OG image cache.
- WebAuthn auth via `@simplewebauthn/*`.
- Satori + `@resvg/resvg-wasm` for OG image rendering.

### Target (Phase 3 of [the program](../../../.claude/plans/how-does-anyone-become-sprightly-steele.md))
- BaseNative SSR runtime replaces Vite SPA shell.
- `@basenative/router`, `@basenative/components`, `@basenative/keyboard`, `@basenative/og-image`, `@basenative/admin`, `@basenative/persist`, `@basenative/share`, `@basenative/auth` (with WebAuthn adapter).
- `shared/engine.js` is the only large piece staying bespoke — it encodes the game itself.

---

## 8. Milestones

> Each milestone maps 1:1 to a GitHub milestone. Issues under the milestone reflect the work.

### M0 — Phase 0 stop-gaps (✅ shipped Apr 2026)
- Real moderator role + DB-driven permissions.
- Static OG meta on home, dynamic per-score OG cards via satori + resvg-wasm.
- Admin promotion UI.
- **Commit:** `a4fddfe`.

### M1 — BaseNative readiness (planned)
- New BN packages: `og-image`, `keyboard`, `admin`, `persist`, `share`, `eslint-config`, `tsconfig`, `wrangler-preset`, `doppler`.
- Each: signal-based API, <5KB where applicable, a11y audit, tests, docs.
- BaseNative root → 0.4.0.

### M2 — Org uniformity (planned)
- All DuganLabs projects on shared eslint/tsconfig/wrangler/Doppler stack.
- Reusable workflows in `DuganLabs/.github`.
- Sequence: basenative → duganlabs → ralph-station/warren-sys → t4bs → warrendugan → pendingbusiness → greenput.

### M3 — t4bs clean rewrite on BaseNative (planned)
- Same DB, same domain. Migrate views one at a time behind `?next=1`.
- SSR + streaming. Playable with JS off for first guess (showcase progressive enhancement).
- View Transitions API for screen changes.

### M4 — Polish + launch (planned)
- Lighthouse 100/100/100/100 on `/play`.
- A11y audit (axe + manual SR).
- ≤30KB JS gzipped first paint.
- BaseNative blog post: "How we rebuilt t4bs on BaseNative."

---

## 9. Open questions

- Mobile haptics: should ALL IN trigger a heavy haptic? Currently subtle.
- Submission moderation: should rejected submissions surface a reason to the submitter?
- Share card variants per platform? Current single-card works everywhere; could ship dedicated Twitter / Discord variants.
- Leaderboards? Out of scope for M0–M3, but worth a parking-lot.

---

## 10. Glossary

- **Anchor** — a letter pre-revealed at game start (helps the player bootstrap).
  Required: `validateSubmission` rejects a phrase with none, and the ten house
  puzzles carry two each (`shared/seed-puzzles.js`).
- **Stake** — a bet on a single tile position, consumed on submit. Double points
  if that position comes back green; **one extra life** if any staked position
  doesn't. It was score-only (and therefore free, since score floors at zero)
  until 2026-09-11.
- **Life** — one of four, **shared across the entire phrase**. Spent by any word
  submission that isn't fully correct, and by a busted stake.
- **ALL IN** — a single shove of the entire remaining phrase; max bonus or game over.
- **House** — the default `submitted_by` value for puzzles bundled with the app.
- **Cascade** — a spendable ⚡ token earned by solving a word with no prior wrong
  attempts on it; spending one reveals any single tile in any unsolved word.
  (This entry used to read "animation of a correct word locking from left to
  right", which was never what the engine did — see `shared/engine.js`.)
- **Daily** — the one puzzle available for a given UTC day, the same for every
  player, picked by `shared/daily.js` and recorded once per player in
  `daily_results`. Not replayable for score.
- **Streak** — consecutive UTC days whose daily was solved. Server-side, so it
  survives a new device and can't be inflated by replaying free play.
