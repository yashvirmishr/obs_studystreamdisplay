# Study Stream 2.0 — Phase 1 Foundation

Clean greenfield rebuild of the Study Stream application. **V1 is reference-only and must never be modified.**

## Approved architecture

| Component           | Technology              |
| ------------------- | ----------------------- |
| Desktop application | Tauri 2                 |
| Frontend            | React + TypeScript      |
| Build tool          | Vite                    |
| Backend             | Python + FastAPI        |
| Backend packaging   | PyInstaller (planned)   |
| Database            | SQLite                  |
| ORM                 | SQLAlchemy 2.0          |
| Migrations          | Alembic                 |
| Real-time           | WebSockets              |
| Target OS           | Windows 11              |

## Project layout

```
V2 First/
├── backend/          FastAPI service (API, WebSockets, SQLite, Alembic)
├── frontend/         React + TypeScript dashboard (Vite)
├── desktop/          Tauri 2 shell (src-tauri) + dev scripts
├── docs/             Acceptance checklist and documentation
└── README.md
```

## Status: initial scaffold — NOT production-ready

Implemented in code but **not yet verified on Windows**:

- FastAPI backend with `/api/v1/health` and `/ws/control`
- SQLite (WAL mode, foreign keys, busy timeout) + SQLAlchemy 2.0 model
- Initial Alembic migration creating `app_settings`
- React + TypeScript dashboard with backend health check
- Tauri 2 configuration and Rust shell
- Backend binds to `127.0.0.1:47831` only, CORS restricted to local/Tauri origins

**Not yet implemented** (Phase 1 completion gate):

- Tauri-managed backend startup, readiness polling and supervision
- Per-launch authenticated communication (API + WebSocket)
- PyInstaller packaging of the backend as a Tauri sidecar
- Windows 11 verification (startup, restart, shutdown, clean install)

## Running locally (development)

Backend (requires Python 3.11+):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python run_backend.py
```

Frontend (requires Node 18+):

```powershell
cd frontend
npm install
npm run dev
```

Desktop shell (requires Rust toolchain):

```powershell
cd desktop
npm install
npm run tauri dev
```

## Rules

1. Never modify V1.
2. Backend binds exclusively to `127.0.0.1`.
3. No secrets hardcoded; OAuth tokens never in plaintext SQLite.
4. Do not claim untested functionality works.
5. Use Alembic migrations for all schema changes.
