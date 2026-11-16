#!/usr/bin/env bash
# Builds Kontakte-Akte.app (Tauri, release). Requires Node.js 20+ and Rust (rustup).
# Usage: scripts/build-macos.sh [--with-image]
#   --with-image  also builds the backend Docker image and bundles it into the app
#                 (offline first install). Requires a running Docker Desktop.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.local/node/bin:$HOME/.cargo/bin:$PATH"

if [[ "${1:-}" == "--with-image" ]]; then
  "$ROOT/scripts/build-backend-image.sh" --save
fi

cd "$ROOT/desktop"
npm ci
npx tauri build
APP="$ROOT/desktop/src-tauri/target/release/bundle/macos/Kontakte-Akte.app"
echo
echo "Fertig: $APP"
echo "Installation: scripts/install-app.sh"
