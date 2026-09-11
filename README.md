# T4BS

One subject. One phrase. No mercy.

A Wordle-killer with poker mechanics. The server holds the answer; the client only ever sees per-tile feedback. Vegas-style per-tile wagers, agency-driven cascade rewards, and an all-in shove that ends the round one way or the other.

- Stack: BaseNative signal-driven SSR (`@basenative/server` + `@basenative/router` + `@basenative/runtime`) on Cloudflare Pages + Pages Functions + D1, WebAuthn passkeys via `@basenative/auth-webauthn`. No React — the pre-BaseNative React SPA (`src/App.jsx`) was fully removed during the SSR migration.
- Live: <https://t4bs.com>

## Architecture

```
┌──── Cloudflare Pages Functions: SSR dispatch ─────────┐
│  functions/_middleware.js — every GET/HEAD (default)  │
│  src/bn/server/render.js  — renders lobby/play/submit/ │
│    moderate/admin via @basenative/server               │
│  ?legacy=1 escapes to dist/index.html + src/main.js    │
│    (also BaseNative-based, not React)                  │
└─────────────┬───────────────────────────────────────────┘
              │  hydrated client: src/bn/client/hydrate.js
              │  /api/*  (same-origin fetch)
              ▼
┌──── Cloudflare Pages Functions: API ──────────────────┐
│  functions/api/*  (game, auth, submit, moderate)       │
│  shared/engine.js (pure game logic)                    │
│  functions/_shared/d1.js (D1-backed stores)             │
│  functions/_shared/og.js (SVG + @resvg/resvg-wasm)      │
└─────────────┬───────────────────────────────────────────┘
              ▼
┌──── D1 (SQLite) ───────────────────────────────────────┐
│  puzzles, sessions, users, credentials,                │
│  challenges, user_sessions, submissions, share_cards    │
└──────────────────────────────────────────────────────────┘
```

The same `shared/engine.js` runs in two places:

1. Local dev: `vite.config.js` mounts a Node middleware (`server/mock.js`) that wires the engine to in-memory stores. No D1 required for fast iteration.
2. Production: each `/api/*` route in `functions/api/` wires the same engine to D1-backed stores.

Answers never reach the client until the round ends. The `phrase` column lives in D1; only `category`, word lengths, and pre-revealed anchor letters cross the wire on session start. Per-guess responses return only the wordle-style feedback (`green`/`yellow`/`absent`).

## Running locally

```bash
npm install
npm run dev          # vite + in-memory mock API on :5173
```

Optional — exercise the real Cloudflare runtime against a local D1:

```bash
cp .dev.vars.example .dev.vars
npm run db:apply:local      # apply schema + seed to local SQLite
npm run db:migrate:local    # apply migrations/*.sql on top (needed for /api/puzzles, /s/{id})
npm run build && npm run cf:dev   # wrangler pages dev on :8788, bound to the seeded tabs-db
```

## Production setup runbook

One-time. You need: a Cloudflare account, the `t4bs.com` zone, a Doppler project, and a GitHub repo with this code.

### 1. Create the D1 database

```bash
npx wrangler login
npx wrangler d1 create tabs-db
# → copy the printed database_id into wrangler.toml under [[d1_databases]]
```

Apply the schema and seed:

```bash
npm run db:apply:remote
```

### 2. Create the Pages project

```bash
npx wrangler pages project create t4bs --production-branch=main
```

Bind the D1 database to the Pages project (Cloudflare dashboard → Pages → t4bs → Settings → Functions → D1 database bindings):

- Variable name: `DB`
- D1 database: `tabs-db`

Set the same `[vars]` from `wrangler.toml` in the Pages project's environment variables (Settings → Functions → Environment variables, Production):

- `RP_NAME=TABS`
- `RP_ID=t4bs.com`
- `RP_ORIGIN=https://t4bs.com`
- `ADMIN_HANDLES=wmd`        ← comma-separated handles allowed at `/moderate` (see `wrangler.toml [vars]` for the live value)
- `SESSION_TTL_DAYS=30`

### 3. Bind the domain

In the Cloudflare dashboard → Pages → t4bs → Custom domains, add `t4bs.com` and `www.t4bs.com`. Cloudflare will auto-create CNAMEs in the zone.

### 4. Doppler

```bash
doppler login
doppler setup -p t4bs -c repository
doppler secrets set CLOUDFLARE_API_TOKEN=...   # see scopes below
doppler secrets set CLOUDFLARE_ACCOUNT_ID=...
doppler secrets set CLOUDFLARE_ZONE_ID=...     # the t4bs.com zone id
```

The Cloudflare API token needs (Custom Token, no expiry):
- Account → Cloudflare Pages → Edit
- Account → D1 → Edit
- Zone → DNS → Edit
- Zone → Workers Routes → Edit
- Zone → Zone → Read
- Account Resources: Include → Dugan Labs
- Zone Resources: Include → Specific zone → t4bs.com

See `doppler-template.yaml` for the full reference. (DuganLabs convention: every project uses a single `repository` config in a `repository` environment.)

