# T4BS — Product Requirements Document

> Status: **draft** · Owner: Warren Dugan · Last updated: 2026-09-11 (architecture, milestones, glossary corrected against the code)
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

### Current (as of 2026-09-11)
- **BaseNative signal-driven SSR is the default render path**, not a Vite React SPA. `@basenative/server` + `@basenative/router` + `@basenative/runtime` render every route (`src/bn/server/render.js`, `src/bn/views/*`); Vite builds the hydration client (`src/bn/client/hydrate.js`) and a `?legacy=1` fallback entry (`src/main.js`) — both BaseNative-based. There is no `App.jsx` and no React anywhere in the tree; that migration is complete, not a future milestone (see §8, M3).
- Cloudflare Pages Functions (Workers runtime) for `/api/*`, `/og/*`, `/s/*`, and the SSR dispatch itself (`functions/_middleware.js`).
- Cloudflare D1 for persistence.
- Cloudflare KV (`OG_CACHE`) for OG image + font/wasm cache.
- WebAuthn auth via `@basenative/auth-webauthn` (wrapping `@simplewebauthn/server`) — also already adopted, not a target.
- OG image rendering is hand-built SVG rasterized via `@resvg/resvg-wasm` — **not** satori/`@basenative/og-image`. That package was evaluated and rejected: satori's `harfbuzzjs` dependency reads `self.location.href` at module load, which doesn't exist under the Workers runtime, and neither of its WASM-loading strategies is viable there either (see `functions/_shared/og.js`'s file header for the full writeup).
- BaseNative packages already in production: `@basenative/router`, `@basenative/components`, `@basenative/keyboard`, `@basenative/admin`, `@basenative/persist`, `@basenative/share`, `@basenative/auth-webauthn`, `@basenative/combobox`, `@basenative/eslint-config`, `@basenative/tsconfig`.
- `shared/engine.js` is the only large piece that stayed bespoke through the SSR rewrite — it encodes the game itself and is shared unchanged between the SSR path and the mock dev server.

---

## 8. Milestones

> Each milestone maps 1:1 to a GitHub milestone. All four (#2-#5) are still open on GitHub as of 2026-09-11; the status below reflects what the code actually does, which is ahead of the tracker in three of the four cases.

### M0 — Phase 0 stop-gaps (✅ shipped Apr 2026)
- Real moderator role + DB-driven permissions.
- Static OG meta on home, dynamic per-score OG cards via satori + resvg-wasm.
- Admin promotion UI.
- **Commit:** `a4fddfe`.

### M1 — BaseNative readiness (✅ done, except one item rejected)
- Adopted and in production: `@basenative/keyboard`, `@basenative/admin`, `@basenative/persist`, `@basenative/share`, `@basenative/auth-webauthn`, `@basenative/combobox`, `@basenative/router`, `@basenative/components`, `@basenative/eslint-config`, `@basenative/tsconfig` — see `package.json` and the import sites in `src/bn/`, `src/main.js`, `src/views/`.
- `@basenative/og-image` — **rejected, not pending.** Satori's `harfbuzzjs` dependency is incompatible with the Workers runtime (crashes reading `self.location.href`, and its WASM-loading fallback needs runtime `WebAssembly.instantiate(bytes)`, which Workers disallow). `functions/_shared/og.js` ships a hand-built SVG renderer via `@resvg/resvg-wasm` instead — same package this repo already uses successfully for OG rendering via a static WASM import.
- `wrangler-preset` and `doppler` BaseNative packages: not found in this repo's dependencies or the BaseNative package inventory; dropped from this list as unverifiable.

### M2 — Org uniformity (mostly done)
- `deploy.yml` and `lighthouse.yml` already call `DuganLabs/.github` reusable workflows (`cf-deploy.yml@v2`, `d1-migrate.yml@v2`, `lighthouse.yml@v2`) via Doppler-sourced secrets.
- `ci.yml` and `bundle-size.yml` are still inlined — not blocked on repo visibility (t4bs is public) but on the reusable workflows not authenticating to GitHub Packages, which 401s `npm ci` on any PR that touches the lockfile (every Dependabot PR). `DuganLabs/.github` `v2` reportedly carries the fix; switching these two back to reusables is the remaining work here.

### M3 — t4bs clean rewrite on BaseNative (✅ done)
- BaseNative SSR (`src/bn/`) is the default for every route today, not a `?next=1` opt-in. The legacy static shell lives behind `?legacy=1` instead, and even that fallback is BaseNative/signals-based (`src/main.js`), not the original React SPA.
- Same DB (`tabs-db`), same domain (`t4bs.com`).
- View Transitions API adoption was not verified in this pass — re-check before claiming it.

### M4 — Polish + launch (open)
- `lighthouse.yml` currently gates PRs at 80/95/80/95 (perf/a11y/best-practices/seo) against production, not 100/100/100/100 — the ceiling on best-practices/perf is a third-party Cloudflare bot-mitigation script that can't be removed from the repo (see that file's comments).
- No automated axe-core check runs in CI. Several axe-driven fixes exist as manual, one-off code comments (e.g. `src/bn/views/header.js`, `src/components/header.js`), not a repeatable 0-violations gate.
- JS-gzip budget is enforced (`bundle-size.yml`, 60KB budget, ~31KB actual per that file's comments) but the ≤30KB target and the launch blog post are not verified done here.

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
- **Cascade** — a spendable letter-reveal token, not an animation. Cold-solving a word on the first attempt (`priorWrongs === 0`) earns one cascade token (`shared/engine.js`'s `startSession`/guess handling sets `cascadeEarned` and increments `sess.tokens`); the player spends a token via `spendCascade(sessionId, wordIndex, letterIndex)` to reveal any unrevealed tile in any unsolved word. See §4.1 and §6 above for the player-facing flow.
- **Daily** — the one puzzle available for a given UTC day, the same for every
  player, picked by `shared/daily.js` and recorded once per player in
  `daily_results`. Not replayable for score.
- **Streak** — consecutive UTC days whose daily was solved. Server-side, so it
  survives a new device and can't be inflated by replaying free play.

---

_Last verified against the code: 2026-09-11 (commit `d1361ec`)._
