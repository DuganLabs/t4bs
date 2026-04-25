# T4BS

One subject. One phrase. No mercy.

A Wordle-killer with poker mechanics. The server holds the answer; the client only ever sees per-tile feedback. Vegas-style per-tile wagers, agency-driven cascade rewards, and an all-in shove that ends the round one way or the other.

- Stack: React 18 + Vite 5, Cloudflare Pages + Pages Functions + D1, WebAuthn passkeys.
- Live: <https://t4bs.com>

## Architecture

```
┌──── React app (static, Cloudflare Pages) ────┐
│  src/App.jsx, src/lib/api.js                 │
└─────────────┬────────────────────────────────┘
              │  /api/*  (same-origin fetch)
              ▼
┌──── Cloudflare Pages Functions ──────────────┐
│  functions/api/*  (game, auth, submit, mod)  │
│  shared/engine.js (pure game logic)          │
│  functions/_shared/d1.js (D1-backed stores)  │
└─────────────┬────────────────────────────────┘
              ▼
┌──── D1 (SQLite) ─────────────────────────────┐
│  puzzles, sessions, users, credentials,      │
│  challenges, user_sessions, submissions       │
└──────────────────────────────────────────────┘
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
npm run build && npm run cf:dev   # wrangler pages dev on :8788
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
- `ADMIN_HANDLES=warren`        ← comma-separated handles allowed at `/moderate`
- `SESSION_TTL_DAYS=30`

### 3. Bind the domain

In the Cloudflare dashboard → Pages → t4bs → Custom domains, add `t4bs.com` and `www.t4bs.com`. Cloudflare will auto-create CNAMEs in the zone.

### 4. Doppler

```bash
doppler login
doppler setup -p t4bs -c prod
doppler secrets set CLOUDFLARE_API_TOKEN=...
doppler secrets set CLOUDFLARE_ACCOUNT_ID=...
```

The Cloudflare API token needs:
- Account → Cloudflare Pages → Edit
- Account → D1 → Edit
- Zone → Workers Routes → Edit
- Zone → Zone → Read

See `doppler-template.yaml` for the full reference.

### 5. GitHub Actions

In the GitHub repo (`DuganLabs/t4bs`), add one secret:

- `DOPPLER_TOKEN` — a Doppler service token for the `prod` config.

Now `git push origin main` will:
1. Build the static site.
2. `wrangler pages deploy dist` against your Pages project.
3. Re-apply `schema.sql` (idempotent — `CREATE TABLE IF NOT EXISTS`).

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
├── src/                       React app
│   ├── App.jsx
│   ├── lib/
│   │   ├── api.js             fetch wrapper
│   │   └── auth.js            passkey browser helpers
│   └── main.jsx
├── shared/                    Pure game logic (used by mock + Functions)
│   ├── pure.js                evalWord, scoreGuess, openSlots, …
│   ├── engine.js              startSession, submitGuess, spendCascade, allIn
│   └── submission.js          submission validation
├── server/                    Local Vite dev only
│   ├── mock.js                middleware mounting engine on /api/*
│   └── stores-memory.js       in-memory implementations
├── functions/                 Cloudflare Pages Functions
│   ├── _middleware.js         security headers
│   ├── _shared/
│   │   ├── d1.js              D1-backed engine stores
│   │   ├── util.js            response helpers, auth context
│   │   └── webauthn.js        WebAuthn config + helpers
│   └── api/
│       ├── puzzles.js
│       ├── session.js
│       ├── guess.js
│       ├── cascade.js
│       ├── allin.js
│       ├── submit.js
│       ├── auth/{register,login}-{options,verify}.js, me.js, logout.js
│       └── moderate/{pending,decide}.js
├── schema.sql                 D1 schema
├── seed.sql                   initial puzzles
├── wrangler.toml              Pages + D1 binding config
├── .github/workflows/deploy.yml   CI/CD via Doppler
└── doppler-template.yaml      reference for Doppler secrets
```
