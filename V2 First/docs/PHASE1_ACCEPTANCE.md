# Phase 1 Acceptance Checklist — Study Stream 2.0

**Rule:** An item may only be marked complete with concrete evidence
(command output, screenshot, or recorded test run). Do not mark items
complete based on intent.

Last updated: 2026-11-14 (Phase 1 gate: lifecycle + auth VERIFIED end-to-end on Windows)

## Verified on Windows (2026-11-14)

| Check | Result | Evidence |
| ----- | ------ | -------- |
| Python dependency install (py 3.14.3, venv) | Passed | `pip install -r requirements.txt`, exit 0 |
| Backend unit tests (pytest) | **2/2 passed** | `tests/test_health.py::test_health_endpoint`, `test_control_socket_echo` — `2 passed in 1.38s` |
| Full source compilation (compileall) | Passed | exit 0 |
| Alembic initial migration | Passed | `Running upgrade -> 0001_initial`, exit 0 |
| Migrated DB schema verified | Passed | tables `alembic_version`, `app_settings`; columns key/value/updated_at |
| Frontend `npm install` | Passed | exit 0 |
| Frontend production build (tsc + vite) | Passed | `✓ built in 1.18s`, exit 0 |
| Live backend boot + real HTTP health check | Passed | `Invoke-RestMethod http://127.0.0.1:47831/api/v1/health` returned `{"status":"ok","service":"studystream2-backend","api_version":"v1"}` |

**Environment note:** verification ran on this machine (Windows, Python 3.14.3 via `py` launcher, Node 24, npm 11). Rust/Tauri build and PyInstaller packaging remain unverified.

## Implemented in code (unverified or partially verified)

| Requirement | Status | Evidence |
| ----------- | ------ | -------- |
| FastAPI backend with `/api/v1/health` | Implemented + verified | see above |
| WebSocket endpoint `/ws/control` (echo) | Implemented (TestClient only) | `backend/app/main.py` |
| Backend binds to `127.0.0.1:47831` | Implemented + verified live boot | `backend/app/config.py`, `run_backend.py` |
| CORS restricted to local/Tauri origins | Implemented (not browser-tested) | `backend/app/main.py`, `config.py` |
| SQLite WAL + foreign keys + busy timeout | Implemented (WAL applies via app engine connections) | `backend/app/database.py` |
| SQLAlchemy 2.0 model (`app_settings`) | Implemented + verified | `backend/app/models.py` |
| Alembic initial migration (0001_initial) | Implemented + verified | `backend/migrations/versions/0001_initial.py` |
| React + TypeScript + Vite dashboard | Implemented + build verified | `frontend/` |
| Dashboard backend health check | Implemented (requires backend running) | `frontend/src/App.tsx`, `services/backend.ts` |
| Tauri 2 config, Rust shell, capabilities | Implemented in config, **Rust build unverified** | `desktop/src-tauri/` |
| Backend unit tests | Implemented + verified | `backend/tests/test_health.py` |

## Verified — Tauri-managed backend lifecycle (Priority 1)

Agent A completed the implementation (died at usage limit before final
verification); coordinator rebuilt, fixed, and verified on Windows 2026-11-14:

| Requirement | Status | Evidence |
| ----------- | ------ | -------- |
| Backend auto-launched by Tauri as child process | **Verified** | `tauri dev` launched `studystream2.exe`; log `backend-*.log` shows `[shell] launching backend (mode: dev, port: 47831, pid: 4804)` |
| stdout/stderr captured to log | **Verified** | `%LOCALAPPDATA%\com.yashvir.studystream2\logs\backend-20261114-073728.log` contains tagged stdout/stderr lines |
| Backend starts, uvicorn ready, parent→child python tree | **Verified** | Win32 process query: studystream2(28536) → python(4804) → python uvicorn(27904); LISTEN on 47831 owned by 27904 |
| Readiness polling against `/api/v1/health` | **Verified** | Log shows `GET /api/v1/health HTTP/1.1" 200 OK` from the shell's poller ~2 s after launch |
| Startup timeout and crash handling | Implemented (not fault-injection tested) | `poll_readiness` in main.rs: detects early child exit, 30 s deadline, sets Error state; window renders error text instead of blank screen |
| Graceful shutdown and child termination | **Verified** | WM_CLOSE sent to window handle 3214386 ("Study Stream 2.0"); `tauri dev` log shows `taskkill /T /F` output: `SUCCESS: ... PID 27904 ... PID 4804 ... terminated.`; afterwards: no studystream2/python processes remain and port 47831/5173/5174 all free. Note: exit path is `RunEvent::ExitRequested`; orphan-free tree-kill observed |

