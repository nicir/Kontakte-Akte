#!/usr/bin/env bash
# Builds the backend image kontakte-akte-backend:<version> (needs Docker + internet once).
# --save additionally writes build/kontakte-akte-backend-image.tar.gz, which
# scripts/build-macos.sh bundles into the app for an offline first install.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$ROOT/desktop/src-tauri/tauri.conf.json")"
DOCKER="$(command -v docker || echo /Applications/Docker.app/Contents/Resources/bin/docker)"
"$DOCKER" build -t "kontakte-akte-backend:$VERSION" "$ROOT/backend"
if [[ "${1:-}" == "--save" ]]; then
  mkdir -p "$ROOT/build"
  "$DOCKER" save "kontakte-akte-backend:$VERSION" | gzip > "$ROOT/build/kontakte-akte-backend-image.tar.gz"
  echo "Image gespeichert: $ROOT/build/kontakte-akte-backend-image.tar.gz"
fi
