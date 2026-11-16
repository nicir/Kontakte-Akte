# Security

## Threat model

Single user, single Mac. Protect the contact dossier against:

1. someone reading the files on disk (stolen/lost Mac without FileVault, backups, Time Machine, cloud-synced folders),
2. other local software talking to the backend port (other processes, malicious websites via the browser, DNS rebinding),
3. accidental data loss (failed migration, bad restore).

Out of scope: an attacker who already runs code as the same macOS user while the app is unlocked
(such an attacker can read process memory). No custom cryptography is used anywhere.

## Encryption at rest

- **SQLCipher 4** (via the `sqlcipher3` driver, SQLCipher 4.12 / SQLite 3.51): AES-256 page encryption,
  HMAC-SHA512 per page, PBKDF2-HMAC-SHA512 key derivation (SQLCipher 4 defaults, 256,000 iterations),
  per-database random salt. The **whole database** is encrypted: the FTS5 search index,
  profile photos (BLOBs), settings and the rollback journal. Temporary data is kept in memory
  (`temp_store=MEMORY`); `secure_delete=ON`. The journal mode is `DELETE`, so there is no WAL/SHM file.
- The backend refuses to start if the driver is not SQLCipher (`assert_sqlcipher_available`).
  There is no fallback to plain SQLite.
- Verified by tests: the file header is not `SQLite format 3`; marker strings and even table names
  are absent from the raw bytes; Python's plain `sqlite3` fails with "file is not a database"; a
  wrong key fails; a key that is a prefix of the real one fails (no truncation).
- Backups are full SQLCipher databases (`sqlcipher_export`), verified with
  `PRAGMA cipher_integrity_check` + `PRAGMA integrity_check` before they are moved into place.
  A tampered byte is detected (tested).

## Master password

- Free-form: any length up to 4096 characters, with spaces, quotes, Unicode and emoji. No composition rules,
  no trimming, no truncation. It is NFC-normalised so that identical-looking input yields the same key.
  NUL characters are rejected because they cannot be represented in `PRAGMA key`.
- Never stored. It reaches the backend only in the body of `POST /api/auth/setup|unlock|change-password`
  (loopback HTTP through the Rust bridge). It is not in compose files, environment variables,
  command lines, configuration files or logs (log content is tested).
- Verification works by opening the database with the key. Failed attempts are answered with a generic
  message and a progressive delay, on top of the KDF cost.
- While unlocked, the passphrase stays in backend memory because SQLCipher needs it for each pooled connection.
  On lock the engine is disposed and the reference dropped. Python cannot guarantee that memory is
  wiped, and we don't claim it.
- Change password = `PRAGMA rekey` after verifying the current password. There is no recovery key
  and no backdoor.

## Backend access control

The FastAPI service listens on `0.0.0.0:8000` **inside** the container. Compose publishes it only
on `127.0.0.1:47811`. On top of that:

| Layer | Purpose |
|---|---|
| `Host` must be `127.0.0.1`/`localhost` | defeats DNS rebinding (tested) |
| any `Origin` header → 403 | browsers always send `Origin` on cross-site/CORS requests; the only legitimate client is the Rust process (tested) |
| no CORS middleware at all | no browser context can read responses |
| `X-KA-Bridge` token | 256-bit random, rotated on every app launch, file `config/bridge.token` mode 0600 in the user's Application Support, mounted **read-only** into the container; compared in constant time. Without it, even `/api/auth/setup` is unreachable, so a website cannot hijack first-run setup (tested) |
| `Authorization: Bearer <session>` | 256-bit random session issued after unlock; only SHA-256 digests stored; all sessions revoked on lock; server-side idle lock (auto-lock + 2 min grace) as a backstop for the UI timer (tested) |
| database locked → 423 | without a key there is no engine, so no query can run (tested) |

`/api/health` is the only endpoint without the bridge token; it reveals service name and version only.
OpenAPI/Swagger endpoints are disabled unless `KA_DEV=1`. Uvicorn's access log is off; application
logs contain only structural events.

## Desktop shell (Tauri)

- The webview never receives the bridge token or the session token. The Rust bridge attaches both
  and **strips `session_token` from setup/unlock responses**.
- The CSP (`connect-src ipc: http://ipc.localhost`) prevents the webview from contacting the
  backend port or any other host directly. `freezePrototype` is enabled.
- Capabilities grant only `core:app/event` defaults plus window dragging. There is no shell plugin,
  no fs plugin, no HTTP plugin, and no dialog/notification JS API exposed to the webview.
- Custom commands are narrow:
  - `api_request` only allows `GET/POST/PUT/PATCH/DELETE` on `/api/...` paths. `..`, `//`, `#`
    and non-printable characters are rejected (unit-tested).
  - `export_backup(file_name)` only accepts `[A-Za-z0-9._-]+.kabackup` from the managed backups
    folder. The **destination is chosen by the user in a native dialog** opened by Rust.
  - `import_backup()` copies a user-picked file into `backups/import/` under a generated name.
  - Docker is driven with fixed argument lists, with no shell and no user input in arguments.
    Only the `kontakte-akte` compose project is touched, and volumes are never removed.
- Files written by the app: directories 0700, token/backups 0600.

## Container hardening

`read_only: true` root filesystem, `tmpfs /tmp`, `cap_drop: [ALL]`, `no-new-privileges`, and the process runs
as the host user's uid/gid (no root). Log rotation is 3 × 1 MB. The image contains no build tools beyond
the slim Python base. Dependencies are pinned in `requirements.txt` and contain no AI/ML/cloud SDKs (tested).

## Sensitive data handling summary

| Data | Where | Protection |
|---|---|---|
| Contacts, notes, interactions, reminders | `data/kontakte-akte.db` | SQLCipher |
| Search index | inside the DB (FTS5) | SQLCipher |
| Profile pictures | inside the DB (BLOB) | SQLCipher; resized client-side, no server-side image parsing, magic-byte validation |
| Backups | `backups/*.kabackup`, user-chosen copies | SQLCipher (password at backup time) |
| Restore staging | `data/restore-staging.db` | SQLCipher, removed after use |
| Bridge token | `config/bridge.token` | 0600, per launch, not a data key |
| Session token | backend memory (digest) + Rust memory | never on disk |
| Logs | `logs/desktop.log`, `docker logs` | no personal data, no secrets (tested for backend) |
| Notifications | macOS Notification Center | titles/names only while unlocked and if enabled; generic text when locked |

## Recommendations for users

- Enable FileVault.
- Use a long passphrase and store it in a password manager.
- Keep at least one backup on an external drive.