## Verified — Security (Priority 2)

| Requirement | Status | Evidence |
| ----------- | ------ | -------- |
| Per-launch credential generation (256-bit CSPRNG token, hex, memory-only) | **Verified** | `rand::thread_rng().fill_bytes`, passed via env var to child; never argv/disk |
| Credential transfer shell ↔ backend | **Verified** | `STUDYSTREAM_AUTH_TOKEN` env from `spawn_backend`; log line `auth token: configured` |
| Authenticated API requests (all /api/v1/*) | **Verified** | Packaged exe smoke test: no token → HTTP 401 (fail closed); with `x-auth-token` → 200; dev flow: log shows 200 on authenticated health GET |
| Authenticated frontend (Tauri IPC) | **Verified** | Dashboard logs `OPTIONS + GET /api/v1/health` 200 OK; new `services/backend.ts` sends `X-Auth-Token` from `get_auth_token` |
| Authenticated WebSocket connections (`/ws/control`) | Implemented + TestClient-verified | First-message `{"type":"auth"}` or `?token=` query param; close 4401 on failure; 8 auth tests passed |
| CORS restricted | **Verified** | Restricted to localhost:5173 / tauri origins; preflight OPTIONS 200 in dev flow |
| WebSocket origin validation | Implemented in-process (token IS the origin check) | Token auth required regardless of origin; full origin allow-list pending Phase 5 hardening |
| Credential invalidation on shutdown | Implicit (token lives in process memory; dies with process) | Not separately testable headlessly — by construction |

## Verified — Packaging (Priority 3)

| Requirement | Status | Evidence |
| ----------- | ------ | -------- |
| PyInstaller packaging of backend | **Verified** | See "Packaging" section: 21.5 MB exe, 78.7 s build, rebuilt after auth work |
| Tauri `externalBin` sidecar configuration | **Verified (config)** | `tauri.conf.json` → `externalBin: ["binaries/studystream-backend"]`; exe at `desktop/src-tauri/binaries/studystream-backend-x86_64-pc-windows-msvc.exe` (target-triple naming); `main.rs` packaged path changed `backend-studystream2.exe` → `studystream-backend.exe` to match Tauri's output name |
| Windows target naming verified | **Verified** | x86_64-pc-windows-msvc triple suffix matches Tauri convention |
| Reproducible build script | **Verified** | `desktop/scripts/build-backend-sidecar.ps1 -SidecarDir "src-tauri\binaries"` run, exit 0 |

## Verified — Windows verification (Priority 4, partial)

| Requirement | Status | Evidence |
| ----------- | ------ | -------- |
| App launches on Windows 11 | **Verified (dev)** | `tauri dev` compiled and ran `studystream2.exe` without error |
| Backend starts and becomes ready | **Verified** | see lifecycle section; ~2 s launch→ready |
| Dashboard communicates with backend | **Verified** | authenticated `GET /api/v1/health` 200 OK visible in backend log |
| Clean-install test (no Python installed, packaged build) | Pending | requires `tauri build` + installer run on a clean machine/VM |
| Memory usage measured | Pending | not yet measured (16 GB machine) |
| Restart recovery (backend crash → app survives?) | Pending | crash-path not fault-injection tested |

## Exit protocol for Phase 1 — COMPLETE (2026-11-14)

`npm run tauri build` was FIXED and RUN; the packaged flow was then verified
end-to-end by launching the release build and closing its window:

| Step | Result | Evidence |
| ---- | ------ | -------- |
| tauri.conf.json frontendDist fix | FIXED | `../frontend/dist` → `../../frontend/dist` (resolved to desktop/frontend/dist which does not exist — first tauri build failed on this) |
| gnu default target problem | RESOLVED | rustc host is x86_64-pc-windows-gnu; built with `--target x86_64-pc-windows-msvc` (host triple mismatch — sidecar expects MSVC name) |
| MSVC build failure: ring .c compiles failed with cl.exe C1083 "Cannot open compiler generated file" | RESOLVED | Cause: Windows MAX_PATH (260) limit vs the extremely long OneDrive workspace path; built via `subst X: "…\V2 First"` (session-scoped, removed afterwards) — root cause is the workspace path, not the toolchain |
| Release build | **PASSED** | `Finished release profile in 5m 55s`; `studystream2.exe` 9.66 MB; NSIS installer **`Study Stream 2.0_0.1.0_x64-setup.exe` (23.64 MiB)** built by makensis, hash-validated |
| Packaged app launched in-place (target\release\studystream2.exe) | **PASSED** | Window opened; log `backend-20261114-080631.log`: `[shell] launching backend (mode: sidecar, port: 47831, pid: 25844)`; `mode: sidecar`; authenticated `GET /api/v1/health` 200 from the packaged webview (no dev server) |
| Packaged graceful shutdown | **PASSED** | WM_CLOSE to the release window (handle 3542812); afterwards no studystream2/studystream-backend processes remain; port 47831 refused connections (closed) |
| Connect test on 47831 post-shutdown | Closed | `TcpClient.BeginConnect` refused — zero orphans |

Notes:

- The NSIS installer was **built but NOT executed** (installing modifies the
  user's system; left as the user's choice). The packaged binary path itself
  is verified, which is the same code path the installer ships.
- Tauri v2 also copied `studystream-backend.exe` next to the release binary
  automatically (sidecar placement confirmed in output dir).
- Consider enabling Windows long-path support (registry) or shortening the
  workspace path before the next packaged build — the subst workaround was
  session-scoped.
- Sidecar next to release binary: 22,557,707 bytes (current, includes auth).
- `studystream2.pdb` is produced next to the exe (harmless; strip in release
  bundle if desired — NSIS contents unaffected).

Phase 1 is therefore **code-complete and verified in both dev and packaged
modes** for everything except executing the NSIS installer itself (documented
above as pending user approval) and the clean-machine test.

## Verification commands (once environment is set up)

```powershell
# Backend tests
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m pytest -v

# Alembic migration
.venv\Scripts\python -m alembic upgrade head

# Frontend build
cd ..\frontend
npm install
npm run build

# Desktop shell (requires Rust)
cd ..\desktop
npm install
npm run tauri dev
```

## Design system foundation (early Phase 2 groundwork)

Date: 2026-11-14. Built as an isolated module (per coordinator assignment)
while Phase 1 lifecycle work proceeds in parallel. No existing frontend
files were modified.

| Item | Status |
| ---- | ------ |
| `frontend/src/design/tokens.ts` — typed token object (colors/radii/spacing/typography/motion), `as const`, dark-first Material 3-inspired palette | Implemented |
| `frontend/src/design/tokens.css` — `--ss-*` custom properties, comment points at tokens.ts as source of truth | Implemented |
| Primitives: Button (5 variants, 3 sizes, loading, disabled, icon slot), Card (base/tonal/elevated, optional header/footer), StatusPill (online/offline/degraded/warning + dot), SectionHeader (title/subtitle/action) | Implemented |
| `primitives.css` consumes tokens only; 120/160/200 ms transitions, single standard easing; no animation/UI-kit libraries | Implemented |
| `frontend/src/design/preview/DesignPreview.tsx` — self-contained showcase of every primitive in every state (visual acceptance page; not wired into App.tsx) | Implemented |
| `frontend/src/design/README.md` — token philosophy, Phase 4 consumption rules, no-override rule for widget colors | Implemented |
| Verified: `npx tsc --noEmit -p tsconfig.json` in frontend/ | Verified — exit 0 (strict mode; includes src/design files) |
| Verified: `npm run build` in frontend/ | Verified — exit 0 (tsc + vite build). Pre-existing unrelated esbuild warning about a parent `jsconfig.json` target "ES2024"; build itself clean |

Notes:

- Design module files are currently type-checked via the project tsconfig
  (`include: ["src"]`) even though not yet imported from App.tsx.
- No temporary tsconfig fallback was needed; both required commands passed
  on the first attempt.
- Palette: graphite/charcoal surfaces; deep green `#3d8a66` + muted sage
  `#9dc0af` primary pair; teal/blue/lavender accents.

## Packaging (in progress)

Date: 2026-11-14. PyInstaller one-file backend sidecar. Built and smoke-tested;
sidecar wiring into the Tauri shell is pending (agent A owns src-tauri).

| Item | Status |
| ---- | ------ |
| PyInstaller 6.22.3 installed into backend/.venv via `backend\.venv\Scripts\python -m pip install pyinstaller` | Verified - exit 0, recorded in backend/requirements-dev.txt |
| `backend/studystream.spec` - one-file, console app (Tauri reads stdout/stderr for logs), entry run_backend.py, hidden imports for app.* (the import-string start `uvicorn.run("app.main:app")` is invisible to static analysis) + uvicorn runtime-string imports (loops/protocols/lifespan) | Implemented |
| `backend/build_backend.ps1` - cleans dist/+build/, calls .venv\Scripts\pyinstaller.exe directly (no venv activation), verifies exe, prints path and size | Implemented |
| `desktop/scripts/build-backend-sidecar.ps1` - wrapper: runs the backend build then copies exe to target-triple sidecar name `studystream-backend-x86_64-pc-windows-msvc.exe` (Tauri `externalBin` naming) | Implemented, run end-to-end |
| `backend/packaging/README.md` - build/run instructions, why console-not-windowed, Tauri wiring notes | Implemented |
| Build run 1: `powershell -ExecutionPolicy Bypass -File build_backend.ps1` (backend/) | Verified - exit 0, 80.5 s, dist\studystream-backend.exe 21.5 MB, Python 3.14.3, no PyInstaller 3.14 compat issues |
| Build run 2 (clean dist state, via desktop\scripts\build-backend-sidecar.ps1) | Verified - exit 0, 72.3 s, same 21.5 MB exe + triple-named copy |
| Smoke test 1: exe launched with STUDYSTREAM_PORT=47999 + random STUDYSTREAM_AUTH_TOKEN, `GET /api/v1/health` with x-auth-token header | Verified - HTTP 200 `{"status":"ok",...}` 2.9 s after launch (incl. one-file unpack); unauthenticated request rejected HTTP 401 (fail closed) |
| Smoke test 2 (second run) | Verified - HTTP 200, 2.2 s; process tree killed via taskkill /T /F, port 47999 confirmed free (no orphans) |
| exe size / build time / launch-to-healthy | 21.5 MB one-file; 72-80 s build; ~2-3 s launch-to-healthy (first smoke on Windows 11, native) |
| Build warnings | Only optional SQLAlchemy backend hidden-import warnings (tzdata, pysqlite2, MySQLdb, psycopg2) - irrelevant for SQLite-only backend |
| Tauri externalBin wiring | Pending - needs `externalBin: ["binaries/studystream-backend"]` in tauri.conf.json and the exe placed as `binaries/studystream-backend-x86_64-pc-windows-msvc.exe` next to src-tauri (see backend/packaging/README.md). tauri.conf.json intentionally untouched (agent A scope) |
| IMPORTANT: exe is NOT final | The packaged exe tracks agent A's per-launch auth changes which are landing concurrently; the sidecar must be REBUILT after backend changes land. Do not treat backend\dist\studystream-backend.exe as final output |


## Database expansion (early Phase 4 groundwork)

Added 2026-11-14 by the database-schema agent. Scope: widget engine /
event engine / study-media core tables per docs/ARCHITECTURE.md, single
additive migration `0002_core_tables` (down_revision `0001_initial`).
`AppSetting` untouched; no API endpoints added (schema only).

Tables created (all timestamps UTC via the `utc_now` helper, JSON stored
as TEXT, foreign keys enforced):

| Table | Key constraints |
| ----- | --------------- |
| `scenes` | `name` UNIQUE |
| `widgets` | `scene_id` FK -> scenes ON DELETE CASCADE; position_x/y, width/height normalised 0..1 with CHECK constraints (ARCHITECTURE invariant 5) |
| `integrations` | `provider` UNIQUE (twitch/kick/streamelements/youtube); no secrets stored (OS credential vault rule) |
| `events` | `event_id` UNIQUE (envelope dedup); `payload_json` TEXT; `is_simulated` flag per envelope v1 |
| `event_rules` | `event_type` UNIQUE |
| `subjects` | `name` UNIQUE |
| `tasks` | `subject_id` FK -> subjects ON DELETE SET NULL |
| `study_sessions` | subject/task FKs ON DELETE SET NULL; state idle/running/paused/completed; `accumulated_seconds` for backend-authoritative resume (invariant 8) |
| `activity_history` | `event_id` FK -> events nullable ON DELETE SET NULL (history survives event pruning) |

New files:
- `backend/app/models.py` (additive edits), `backend/app/events/__init__.py`
  (envelope constants mirroring `shared/event-schemas/event-envelope.v1.json`)
- `backend/migrations/versions/0002_core_tables.py`
- `backend/tests/test_db.py` (5 tests, no server)

### Verification (Windows 11, native)

| Command | Result |
| ------- | ------ |
| `cd backend && .venv\Scripts\python -m pytest tests\test_db.py -v` | exit 0 - 5 passed (round-trip per table, DB-level scene->widget cascade delete, subject delete SET NULL, unique constraints, widget geometry CHECK) |
| Throwaway copy of `studystream.db` + `STUDYSTREAM_DATABASE_URL` override: `alembic upgrade head`, `alembic current`, `alembic downgrade -1`, `alembic current` | exit 0 - 0001_initial -> 0002_core_tables (head), down back to 0001_initial; original `studystream.db` untouched during down-testing |
| `cd backend && .venv\Scripts\python -m alembic upgrade head` (against the real `studystream.db`) | exit 0 - `0002_core_tables (head)` applied additively |
| `cd backend && .venv\Scripts\python -m pytest -v` | exit 0 - 15 passed (5 new db tests + 10 pre-existing auth/health tests) |

### Notes / decisions for review

- Widget normalised geometry is enforced with named CHECK constraints
  (0..1) in both the model and the migration - stricter than the spec
  text, reviewed as desirable per invariant 5.
- `activity_history.event_id` uses ON DELETE SET NULL so history entries
  survive event-table pruning.
- Default values are Python-side (`default=`) matching the existing
  `0001_initial` style, not server defaults.
- SQLite stores `DateTime(timezone=True)` values as naive UTC strings; the
  `utc_now` default guarantees UTC content. Covered in test comments.
- Found (out of this agent's scope, NOT fixed):
  `backend/app/database.py::_configure_sqlite` takes one argument, but the
  SQLAlchemy `connect` event passes two - any first connection through
  `app.database.engine` will raise `TypeError`. Tests in `test_db.py`
  adapt the signature with a wrapper. database.py is a protected file;
  the owner should change the helper to
  `def _configure_sqlite(dbapi_connection, connection_record) -> None:`.
