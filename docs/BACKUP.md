# Datensicherung und Wiederherstellung

## Was ist eine Sicherung?

Eine Sicherung (`*.kabackup`) ist eine **vollständige, mit SQLCipher verschlüsselte Kopie** deiner
Datenbank – inklusive Suchindex, Interaktionen, Erinnerungen, Einstellungen und **Profilbildern**
(diese liegen ebenfalls verschlüsselt in der Datenbank). Sie wird mit `sqlcipher_export` innerhalb
einer Lesetransaktion erzeugt (konsistenter Schnappschuss, auch während die App läuft), danach
geprüft (HMAC- und Integritätsprüfung) und erst dann unter ihrem endgültigen Namen gespeichert.

Eine Sicherung lässt sich nur mit dem Master-Passwort öffnen, das **zum Zeitpunkt der Sicherung**
galt. Ohne dieses Passwort ist sie wertlos – auch für dich.

## Sicherung erstellen

**Einstellungen → Datensicherung → „Sicherung erstellen …“**

1. Die Sicherung wird in `~/Library/Application Support/Kontakte-Akte/backups/` angelegt.
2. Anschließend öffnet sich ein macOS-Dialog, in dem du einen **zusätzlichen Speicherort** wählst
   (z. B. externe Festplatte). „Abbrechen“ behält nur die interne Kopie.

Jede vorhandene Sicherung kann über „…“ → „Speichern unter …“ erneut exportiert werden.

Empfehlung: Bewahre regelmäßig eine Sicherung auf einem externen Datenträger auf. Time Machine
sichert den Ordner `Application Support` ebenfalls – die Dateien bleiben dort verschlüsselt.

## Sicherung prüfen

„…“ → **„Integrität prüfen“** öffnet die Sicherung mit dem aktuellen Passwort, prüft
Verschlüsselungs-HMAC und Datenbankstruktur und zeigt die Anzahl der Kontakte, Interaktionen und
Erinnerungen. Für Sicherungen mit einem älteren Passwort nutze „Wiederherstellen …“ → Passwort
eingeben → „Sicherung prüfen“ (es wird dabei noch nichts ersetzt).

## Wiederherstellen

**„Sicherung wiederherstellen …“** (Datei auswählen) oder bei einer vorhandenen Sicherung „…“ → „Wiederherstellen …“.

1. Passwort der Sicherung eingeben (leer lassen, wenn es dein aktuelles ist).
2. **„Sicherung prüfen“** – Verschlüsselung, Integrität und Versionskompatibilität werden geprüft.
3. Ausdrücklich bestätigen und **„Wiederherstellen“**.

Was dabei passiert:

1. Der **aktuelle Stand** wird zuerst als `pre-restore-….kabackup` gesichert und geprüft.
2. Die Sicherung wird in eine Arbeitskopie übernommen und – falls sie ein anderes Passwort hat – auf
   dein **aktuelles Master-Passwort umgeschlüsselt** und erneut geprüft.
3. Alle Datenbankverbindungen werden geschlossen, die Datei wird atomar ersetzt und neu geöffnet
   (inklusive eventuell nötiger Migrationen).
4. Schlägt etwas fehl, wird automatisch der vorherige Stand zurückgespielt.

Nichts wird stillschweigend überschrieben. Sicherungen aus einer **neueren** App-Version werden abgelehnt.

## Master-Passwort ändern

**Einstellungen → Sicherheit → Master-Passwort „Ändern …“** verschlüsselt die Datenbank neu
(`PRAGMA rekey`). Bereits erstellte Sicherungen behalten ihr altes Passwort.

## Passwort vergessen?

Es gibt **keinen** Wiederherstellungsschlüssel, keine Hintertür und keinen Support, der Daten
entschlüsseln könnte. Ohne Passwort sind Datenbank und Sicherungen nicht lesbar. Notiere dein
Passwort an einem sicheren Ort (z. B. Passwort-Manager).

## Automatische Sicherungen

- `pre-migration-<revision>-<zeit>.kabackup`: vor jeder Schema-Migration nach einem App-Update.
- `pre-restore-<zeit>.kabackup`: vor jeder Wiederherstellung.

Nicht mehr benötigte Sicherungen kannst du über „…“ → „Löschen“ entfernen.

## Manuell (für Fortgeschrittene)

Mit dem `sqlcipher`-Kommandozeilenwerkzeug lässt sich eine Sicherung prüfen:

```
sqlcipher kontakte-akte-20261112-213849.kabackup
sqlite> PRAGMA key = 'dein Passwort';
sqlite> PRAGMA cipher_integrity_check;
sqlite> SELECT count(*) FROM contacts;
```
