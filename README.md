# Kontakte-Akte

**Dein persönliches Netzwerk.**

Kontakte-Akte ist ein lokaler, verschlüsselter Personal Relationship Manager (PRM) für macOS.
Er hilft dir, dein privates und berufliches Netzwerk strukturiert zu pflegen: Menschen,
Beziehungen, Wissen, Länder, Gespräche und Follow-ups – ohne Cloud, ohne Konto, ohne KI.

- **Lokal & offline:** Alle Daten bleiben auf deinem Mac. Keine Telemetrie, keine externen Dienste.
- **Verschlüsselt:** Die gesamte Datenbank ist mit SQLCipher (AES-256) verschlüsselt und durch dein Master-Passwort geschützt.
- **Keine KI:** Suche, Filter, Dashboard und Weltkarte arbeiten ausschließlich mit klassischen, nachvollziehbaren Datenbankabfragen.

> Weiterführende Dokumente:
> [Installation](docs/INSTALLATION.md) · [Datensicherung](docs/BACKUP.md) ·
> [Architektur (EN)](docs/ARCHITECTURE.md) · [Sicherheit (EN)](docs/SECURITY.md)

---

## Funktionen

| Bereich | Was du tun kannst |
|---|---|
| **Kontakte** | Kontakte manuell anlegen, bearbeiten, löschen; Profilbild; mehrere Nationalitäten; E-Mails/Telefonnummern mit Bezeichnungen; WhatsApp, LinkedIn, Website |
| **Beruf & Expertise** | Beruf, Position, aktuelles und frühere Unternehmen, Branchen, Spezialisierungen, Expertise, Verantwortungsbereiche, Sprachen |
| **Länder** | Getrennt nach Nationalität, Wohnsitz, Tätigkeitsländern, Expertise-Ländern und Interessensländern (ISO-3166, deutsche Namen) |
| **Beziehung** | Woher ihr euch kennt, wo/wann kennengelernt, wer euch vorgestellt hat, Kategorie (erweiterbar), Stärke, nächstes Treffen |
| **Themen** | Besprochene Themen, Interessen, gemeinsame Interessen, Kooperationsthemen, Projektideen, Tags |
| **Verknüpfte Kontakte** | „Rahul hat mich Maria vorgestellt“, „Maria arbeitet mit Thomas“ – mit Beschreibung |
| **Interaktionen** | Treffen, Telefonate, E-Mails, Videocalls … mit mehreren Beteiligten, Themen und optionalem Follow-up; chronologischer Verlauf im Profil |
| **Erinnerungen** | Überfällig · Heute · Nächste 7 Tage · Später · Erledigt; erledigen, verschieben, bearbeiten; macOS-Mitteilungen |
| **Suche** | Volltextsuche über Namen, Unternehmen, Berufe, Expertise, Länder, Themen, Notizen und Interaktionen; kombinierbare Filter mit klarer UND/ODER-Logik |
| **Dashboard** | Kennzahlen, anstehende Follow-ups, zuletzt kontaktiert/hinzugefügt, Kontakte ohne Interaktion seit N Tagen |
| **Weltkarte** | Interaktive Offline-Karte (Heatmap) nach Wohnsitz, Nationalität, Tätigkeits-, Expertise- oder Interessensland |
| **Sicherheit** | Master-Passwort, automatische Sperre, verschlüsselte Sicherungen & Wiederherstellung |

Bewusst **nicht** enthalten: Sales-Pipelines, Deals, Umsatzprognosen, Lead-Scoring, Marketing,
Kalender-/E-Mail-Synchronisation, Mehrbenutzerbetrieb, Cloud-Sync und KI-Funktionen.

---

## Systemvoraussetzungen

- macOS 12 (Monterey) oder neuer
- Apple-Silicon-Mac (der mitgelieferte Build ist `arm64`; ein Universal-Build für Intel ist möglich, siehe Installation)
- **Docker Desktop für Mac** (installiert; Kontakte-Akte startet es bei Bedarf automatisch)
- ca. 500 MB freier Speicher (Backend-Image) zzgl. deiner Daten

## Schnellstart

### Variante A: Fertige App (ohne selbst zu bauen)

Im Repository liegt eine fertig gebaute App für Apple-Silicon-Macs:
[`release/Kontakte-Akte-1.0.0-macos-arm64.zip`](release/Kontakte-Akte-1.0.0-macos-arm64.zip)

