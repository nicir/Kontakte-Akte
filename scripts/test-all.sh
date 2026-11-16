#!/usr/bin/env bash
# Runs every automated test suite that works without Docker.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.local/node/bin:$HOME/.cargo/bin:$PATH"
echo "== Backend (pytest)";   (cd "$ROOT/backend" && "$ROOT/.venv/bin/python" -m pytest -q -p no:warnings)
echo "== Frontend (vitest)";  (cd "$ROOT/desktop" && npx vitest run)
echo "== Typecheck";          (cd "$ROOT/desktop" && npx tsc --noEmit -p .)
echo "== Desktop (cargo)";    (cd "$ROOT/desktop/src-tauri" && cargo test --quiet)
# Each browser engine gets its own fresh backend + data directory (the suite starts with first-run setup).
for engine in webkit chromium; do
  echo "== End-to-end (Playwright: $engine)"
  (cd "$ROOT/desktop" && KA_E2E_DIR="$(mktemp -d)/kontakte-akte-e2e" npx playwright test --project "$engine")
done
