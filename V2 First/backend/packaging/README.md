# Packaging the Study Stream 2.0 backend (PyInstaller sidecar)

Status: **in progress** — build and smoke tests verified 2026-11-14.
Sidecar wiring into the Tauri shell is not done yet.

## What exists

| File | Purpose |
| --- | --- |
| `backend/studystream.spec` | PyInstaller spec: one-file, console app, entry `run_backend.py` |
| `backend/requirements-dev.txt` | `pyinstaller` pin for build-only installs |
| `backend/build_backend.ps1` | Cleans `dist/` + `build/`, runs PyInstaller, verifies exe, prints path |
| `desktop/scripts/build-backend-sidecar.ps1` | Wrapper: runs the backend build, then copies the exe to the target-triple sidecar name |

## Build

```powershell
# one-time: install the builder into the existing backend venv
backend\.venv\Scripts\python -m pip install -r backend\requirements-dev.txt

# full build + sidecar-named copy
powershell -ExecutionPolicy Bypass -File desktop\scripts\build-backend-sidecar.ps1

# or just the backend exe
powershell -ExecutionPolicy Bypass -File backend\build_backend.ps1
```

Outputs (verified 2026-11-14):

- `backend\dist\studystream-backend.exe` — ~21.5 MB one-file console exe
- `backend\dist\studystream-backend-x86_64-pc-windows-msvc.exe` — same bytes,
  sidecar-named copy

## Why these choices

- **Console app, not `windowed`.** The Tauri shell reads this process's
  stdout/stderr for backend logs; a windowed exe has no console streams, so
  log capture would silently produce nothing.
- **One-file.** Matches the approved plan (single sidecar binary next to the
  Tauri exe).
- **Hidden imports.** `run_backend.py` starts uvicorn via the import string
  `"app.main:app"`, which static analysis cannot see, so the spec pins
  `app.main`, `app.api.health`, `app.security.auth`, `app.database`,
  `app.models`. uvicorn resolves its event-loop/protocol/lifespan modules
  through runtime string imports (`*.auto` selectors), so the concrete
  implementations (`uvicorn.loops.auto`, `uvicorn.protocols.http.*`,
  `uvicorn.protocols.websockets.*`, `uvicorn.lifespan.*`) are pinned too.

## Runtime behaviour (verified)

The frozen exe honours the same launch env vars as the dev backend:

- `STUDYSTREAM_PORT` — port override (smoke tests used 47999)
- `STUDYSTREAM_AUTH_TOKEN` — per-launch token; without it every
  `/api/v1/*` request is rejected with 401 (fail closed)

Smoke results: `GET /api/v1/health` with the token → 200 in ~2–3 s from
process start (one-file unpack included); without the token → 401.
The one-file bootloader runs a child process for the Python runtime, so
shutdown must kill the **process tree** (e.g. `taskkill /T /F /PID`), which
is what the Tauri shell's kill-on-exit logic must do.

## Tauri wiring (TODO for whoever wires the sidecar)

`tauri.conf.json` will need:

```json
"bundle": {
  "externalBin": ["binaries/studystream-backend"]
}
```

Tauri appends the target triple automatically; the file on disk next to
`src-tauri` must literally be named
`binaries/studystream-backend-x86_64-pc-windows-msvc.exe` (that naming is
produced by `desktop\scripts\build-backend-sidecar.ps1`; pass
`-SidecarDir ..\desktop\src-tauri\binaries` or copy it there at bundle
time). The Rust process-launch code references the sidecar *without* the
triple suffix.

## Important caveats

- **The current exe is NOT final.** Per-launch auth was being landed
  concurrently; the packaged exe must be **rebuilt** after the auth agent's
  changes land (and after any future backend change). Treat
  `backend\dist\studystream-backend.exe` as disposable build output.
- Alembic migrations are not yet packaged into the exe (none are invoked at
  backend boot today). If runtime migrations are added later, the spec will
  need `datas` entries for `migrations/` + `alembic.ini`.
- Build warnings about `tzdata`, `pysqlite2`, `MySQLdb`, `psycopg2` are
  PyInstaller's SQLAlchemy hook enumerating optional DB backends —
  irrelevant for the SQLite-only backend.

## Build evidence (2026-11-14)

- PyInstaller 6.22.3, Python 3.14.3 (backend/.venv), Windows 11.
- Build 1: 80.5 s; build 2 (clean, via sidecar wrapper): 72.3 s. Same 21.5 MB exe.
- Smoke test 1: healthy 2.9 s; smoke test 2: healthy 2.2 s. No orphan
  processes after `taskkill /T /F` (port 47999 verified free).
