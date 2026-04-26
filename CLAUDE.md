# Tabs (T4BS) — Claude Code playbook

> Visual mark: `T4BS`. Public name: **Tabs**. Secret: *Time For BS*. Made by The Synonym Toast Bunch.
>
> This file gives Claude Code the project's quick context. Before doing significant work, also read [docs/PRD.md](docs/PRD.md).

## Stack at a glance

- **Frontend:** Vite + React 18 (SPA today). Targeted to migrate to BaseNative SSR runtime in M3.
- **Backend:** Cloudflare Pages Functions (`functions/**`). Worker runtime.
- **DB:** Cloudflare D1 (`tabs-db`). Binding `env.DB`.
- **KV:** `OG_CACHE` for rendered PNGs + cached fonts/wasm.
- **Auth:** WebAuthn (passkeys) via `@simplewebauthn/*`. Will migrate to `@basenative/auth-webauthn` in M1.
- **Migrations:** `migrations/*.sql`. Apply with `npm run db:migrate:local|remote`.

## Repo layout

```
t4bs/
├── src/                       # Vite app
│   ├── App.jsx                # entire game UI (one big file — engine.js does the logic)
│   ├── lib/
│   │   ├── api.js             # client API wrapper
│   │   ├── share.js           # share-card mint + native-share
│   │   ├── persist.js         # local session-resume helper
│   │   └── auth.js            # passkey client helpers
│   └── main.jsx
├── shared/
│   └── engine.js              # game core (lives, score, anchors, locks, ALL IN)
├── functions/
│   ├── _shared/
│   │   ├── d1.js              # D1 store factories
│   │   ├── og.js              # satori + resvg-wasm OG renderer
│   │   ├── util.js            # auth, role helpers, JSON/cookie helpers
│   │   └── webauthn.js        # WebAuthn rp + stores
│   ├── api/
│   │   ├── auth/              # WebAuthn endpoints
│   │   ├── moderate/          # decide/pending/promote/users
│   │   └── share-cards.js     # mint endpoint
│   ├── og/                    # /og/[name].png + /og/score/[id].png
│   └── s/[id].js              # crawler-facing share landing
├── migrations/                # D1 migrations (use wrangler d1 migrations apply)
├── public/                    # static assets (favicon.svg, og default fallback if any)
├── docs/PRD.md                # canonical spec
└── wrangler.toml              # CF bindings
```

## Brand rules

- **Name in copy:** "Tabs". Visual mark: `T4BS`. Don't write "T4BS" in user-facing copy except as the logo glyph or sr-only headings.
- **Tagline:** "Quick category puzzles" or "Pick a category. Solve the hidden phrase." NEVER "five-letter battle of bullshit" — that copy is dead.
- **Domain:** `t4bs.com` (kept short — Synonym Toast Bunch was too long).
- **Color tokens:**
  - bg `#0C0B09`, fg `#F0EDE4`, accent `#E8920A`, muted `#988570`
  - tile bg `#FFF3E0`, tile fg `#5C2A00`
  - tile states: green `#3F9D5B`, yellow `#E8B73B`, absent `#3A332B`
- **Type:** Bebas Neue for in-app numerics + headers. Inter on OG cards (server-rendered).

## Common dev workflows

```bash
# Local dev (Vite — no /api or /og/* working)
npm run dev

# Full CF Pages dev (wrangler — /api + /og/* + D1 + KV all working)
npm run build && npx wrangler pages dev dist --port 8788

# Apply migrations locally
npm run db:migrate:local

# Apply to prod D1 (idempotent — uses d1_migrations tracking table)
npm run db:migrate:remote

# Deploy
npm run cf:deploy   # or: gh push triggers auto-deploy via .github/workflows/deploy.yml
```

## Auth & roles

`users.role ∈ {'user','moderator','admin'}`. Admin implies moderator.

**Bootstrap:** `wrangler.toml [vars] ADMIN_HANDLES = "wmd"` is a *seed* — on successful WebAuthn login, `seedAdminRole()` (in [functions/_shared/util.js](functions/_shared/util.js)) upgrades the user's DB role to admin if their handle matches. This avoids hand-rolling SQL to bootstrap admins.

**Promotion UI:** `/admin` route, admin-only. Search a handle, promote/demote.

**Queue review:** `/moderate` route, moderators + admins.

## OG / share cards

End-of-round → client builds emoji grid → POST `/api/share-cards` mints a short id → user shares `t4bs.com/s/{id}` → crawlers hit `/s/{id}` HTML → image at `/og/score/{id}.png` rendered via satori + `@resvg/resvg-wasm`, KV-cached.

**Cache versioning:** the `og:default:vN` KV key embeds a version. Bump N (in `functions/og/[name].js`) when changing the default card design or copy so old cached PNGs invalidate.

**WASM gotcha:** CF Workers disallow dynamic WASM instantiate. The renderer uses a static import (`import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm"`). DO NOT switch to fetch-and-init.

## What's planned (in flight)

See `docs/PRD.md` Milestones + the [GitHub issues](https://github.com/DuganLabs/t4bs/issues) tied to each.

- M1 — Adopt BaseNative packages (og-image, keyboard, persist, share, admin, auth-webauthn, eslint-config, tsconfig)
- M2 — Migrate deploy.yml to `DuganLabs/.github` reusable workflows. Currently blocked by the private-repo→public-reusable-workflow access rule (see `duganlabs/docs/REUSABLE-WORKFLOWS-ACCESS.md`).
- M3 — SSR rewrite on BaseNative behind `?next=1` flag.
- M4 — Lighthouse 100/100/100/100 + axe-core 0 violations.

## Things NOT to do

- Don't introduce new direct dependencies if a `@basenative/*` package covers it.
- Don't reach for client-side JS for copy that has to render server-side (OG meta on `/s/{id}` etc.).
- Don't change `shared/engine.js` casually — it's the one large piece that stays bespoke through any rewrite.
- Don't rename "Tabs" or revert any "five-letter battle of bullshit" remnant.
