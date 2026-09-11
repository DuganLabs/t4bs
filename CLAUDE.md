# Tabs (T4BS) — Claude Code playbook

> Visual mark: `T4BS`. Public name: **Tabs**. Secret: *Time For BS*. Made by The Synonym Toast Bunch.
>
> This file gives Claude Code the project's quick context. Before doing significant work, also read [docs/PRD.md](docs/PRD.md).

## Stack at a glance

- **Frontend:** BaseNative signal-driven SSR is the default render path — no React, no `App.jsx` (that file does not exist; it was fully removed during the SSR migration). `@basenative/server` + `@basenative/router` + `@basenative/runtime` render every route server-side (`src/bn/`); Vite (`vite.config.js`) builds the hydration bundle (`src/bn/client/hydrate.js`) and a `?legacy=1` fallback entry (`src/main.js` — also BaseNative/signals-based, not React). `functions/_middleware.js` picks SSR vs. legacy per request.
- **Backend:** Cloudflare Pages Functions (`functions/**`). Worker runtime.
- **DB:** Cloudflare D1 (`tabs-db`). Binding `env.DB`.
- **KV:** `OG_CACHE` for rendered PNGs + cached fonts/wasm.
- **Auth:** WebAuthn (passkeys) via `@basenative/auth-webauthn` (server: `functions/_shared/webauthn.js`; client: `src/lib/auth.js`), itself wrapping `@simplewebauthn/server`.
- **Migrations:** `migrations/*.sql`. Production applies them via the `DuganLabs/.github` `d1-migrate.yml` reusable workflow (`.github/workflows/deploy.yml`); locally use `npm run db:migrate:local|remote`.

## Repo layout

```
t4bs/
├── src/
│   ├── bn/                    # BaseNative SSR: server templates + client hydrator
│   │   ├── server/render.js   # renderPage() — composes layout+header+view templates
│   │   ├── server/manifest.js # reads dist/asset-manifest.json for hashed JS/CSS
│   │   ├── client/hydrate.js  # hydrates the SSR shell (default entry point)
│   │   ├── views/             # lobby/play/submit/moderate/admin HTML templates
│   │   └── route-table.js     # path -> route name, shared with the client router
│   ├── views/                  # client-side signal-driven view renderers (post-hydration)
│   ├── components/             # toast, help-modal, auth-modal
│   ├── lib/
│   │   ├── api.js              # client API wrapper
│   │   ├── auth.js             # @basenative/auth-webauthn client glue
│   │   ├── game.js             # lobby grouping + client-side game helpers
│   │   └── bind.js, dom.js, confetti.js, focus-trap.js
│   └── main.js                 # `?legacy=1` entry — same boot as hydrate.js minus the SSR seed
├── shared/
│   └── engine.js               # game core (lives, score, anchors, cascade tokens, ALL IN)
├── functions/
│   ├── _middleware.js          # SSR dispatch (default) vs. `?legacy=1`, security headers
│   ├── _shared/
│   │   ├── d1.js               # D1 store factories
│   │   ├── og.js               # hand-built SVG + @resvg/resvg-wasm renderer (see file header: satori/@basenative/og-image rejected, incompatible with Workers)
│   │   ├── ssr.js              # wires route-table + render.js into a Response
│   │   ├── util.js             # auth, role helpers, JSON/cookie helpers
│   │   └── webauthn.js         # wraps @basenative/auth-webauthn
│   ├── api/
│   │   ├── auth/               # WebAuthn endpoints
│   │   ├── moderate/           # decide/pending/promote/users
│   │   └── share-cards.js      # mint endpoint
│   ├── og/                     # /og/[name].png + /og/score/[id].png
│   └── s/[id].js                # crawler-facing share landing
├── migrations/                 # D1 migrations (use wrangler d1 migrations apply)
├── public/                     # static assets (favicon.svg, og default fallback if any)
├── docs/PRD.md                 # canonical spec
└── wrangler.toml                # CF bindings
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

End-of-round → client builds emoji grid → POST `/api/share-cards` mints a short id → user shares `t4bs.com/s/{id}` → crawlers hit `/s/{id}` HTML → image at `/og/score/{id}.png` rendered as hand-built SVG rasterized via `@resvg/resvg-wasm` (not satori/`@basenative/og-image` — see `functions/_shared/og.js`'s file header for why), KV-cached.

**Cache versioning:** the `og:default:vN` KV key embeds a version. Bump N (in `functions/og/[name].js`) when changing the default card design or copy so old cached PNGs invalidate.

**WASM gotcha:** CF Workers disallow dynamic WASM instantiate. The renderer uses a static import (`import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm"`). DO NOT switch to fetch-and-init.

## Milestone status

See `docs/PRD.md` §8 for evidence + the [GitHub issues](https://github.com/DuganLabs/t4bs/issues) tied to each (milestones stay open on GitHub pending the owner closing them, but the work is done).

- **M1 — Adopt BaseNative packages: DONE**, except `og-image` (deliberately rejected). `keyboard`, `persist`, `share`, `admin`, `auth-webauthn`, `combobox` are all live in `package.json`/import sites; `eslint-config` and `tsconfig` are the devDependency base. `@basenative/og-image` (satori) was evaluated and rejected — see `functions/_shared/og.js`'s file header: satori's `harfbuzzjs` dependency crashes under the Workers runtime (`self.location.href` on a global that doesn't exist) and can't be fixed from this repo.
- **M2 — Reusable workflows: mostly done.** `deploy.yml` and `lighthouse.yml` call `DuganLabs/.github` reusables (`cf-deploy.yml@v2`, `d1-migrate.yml@v2`, `lighthouse.yml@v2`) — the repo is public, so the private-repo access rule this milestone used to cite no longer applies. `ci.yml` and `bundle-size.yml` are still inlined (not blocked on access — on a different, still-live issue: the reusables don't authenticate to GitHub Packages, so `npm ci` 401s on any Dependabot/lockfile-changing PR). `DuganLabs/.github` tag `v2` reportedly has the auth fix (per the org survey); reverting these two to the reusable is the remaining work.
- **M3 — SSR rewrite: DONE.** BaseNative SSR (`src/bn/`) is the default render path for every route; `?legacy=1` is the fallback, not the primary experience, and it's BaseNative/signals-based too (`src/main.js`), not the old React SPA (`App.jsx` no longer exists).
- **M4 — Polish + launch: open.** `lighthouse.yml` gates PRs against 80/95/80/95 (perf/a11y/best-practices/seo), not the 100/100/100/100 target — see that file's comments for why (third-party Cloudflare bot-mitigation script caps best-practices/perf). No automated axe-core check exists in CI; several manual axe-driven a11y fixes are documented inline (e.g. `src/bn/views/header.js`, `src/components/header.js`).

## Things NOT to do

- Don't introduce new direct dependencies if a `@basenative/*` package covers it.
- Don't reach for client-side JS for copy that has to render server-side (OG meta on `/s/{id}` etc.).
- Don't change `shared/engine.js` casually — it's the one large piece that stays bespoke through any rewrite.
- Don't rename "Tabs" or revert any "five-letter battle of bullshit" remnant.

---

_Last verified against the code: 2026-09-11 (commit `d1361ec`)._
