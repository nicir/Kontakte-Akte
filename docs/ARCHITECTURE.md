# Architecture

Kontakte-Akte is a local-first Personal Relationship Manager for macOS.
This document describes the system for developers.

```
Kontakte-Akte.app (Tauri 2, Rust)
 ├─ WKWebView: React 19 + TypeScript (bundled, no remote UI, strict CSP)
 │     │  invoke("api_request", …)            ← the only way to reach the backend
 │     ▼
 ├─ Rust bridge: adds bridge token + session token, forwards /api/* to 127.0.0.1
 ├─ Docker orchestration (fixed commands, compose project "kontakte-akte")
 ├─ Notification scheduler (native macOS notifications)
 └─ Native dialogs for backup export/import
          │ HTTP, loopback only (127.0.0.1:47811 → container :8000)
          ▼
Docker container "kontakte-akte-backend" (python:3.13-slim, read-only rootfs, cap_drop ALL)
 └─ FastAPI + SQLAlchemy 2 + Alembic + Pydantic 2
          │ SQLCipher 4 (sqlcipher3 driver)
          ▼
~/Library/Application Support/Kontakte-Akte/  (bind mounts; data never only in the container)
 ├─ data/kontakte-akte.db   encrypted SQLCipher DB (FTS index + photos inside)
 ├─ backups/                encrypted *.kabackup snapshots (+ import/ staging)
 ├─ config/bridge.token     random per-launch token, mode 0600, mounted read-only
 ├─ logs/desktop.log        operational log, no personal data
 └─ runtime/                compose file + backend sources copied from the app bundle
```

## Repository layout

| Path | Content |
|---|---|
| `backend/app/config.py` | Paths from `KA_DATA_ROOT` (no secrets via env) |
| `backend/app/database/` | `sqlcipher.py` (keying, snapshots, integrity), `manager.py` (setup/unlock/lock/rekey/sessions, pre-migration backup), `migrate.py` (programmatic Alembic) |
| `backend/app/models/` | SQLAlchemy models |
| `backend/app/schemas/` | Pydantic request/response models (the API contract) |
| `backend/app/services/` | Domain logic: contacts, classifications, search + FTS index, interactions, reminders, dashboard, geo, backup, settings |
| `backend/app/security/` | Local-only middleware (Host/Origin/bridge token), session store |
| `backend/app/api/` | Thin FastAPI routers |
| `backend/migrations/` | Alembic (`0001` = initial schema, FTS5 table, country + category seeds) |
| `desktop/src-tauri/src/` | `lib.rs` (commands, lifecycle), `docker.rs`, `bridge.rs`, `notifications.rs`, `paths.rs` |
| `desktop/src/` | React app: `lib/` (API client, types, formatting), `components/` (shadcn/ui + inputs), `features/` (pages) |
| `desktop/e2e/` | Playwright acceptance tests + **test-only** bridge shim |
| `infrastructure/docker-compose.yml` | Single backend service |

## Data model

Normalized relational schema (see `backend/app/models/entities.py`):

- `contacts`: one row per person (UUID). Includes relationship context columns and FKs to
  `relationship_categories` and `contacts` (introduced by), both `ON DELETE SET NULL`.
- `countries` (ISO 3166-1 alpha-2 PK, numeric code, German + English names) – seeded from
  `backend/app/data/countries.json` (generated from the ISO data in `pycountry`, common German names).
- `contact_countries (contact_id, country_code, kind)` with `kind ∈ {nationality, residence,
  activity, expertise, interest}`. The composite PK makes a contact count at most once per country
  and dimension.
- `classifications (kind, name, normalized_name)` with a unique `(kind, normalized_name)` index,
  plus `classification_aliases` and the join table `contact_classifications`. One table for all
  reusable values (profession, specialization, industry, expertise, responsibility, topic, interest,
  shared interest, collaboration, project, tag, language). This keeps autocomplete,
  de-duplication, aliases and merging in one code path. This replaces the per-kind tables suggested
  in the brief and is functionally equivalent.
- `organizations` + `contact_organizations (role ∈ {current, previous})`.
- `contact_channels` (email/phone/whatsapp/linkedin/website/other, with label).
- `contact_photos` (512 px image + 128 px thumbnail as BLOBs inside the encrypted DB).
- `contact_links (source, target, relation_type, description)`.
- `interactions` + `interaction_participants` + `interaction_topics`.
- `reminders (due_date, due_time, timezone, status, …)` → contact `CASCADE`, interaction `SET NULL`.
- `settings` (key/JSON value).
- `contact_search` – FTS5 virtual table (`trigram` tokenizer), one document per contact.

Cascades only remove rows owned by the deleted entity. Deleting a contact removes its join rows,
channels, photo, links, reminders and the interactions in which it was the *only* participant.
Shared interactions, organizations, classifications and other contacts remain (tested).

## Normalisation and search

- `fold()` = NFKC, collapse whitespace, `casefold()` (ß→ss), strip combining marks. It is used for
  unique keys (“Steuerrecht”, “steuerrecht”, “Steuerrecht ” → one value) and for search.
- The FTS document contains the folded text of names, organisations, classifications **and their
  aliases**, countries (German + English), channels, notes, relationship text, link descriptions
  and all interaction titles, descriptions, locations and topics. Where umlauts occur, a
  transliterated variant (ä→ae) is added, so "Müller", "muller" and "Mueller" all match.
- Free text: every word must match (substring). Terms with ≥ 3 characters use FTS5 `MATCH`
  (trigram index); shorter terms fall back to `LIKE` on the index table.
