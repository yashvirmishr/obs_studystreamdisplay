# Study Stream 2.0 — launch contract

Every knob this system reads from the environment, in one place.

## Backend process (Python / uvicorn)

| Variable | Default | Consumed by | Meaning |
|---|---|---|---|
| `STUDYSTREAM_PORT` | `47831` | `backend/app/config.py` | TCP port to bind. Non-numeric or `0` falls back to default. |
| `STUDYSTREAM_AUTH_TOKEN` | _(none)_ | same | 256-bit per-launch credential. Missing ⇒ **fail closed**: every `/api/v1/*` returns 401 and WS closes with 4401. Tauri shell generates this fresh every launch; it never touches disk. |
| `STUDYSTREAM_DATABASE_URL` | `sqlite:///./studystream.db` | same | SQLAlchemy URL. Tests point this at a tmp file to avoid polluting the real database. The packaged shell overrides this with `sqlite:///<app-data-dir>/studystream.db` so the production DB never lands next to the installed exe. |
| — | — | `run_backend.py` | Alembic `upgrade head` runs at startup (dev and packaged) before uvicorn; failure exits 1 so the shell reports the early exit. |
| `STUDYSTREAM_PORT` is also honoured by `desktop/scripts/build-backend-sidecar.ps1` indirectly via PyInstaller? No — it's read at **runtime** only. |

## Frontend process (Vite dev server)

The frontend never reads env files. In **browser dev** it discovers the backend by asking the same origin that serves it:

| URL query | Default | Meaning |
|---|---|---|
| `?port=47999` | `47831` | Override the backend port. Useful when the shell picks an ephemeral port. |
| `?token=<launch-token>` | _(none)_ | Supply the launch token. Without it, the backend correctly returns 401 and the UI shows "authenticated, fail-closed". |

Inside **Tauri**, the frontend never guesses: it calls the shell's `get_backend_status` / `get_auth_token` commands and receives the port and token as fresh, in-memory-only strings.

## Spawning the backend manually (dev only)

```powershell
$env:STUDYSTREAM_AUTH_TOKEN = "some-64-hex-char-string"
$env:STUDYSTREAM_PORT = "47999"
.venv\Scripts\python run_backend.py
```

Then open `http://127.0.0.1:5173/?port=47999&token=some-64-hex-char-string`.

## Architecture invariants that depend on this contract

- Backend **always** binds `127.0.0.1`. No env var exists to change that, because changing it would violate the local-only invariant.
- The Tauri shell picks the port (default 47831, ephemeral fallback if taken) and passes it to the backend via `STUDYSTREAM_PORT`. The frontend never hardcodes 47831 in production code — it asks the shell.
- The launch token is generated per launch by the shell (`rand::thread_rng`), passed via env to the backend, and via IPC to the webview. It is never in argv, never on disk, never in the frontend bundle.
