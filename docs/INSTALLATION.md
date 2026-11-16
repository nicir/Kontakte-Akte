# Installation

## 1. Voraussetzungen

| Komponente | Version | Hinweis |
|---|---|---|
| macOS | 12 oder neuer | getestet auf macOS 26.5 (Apple Silicon) |
| Docker Desktop für Mac | aktuelle Version | einmal starten und Lizenzbedingungen bestätigen |
| Node.js | 20 oder neuer | nur zum Bauen |
| Rust (rustup) | stable | nur zum Bauen |
| Xcode Command Line Tools | – | `xcode-select --install` |
| Python 3.12+ | – | nur für Backend-Tests/Entwicklung |

Node.js und Rust lassen sich ohne Administratorrechte im Benutzerordner installieren:

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
# Node.js: Tarball von https://nodejs.org nach ~/.local/node entpacken
```

Die Skripte suchen automatisch in `~/.local/node/bin` und `~/.cargo/bin`.

## 2. App bauen

```bash
cd kontakte-akte
scripts/build-macos.sh
```

Ergebnis: `desktop/src-tauri/target/release/bundle/macos/Kontakte-Akte.app`

Optional mit **vorinstalliertem Backend-Image** (für eine Erstinstallation ganz ohne Internet;
Docker Desktop muss beim Bauen laufen):

```bash
scripts/build-macos.sh --with-image
```

Universal-Build für Intel- und Apple-Silicon-Macs:

```bash
rustup target add x86_64-apple-darwin
cd desktop && npx tauri build --target universal-apple-darwin
```

## 3. Installieren

```bash
scripts/install-app.sh
```

Das Skript kopiert die App nach `/Applications` (bzw. `~/Applications`) und bereitet – wenn
Docker Desktop läuft – das Backend-Image einmalig vor. Danach erscheint Kontakte-Akte im Finder,
in Launchpad und kann im Dock abgelegt werden.

## 4. Erster Start

1. Kontakte-Akte per Doppelklick öffnen.
2. Die App prüft Docker, startet Docker Desktop bei Bedarf und startet den Backend-Container.
   Fehlt das Backend-Image noch, wird es **einmalig** erstellt („Backend wird einmalig eingerichtet …“,
   Internet nötig, einige Minuten) oder aus dem App-Paket geladen. Bei späteren Starts wird nichts
   mehr heruntergeladen oder neu gebaut.
3. **Master-Passwort festlegen** und bestätigen. Die verschlüsselte Datenbank wird angelegt.
4. Fertig – das Dashboard erscheint.

Bei jedem weiteren Start: Doppelklick → (Docker/Backend werden automatisch gestartet) → Passwort → Dashboard.

## 5. Docker-Lebenszyklus

| Ereignis | Verhalten |
|---|---|
| App-Start | Docker prüfen/starten, `docker compose up -d` (nur Projekt `kontakte-akte`), Health-Check |
| Fenster schließen (rote Taste) | App läuft im Dock weiter (für Mitteilungen); Backend läuft weiter, automatische Sperre bleibt aktiv |
| Beenden (⌘Q) | Datenbank wird gesperrt, `docker compose stop` – Container wird gestoppt, **nicht** gelöscht |
| Docker-Neustart bei laufender App | App zeigt „Die lokale Datenbank ist nicht erreichbar“ → „Erneut versuchen“; danach entsperren |
| Mac-Neustart | Container startet nicht von selbst neu (er wurde beim Beenden gestoppt); die App startet ihn beim nächsten Öffnen |

Es werden niemals andere Container gestoppt und niemals Volumes gelöscht. Der Container ist nur
über `127.0.0.1:47811` erreichbar.

## 6. Updates

1. Neue Version bauen (`scripts/build-macos.sh`) und installieren (`scripts/install-app.sh`).
2. Beim nächsten Start installiert die App die neuen Backend-Dateien, erstellt bei Bedarf das neue
   Image und ersetzt den Container. Die Datenbank bleibt unverändert an ihrem Ort.
3. Steht eine Schema-Änderung an, wird **vor** der Migration automatisch eine geprüfte, verschlüsselte
   Sicherung `backups/pre-migration-….kabackup` erstellt. Schlägt eine Migration fehl, bleibt die
   Datenbank unverändert; sie wird nie automatisch zurückgesetzt.

## 7. Fehlerbehebung

| Meldung | Ursache / Lösung |
|---|---|
| „Docker Desktop wurde nicht gefunden.“ | Docker Desktop installieren (`/Applications/Docker.app`). |
| „Docker konnte nicht gestartet werden.“ | Docker Desktop manuell öffnen, Lizenz/Updates bestätigen, dann „Erneut versuchen“. |
| „Backend konnte nicht eingerichtet werden.“ | Beim ersten Start ist Internet nötig (Image-Build). Alternativ `scripts/build-backend-image.sh` ausführen oder mit `--with-image` bauen. |
| „Der lokale Port 47811 ist bereits belegt.“ | Ein anderes Programm nutzt den Port: `lsof -i :47811`. |
| „Die lokale Datenbank ist nicht erreichbar.“ | Docker wurde beendet oder der Container ist abgestürzt → „Erneut versuchen“. Container-Log: `docker logs kontakte-akte-backend` (enthält keine persönlichen Daten). |
| „Das Passwort ist nicht korrekt.“ | Groß-/Kleinschreibung und Leerzeichen prüfen. Ohne Passwort keine Wiederherstellung möglich. |
| App startet, aber keine Mitteilungen | Systemeinstellungen → Mitteilungen → Kontakte-Akte erlauben; Einstellungen → Mitteilungen aktiv? |
| „App kann nicht geöffnet werden“ (Gatekeeper) | Bei selbst gebauter App selten; sonst Rechtsklick → Öffnen. |

Protokolle: `~/Library/Application Support/Kontakte-Akte/logs/desktop.log` (nur technische Ereignisse).

Manuelle Container-Steuerung (normalerweise nicht nötig):

```bash
cd ~/Library/Application\ Support/Kontakte-Akte/runtime
export KA_DATA_DIR="$HOME/Library/Application Support/Kontakte-Akte" KA_VERSION=1.0.0 KA_UID=$(id -u) KA_GID=$(id -g)
docker compose -p kontakte-akte ps
docker compose -p kontakte-akte stop
```

## 8. Deinstallation

1. Kontakte-Akte beenden (⌘Q).
2. `Kontakte-Akte.app` aus dem Programme-Ordner löschen.
3. Optional Container und Image entfernen: `docker rm kontakte-akte-backend; docker rmi kontakte-akte-backend:1.0.0`
4. **Deine Daten** liegen weiterhin in `~/Library/Application Support/Kontakte-Akte/`. Lösche diesen
   Ordner nur, wenn du sie wirklich nicht mehr brauchst (vorher Sicherung anlegen).