- Structured filters: different fields are combined with **AND**. Values within one field use
  **OR** (`match: "any"`) or **AND** (`match: "all"`). Country filters are exact ISO codes.
  Classification and organisation filters are substring matches on the normalised name or an
  alias. Topic filters also match topics of the contact's interactions.
- The index is rebuilt for the affected contacts on every write (contacts, interactions, links,
  renames, merges). Everything lives inside the encrypted database; there is no plaintext index.

## Reminders and time

`due_date` is a calendar date and `due_time` an optional wall-clock time in the reminder's IANA
`timezone`. Buckets (overdue / today / next 7 days / later / done) are computed per request using
the viewer's timezone (`?tz=`). Date-only reminders are compared as dates and are never shifted.
Timed reminders are resolved with `zoneinfo` at evaluation time, so DST transitions keep the
intended local time (tested for Europe/Berlin, 29 Mar 2026).

Notifications: after unlock, after every change and every 10 minutes, the UI pushes the plan for
the next 8 days to Rust (`set_notification_plan`). A Rust thread checks every 15 s and fires native
notifications. Date-only reminders fire at 09:00. Overdue reminders are announced once per unlock.
**Notifications only work while the app process runs** (window may be closed). No launch agent or
helper was implemented: the database is locked when the app is not running, so a helper could only
send content-free alerts and would need the bridge secret. That trade-off was judged not worth the
added attack surface.

## Desktop startup sequence (`docker.rs`)

1. Create directories (0700), rotate the bridge token (0600, atomic write).
2. Copy `Resources/resources/runtime` into `Application Support/Kontakte-Akte/runtime` if the
   bundled `VERSION` differs (so the app doesn't depend on the repository or its own location).
3. If `127.0.0.1:47811/api/health` already answers as `kontakte-akte` with the app version → ready.
4. Locate the `docker` CLI (Finder-launched apps have a minimal `PATH`). If the engine does not
   respond: `open -g -b com.docker.docker`, then poll `docker info` for ≤ 180 s.
5. Ensure the image `kontakte-akte-backend:<version>` exists: `docker load` from a bundled archive
   if present, otherwise `docker compose build` (one-time, needs internet). It is never pulled or
   rebuilt on a normal launch (`pull_policy: never`, `up --no-build`).
6. `docker compose -p kontakte-akte up -d --no-build` (idempotent: no duplicate containers;
   fixed `container_name`). "Port already allocated" is reported as such.
7. Poll health ≤ 90 s, verifying the service identity.

All commands run with bounded timeouts; progress events drive the German loading screen; every
failure ends in an actionable message with "Erneut versuchen".

Shutdown policy: closing the window hides it (app stays in the Dock); Quit (⌘Q, menu, AppleScript)
locks the database and runs `docker compose stop` (never `down -v`). The container uses
`restart: unless-stopped`: if the app crashes, the container keeps running; without the Rust process
nobody holds the bridge or session token, and the server-side idle lock (auto-lock time + 2 min)
locks the database. The next launch reuses the container.

Developer/test mode: `KA_EXTERNAL_BACKEND=1` skips Docker and uses an already running backend on
port 47811 (it must still identify itself via `/api/health`).

## Frontend

React 19 + TypeScript (strict, `noUncheckedIndexedAccess`), Vite, Tailwind CSS v4,
shadcn/ui (Radix primitives), lucide icons, TanStack Query. A small state-based router, because there are
only four top-level pages plus profile, editor and settings. The search state lives above the router, so
filters survive navigation. After any write, all queries are invalidated (local and cheap) and the
notification plan is refreshed.

The world map uses `d3-geo` (Natural Earth projection) with `world-atlas` 1:50m TopoJSON bundled
into the app (no tiles, no network). The choropleth uses a single-hue orange sequential scale with
up to five log-spaced classes (counts are typically skewed) and gray for zero. Tiny countries with
contacts get a dot marker. The ranked country list doubles as the accessible table view.

## Verification status

What was executed in the development environment (macOS 26.5, Apple Silicon, **no Docker installed**):

| Area | Evidence |
|---|---|
| Backend | 73 pytest tests (security, encryption on disk, contacts, search, interactions, reminders incl. DST, map counts, dashboard, backup/restore incl. re-key, tamper detection, migrations, schema = models) – **pass** |
| Frontend | `tsc` strict – pass; 10 vitest unit tests – pass |
| Desktop (Rust) | 14 `cargo test` unit tests – pass; release build `Kontakte-Akte.app` – **built** |
| End-to-end | 9 Playwright scenarios (setup, A–E, lock/unlock/reload, backup) against the real backend, in **WebKit** (WKWebView's engine) and **Chromium** – pass |
| Native app | Launched the built `.app` binary with an isolated `HOME` and `KA_EXTERNAL_BACKEND=1`: directories/permissions created, token rotated, runtime installed, startup reached `ready`, AppleScript *quit* ran the shutdown handler |

**Not verified (Docker Desktop was not available):** building the Docker image, `docker compose`
startup/stop, Docker Desktop auto-start, persistence across container recreation/Docker restart
inside Docker, bind-mount permissions with `user: uid:gid`, the bundled-image (`docker load`) path,
and offline startup with Docker. Not verified either: native notification delivery and the visual
rendering of the native window (no screen-recording permission in the build environment).
Persistence across backend process restarts **was** verified (new backend instance on the same
data directory), which is the same mechanism the bind mount provides.
