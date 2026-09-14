#!/usr/bin/env bash
# The t4bs pipeline, on this machine.
#
#   scripts/pipeline.sh check     # lint, typecheck, tests, build — what ci.yml ran
#   scripts/pipeline.sh deploy    # build, Pages deploy, D1 migrations, seed — what deploy.yml ran
#   scripts/pipeline.sh all       # both
#
# GitHub Actions in this org are manual-only (workflow_dispatch) so no minutes
# are spent without the owner clicking; this script is the same pipeline, run
# from the same Doppler config (`doppler.yaml` pins t4bs/repository), so a
# deploy from a laptop and a deploy from the Actions tab are the same thing.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

WHAT="${1:-check}"

need_doppler() {
  command -v doppler >/dev/null 2>&1 || export PATH="$HOME/.local/bin:$PATH"
  command -v doppler >/dev/null 2>&1 || { echo "doppler CLI not found — curl -Ls https://cli.doppler.com/install.sh | sh -s -- --no-package-manager --install-path ~/.local/bin" >&2; exit 1; }
  doppler secrets --only-names >/dev/null 2>&1 || { echo "doppler cannot read t4bs/repository from here (doppler.yaml)." >&2; exit 1; }
}

check() {
  echo "── lint";      npm run lint
  echo "── typecheck"; npm run typecheck
  echo "── test";      npm test
  echo "── build";     npm run build
}

deploy() {
  need_doppler
  if [ -n "$(git status --porcelain)" ]; then
    echo "Working tree is not clean. Commit or discard first — a deploy must be a commit." >&2
    git status --short >&2; exit 1
  fi
  echo "── build";              npm run build
  echo "── pages deploy";       doppler run -- npx wrangler pages deploy dist --project-name=t4bs --branch=main --commit-dirty=true
  echo "── d1 migrations";      doppler run -- npx wrangler d1 migrations apply tabs-db --remote
  echo "── seed (idempotent)";  doppler run -- npx wrangler d1 execute tabs-db --remote --file=./seed.sql
  echo "── verify";             curl -fsS -o /dev/null -w "t4bs.com %{http_code}\n" https://t4bs.com/
}

case "$WHAT" in
  check)  check ;;
  deploy) deploy ;;
  all)    check; deploy ;;
  *) echo "usage: $0 check|deploy|all" >&2; exit 2 ;;
esac