### 5. GitHub Actions

`.github/workflows/deploy.yml` is a thin caller of the `DuganLabs/.github` reusable workflows (`cf-deploy.yml@v2`, `d1-migrate.yml@v2`), authenticated via Doppler. In the GitHub repo (`DuganLabs/t4bs`), add:

- `DOPPLER_TOKEN` — a Doppler service token (config `repository`; see `doppler-template.yaml`).
- `NPM_TOKEN` — passed through to both reusables for `@basenative/*` installs.

Now `git push origin main` will:
1. `cf-deploy.yml` builds the project and runs `wrangler pages deploy dist` against the `t4bs` Pages project.
2. `d1-migrate.yml` then runs `wrangler d1 migrations apply` against `tabs-db` (idempotent — tracked in the `d1_migrations` table; not a `schema.sql` re-apply).

`ci.yml` (lint/typecheck/test) and `bundle-size.yml` are currently inlined rather than reusable-workflow calls — see `CLAUDE.md`'s Milestone status (M2) for why.

## Auth

WebAuthn passkeys via `@simplewebauthn/server` and `@simplewebauthn/browser`.

- Anonymous play (no login).
- Login is required only to **submit a phrase**.
- A user is just a handle (2–24 chars, `a-z 0-9 _ -`) plus N passkey credentials.
- Admin handles (per `ADMIN_HANDLES`) get the **MOD** button + access to `/moderate`.
- Sessions: HTTP-only `t4bs_sess` cookie, 30-day TTL, stored in D1.

In dev (Vite mock), there's a `dev-login` shortcut that skips the WebAuthn ceremony — handy for testing the submission flow without setting up a passkey. The production endpoint does not expose this.

## Game rules (so the code makes sense)

- Each round: one category + one phrase laid out word-by-word with a few free anchor letters.
- Pick a word → type its letters into the tiles → press GO.
- Per-tile wordle feedback: greens lock in across attempts, yellows tell you the letter is in the phrase, absents are ruled out for that word.
- **Wager**: tap a typed tile before submitting to stake it 2× (right pays double, wrong costs double).
- **Cascade**: cold-solve a word → earn a ⚡ token → spend it by tapping any unrevealed tile in any unsolved word.
- **All-in**: at any point, fold or shove the entire phrase. Right = +8 × every unrevealed tile. Wrong = game over.
- Lives: 4 wrong word-guesses → game over. All-in counts as one swing-or-bust.

## Repo layout

```
.
├── src/
│   ├── bn/                    BaseNative SSR: server templates + client hydrator
│   │   ├── server/render.js   renderPage() — layout+header+view template composition
│   │   ├── server/manifest.js reads dist/asset-manifest.json for hashed JS/CSS
│   │   ├── client/hydrate.js  default entry — hydrates the SSR shell
│   │   ├── views/             lobby/play/submit/moderate/admin/header/layout templates
│   │   └── route-table.js     path -> route name, shared with the client router
│   ├── views/                  client-side signal-driven view renderers (post-hydration)
│   ├── components/             toast, help-modal, auth-modal
│   ├── lib/
│   │   ├── api.js              fetch wrapper
│   │   └── auth.js             @basenative/auth-webauthn client glue
│   └── main.js                 `?legacy=1` entry — same boot as hydrate.js minus the SSR seed
├── shared/                    Pure game logic (used by mock + Functions + SSR)
│   └── engine.js               startSession, submitGuess, spendCascade, allIn
├── server/                    Local Vite dev only
│   ├── mock.js                 middleware mounting engine on /api/* (incl. dev-login)
│   └── stores-memory.js        in-memory implementations
├── functions/                 Cloudflare Pages Functions
│   ├── _middleware.js          SSR dispatch (default) + `?legacy=1` escape + security headers
│   ├── _shared/
│   │   ├── d1.js               D1-backed engine stores
│   │   ├── og.js                hand-built SVG + @resvg/resvg-wasm OG renderer
│   │   ├── ssr.js               wires route-table + src/bn/server/render.js into a Response
│   │   ├── util.js              response helpers, auth context
│   │   └── webauthn.js          wraps @basenative/auth-webauthn
│   ├── api/
│   │   ├── puzzles.js, session.js, guess.js, cascade.js, allin.js, submit.js
│   │   ├── auth/                register/login options+verify, me.js, logout.js, dev-login
│   │   ├── moderate/             pending/decide
│   │   └── share-cards.js        mint endpoint
│   ├── og/                       /og/[name].png + /og/score/[id].png
│   └── s/[id].js                 crawler-facing share landing
├── schema.sql                 D1 schema
├── seed.sql                   initial puzzles
├── migrations/                D1 migrations (wrangler d1 migrations apply)
├── wrangler.toml               Pages + D1 binding config
├── .github/workflows/          deploy.yml (reusables), ci.yml + bundle-size.yml (inlined), lighthouse.yml (reusable), codeql.yml
└── doppler-template.yaml       reference for Doppler secrets
```

---

_Last verified against the code: 2026-09-11 (commit `d1361ec`)._