1. Docker Desktop installieren und einmal starten (Lizenz bestätigen).
2. Zip entpacken und `Kontakte-Akte.app` in den Ordner **Programme** ziehen.
3. Die App ist nicht mit einer Apple-Developer-ID signiert. Wurde das Zip im Browser
   heruntergeladen, meldet macOS beim ersten Öffnen, die App könne nicht geöffnet werden.
   Dann einmalig im Terminal ausführen:
   ```bash
   xattr -dr com.apple.quarantine /Applications/Kontakte-Akte.app
   ```
   (oder: Systemeinstellungen → Datenschutz & Sicherheit → „Dennoch öffnen“).
   Bei `git clone` ist das nicht nötig.
4. **Kontakte-Akte** aus dem Programme-Ordner starten. Beim ersten Start wird das Backend
   einmalig eingerichtet (Internet nötig, einige Minuten).
5. Ein **Master-Passwort** festlegen.

Wichtig: Immer nur **eine** Kopie der App starten (die im Programme-Ordner).

### Variante B: Selbst bauen

1. Docker Desktop installieren und einmal starten (Lizenz bestätigen).
2. App bauen und installieren (einmalig, siehe [Installation](docs/INSTALLATION.md)):
   ```bash
   scripts/build-macos.sh
   scripts/install-app.sh
   ```
3. **Kontakte-Akte** per Doppelklick (Programme-Ordner, Launchpad oder Dock) starten.
4. Beim ersten Start ein **Master-Passwort** festlegen. Lange Passphrasen mit Leerzeichen, Sonderzeichen und Umlauten sind ausdrücklich erlaubt.

> **Wichtig:** Ohne dein Master-Passwort lassen sich deine Daten nicht wiederherstellen.
> Es gibt keinen Wiederherstellungsschlüssel und keine Hintertür.

---

## Bedienung

### Kontakte anlegen

**Kontakte → „+ Kontakt hinzufügen“** (oder ⌘N). Nur ein Name ist Pflicht. Das Formular ist in
sieben Abschnitte gegliedert (Persönliche Daten, Beruf & Unternehmen, Länder, Beziehung,
Expertise & Themen, Kontaktdaten, Notizen); selten genutzte Abschnitte sind eingeklappt.
**⌘S** speichert.

Für Berufe, Spezialisierungen, Branchen, Themen, Tags usw. schlägt das Eingabefeld beim Tippen
bereits vorhandene Werte vor. **Enter** übernimmt genau den getippten Begriff (bzw. die vorhandene
Schreibweise bei identischem Begriff); mit **↓** wählst du einen Vorschlag. Neue Werte entstehen
direkt im Formular.

### Klassifikationen verwalten

Werte werden automatisch normalisiert: „Steuerrecht“, „steuerrecht“ und „Steuerrecht␣“ sind
derselbe Eintrag. Unterschiedliche Begriffe werden nie automatisch zusammengelegt. Unter
**Einstellungen → Klassifikationen verwalten** kannst du:

- Einträge umbenennen oder löschen (Kontakte bleiben erhalten),
- Einträge bewusst **zusammenführen** (der alte Begriff bleibt als Synonym suchbar),
- **Synonyme** hinterlegen (z. B. „Tax Law“ → „Steuerrecht“) – Eingaben und Suche lösen diese auf,
- **Beziehungskategorien** anlegen, umbenennen und löschen.

### Suchen und filtern

Die Suchleiste auf **Kontakte** (⌘F) durchsucht Namen, Unternehmen, Berufe, Spezialisierungen,
Branchen, Länder (deutsch & englisch), Tags, Themen, Notizen, Kooperationsthemen und
Interaktionsbeschreibungen. Groß-/Kleinschreibung und Akzente spielen keine Rolle
(„muller“, „Müller“ und „Mueller“ finden dasselbe); Wortteile genügen.

Über **„Filter hinzufügen“** kombinierst du strukturierte Filter:

- **Verschiedene Filter** werden mit **UND** verknüpft (alle müssen zutreffen).
- **Mehrere Werte in einem Filter** werden standardmäßig mit **ODER** verknüpft
  („Expertise-Land: Indien oder Singapur“); pro Filter umschaltbar auf **UND – alle**.
- Text-Filter (Beruf, Spezialisierung, …) finden den Begriff auch als Teil:
  „Steuerrecht“ findet „Indisches Steuerrecht“.

Beispiel: *Expertise-Land = Indien* **UND** *Beruf = Rechtsanwalt* **UND** *Spezialisierung = Steuerrecht*.
Sortierung nach Name, zuletzt hinzugefügt, zuletzt bearbeitet oder zuletzt kontaktiert;
„Zurücksetzen“ entfernt alle Filter.

