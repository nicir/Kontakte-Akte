#!/usr/bin/env bash
# Installs the built Kontakte-Akte.app into /Applications (or ~/Applications if
# /Applications is not writable) and, if Docker Desktop is running, prepares the
# backend image once so that the first start is fast and needs no internet.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/desktop/src-tauri/target/release/bundle/macos/Kontakte-Akte.app"
[[ -d "$APP" ]] || { echo "App nicht gefunden – zuerst scripts/build-macos.sh ausführen." >&2; exit 1; }

TARGET_DIR="/Applications"
[[ -w "$TARGET_DIR" ]] || { TARGET_DIR="$HOME/Applications"; mkdir -p "$TARGET_DIR"; }
if pgrep -xq kontakte-akte; then
  echo "Bitte Kontakte-Akte zuerst beenden (⌘Q)." >&2; exit 1
fi
rm -rf "$TARGET_DIR/Kontakte-Akte.app"
ditto "$APP" "$TARGET_DIR/Kontakte-Akte.app"
echo "Installiert: $TARGET_DIR/Kontakte-Akte.app"

DOCKER="$(command -v docker || true)"
[[ -z "$DOCKER" && -x /Applications/Docker.app/Contents/Resources/bin/docker ]] && DOCKER=/Applications/Docker.app/Contents/Resources/bin/docker
if [[ -n "$DOCKER" ]] && "$DOCKER" info >/dev/null 2>&1; then
  echo "Backend-Image wird einmalig vorbereitet …"
  "$ROOT/scripts/build-backend-image.sh"
else
  echo "Hinweis: Docker Desktop läuft nicht. Das Backend wird beim ersten Start automatisch eingerichtet (Internet nötig)."
fi
echo "Kontakte-Akte kann jetzt über Launchpad oder den Programme-Ordner gestartet werden."