### Interaktionen dokumentieren

Im Kontaktprofil **„Interaktion“**: Art, Datum (optional Uhrzeit), Titel, Beschreibung, Ort,
besprochene Themen und beteiligte Kontakte. Eine Interaktion mit mehreren Personen erscheint
in allen beteiligten Profilen. Optional wird direkt eine Follow-up-Erinnerung angelegt.

### Erinnerungen

Im Profil **„Erinnerung“** oder unter **Erinnerungen → „Erinnerung anlegen“**. Erinnerungen ohne
Uhrzeit gelten für den ganzen Tag (Mitteilung um 9:00 Uhr); mit Uhrzeit gilt die eingegebene
Ortszeit – auch über Sommer-/Winterzeitwechsel hinweg. Über das „…“-Menü: verschieben
(1 Tag, 1 Woche, 1 Monat, 3 Monate, Datum), bearbeiten, Kontakt öffnen, löschen.

**Mitteilungen:** Kontakte-Akte erzeugt macOS-Mitteilungen lokal, **solange die App läuft** –
auch bei geschlossenem Fenster (die App bleibt dann im Dock). Nach ⌘Q gibt es keine
Mitteilungen; beim nächsten Start werden überfällige Erinnerungen angezeigt und einmalig
gemeldet. Im gesperrten Zustand enthalten Mitteilungen keine Namen oder Titel.

### Weltkarte

**Weltkarte → „Kontakte anzeigen nach:“** Wohnsitz (Standard), Nationalität, Tätigkeitsland,
Expertise-Land oder Interessensland. Je dunkler das Orange, desto mehr Kontakte; die Legende
zeigt die Klassen (logarithmisch abgestuft, damit auch kleine Werte unterscheidbar bleiben).
Jeder Kontakt zählt pro Land und Dimension genau einmal. Hover zeigt Land und Anzahl; ein
Klick (auf die Karte oder in der Länderliste) zeigt Kontakte, Berufe, Unternehmen und Expertise.
Scrollen zoomt, Ziehen verschiebt. Kleine Länder (z. B. Singapur) werden als Punkt markiert.

### Sperren

Das Schloss-Symbol unten links sperrt sofort. Unter **Einstellungen → Automatisch sperren**
legst du die Inaktivitätszeit fest (Standard 15 Minuten).

---

## Wo liegen meine Daten?

```
~/Library/Application Support/Kontakte-Akte/
├── data/kontakte-akte.db   verschlüsselte Datenbank (inkl. Suchindex und Profilbildern)
├── backups/                verschlüsselte Sicherungen (*.kabackup)
├── config/bridge.token     zufälliges Zugriffstoken zwischen App und Backend (0600, kein Passwort)
├── logs/desktop.log        Betriebsprotokoll ohne persönliche Daten
└── runtime/                Docker-Compose-Datei und Backend-Quellen (von der App verwaltet)
```

Die Datenbank liegt **außerhalb** des Docker-Containers. Sie übersteht App-Neustarts,
Container-Neuerstellung, Docker- und macOS-Neustarts sowie App-Updates.

## Bekannte Einschränkungen

- Docker Desktop ist Voraussetzung; ohne laufendes Docker startet das Backend nicht.
- Mitteilungen gibt es nur, solange die App läuft (kein Hintergrunddienst nach ⌘Q).
- Die App ist nicht mit einer Apple-Developer-ID signiert/notarisiert; sie ist für den lokalen Eigenbau gedacht.
- Der mitgelieferte Build ist nur für Apple Silicon (`arm64`).
- Weitere Punkte und der genaue Verifikationsstand: siehe [Architektur](docs/ARCHITECTURE.md#verification-status).

## Entwicklung

```bash
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements-dev.txt
(cd desktop && npm ci)
scripts/test-all.sh     # pytest, vitest, tsc, cargo test, Playwright (WebKit + Chromium)
```

Projektstruktur:

```
backend/         FastAPI + SQLAlchemy + Alembic + SQLCipher (läuft im Docker-Container)
desktop/         Tauri 2 (Rust) + React/TypeScript/Vite/Tailwind/shadcn-ui
infrastructure/  docker-compose.yml
assets/          Icon-Quelle (SVG), Kartendaten-Hinweise
docs/            Dokumentation
scripts/         Build-, Installations- und Testskripte
```
