# AGENT_CONTEXT.md — working state for agents

Last updated: 2026-11-17 (2026-11-14 baseline refreshed; see docs/BUILD_CHECKLIST.md sections H–J).

## Project

Study Stream 2.0 — greenfield rebuild of a study-stream desktop application.
Approved stack: Tauri 2 (Windows 11) + React/TypeScript/Vite frontend +
FastAPI backend as a PyInstaller sidecar + SQLite/SQLAlchemy/Alembic +
WebSockets. The OBS overlay is a separate React renderer (later phases).

- Working directory: `<repo>\V2 First`
- Read `CODING_STANDARDS.md` first. Read `docs/PHASE1_ACCEPTANCE.md` for
  the authoritative requirement/verification ledger.
- Approved plan: 8 phases (foundation → design system → overlay studio →
  widget engine → unified chat → events/alerts → study/media → release).
  Phases 1–2 are done and verified; Phase 3 is usable (drag hand-test
  pending); **Phase 4 overlay rendering verified 2026-11-15**; **2026-11-17
  round**: C8 perf fix, `enabled_widgets` unified end-to-end (Studio-independent
  global kill switch, live via `overlay.widgets_updated`), fresh-install
  production defect fixed (sidecar now migrates its DB at startup); see
  docs/BUILD_CHECKLIST.md sections H–J.
  Next: Phase 5 (chat OAuth) or polish backlog in section E of the checklist.

## Current state (verified 2026-11-14)

- Backend: FastAPI scaffold with `/api/v1/health` (verified live) and
  `/ws/control` echo (TestClient-verified). Binds 127.0.0.1:47831.
- SQLite + Alembic migration `0001_initial` (app_settings) verified.
- React dashboard builds (tsc + vite, exit 0); health check UI present.
- Tauri 2 shell config + minimal `main.rs` exists. **Rust build not yet run.**
- Backend venv exists: `backend/.venv` (use `py -3`; `python` alias is broken).
- **Vite dev servers MUST set `host: "127.0.0.1"` explicitly** — the default
  `localhost` binding lands on IPv6 `::1` only, which refuses `127.0.0.1`
  URLs (verified in overlay/ smoke test, 2026-11-14).
- **Rust msvc builds on this machine die at cl.exe C1083** on deeply nested
  workspace paths (the OneDrive path is >260 chars). Workaround: mount the
  repo as a short drive letter (`subst X: "<abs path to V2 First>"`, session
  -scoped, remove after) or shorten the workspace path/enable Windows long
  paths. The default rustc host triple is `x86_64-pc-windows-gnu`; for
  packaging use `--target x86_64-pc-windows-msvc`.
- PyInstaller sidecar packaging is DONE and verified:
  `backend/studystream.spec` + `desktop/scripts/build-backend-sidecar.ps1`
  produce `studystream-backend-x86_64-pc-windows-msvc.exe` (~24 MB one-file;
  bundles `overlay-dist/` since 2026-11-15 and `migrations/` since 2026-11-17 —
  the backend migrates its own DB at startup). The exe smoke-tested with 401
  fail-closed auth and, against an empty scratch DB, with all migrations
  applying cleanly and seeded scenes answering 200. Rebuild required after
  any backend change. Tauri externalBin lives under
  `desktop/src-tauri/binaries/` as `binaries/studystream-backend`.
  **Kill the process TREE on shutdown** — the one-file bootloader spawns a
  child process, so PID-only termination leaves orphans.
- **Startup migrations (2026-11-17):** `run_backend.py` runs `alembic
  upgrade head` (app/migrate.py) before uvicorn starts — dev and packaged
  alike. Packaged mode: the shell passes
  `STUDYSTREAM_DATABASE_URL=sqlite:///<app-data-dir>/studystream.db`
  (`%LOCALAPPDATA%/com.yashvir.studystream2/`), created on demand. Failure is
  fatal (exit 1) → shell reports Error with the backend log path instead of
  serving a broken API. Overlay token boot-log error that existed on empty
  DBs is gone.
- **OneDrive reparse-point lock (2026-11-15):** a file inside
  `desktop/src-tauri/binaries/` can get stuck with a OneDrive sync handle
  (ReparsePoint attribute); overwrite/delete then fail with "Access denied"
  even though no process lists it. Workaround that worked: rename the whole
  `binaries/` directory aside, create it fresh, copy the new exe in. The
  stale copy sits in `binaries-stale-DELETE-ME/` — delete it by hand when
  OneDrive releases the lock.
- **Sidecar build can hang silently for ~10 minutes** even though it
  produced nothing: the cleanup step (`Remove-Item backend\dist, build`)
  can take minutes to release OneDrive reparse-locked children, and the
  wrapper then dies on its own timeout leaving `backend\dist`/`build`
  EMPTY (as happened 2026-11-17). Recovery: wait/polish the lock check with
  `Get-ChildItem backend\dist` (empty dirs ⇒ build never ran), then invoke
  `pyinstaller backend\studystream.spec --noconfirm --distpath backend\dist
  --workpath $env:LOCALAPPDATA\Temp\opencode\pyi-work` DIRECTLY (~200 s),
  then run build-backend-sidecar.ps1's copy step again.
- Overlay renderer is a full widget host (since 2026-11-15): `overlay/` builds
  to `backend/overlay-dist/`, served by the backend at `/overlay/<scene>`;
  8 widgets keyed off placement `variant`; transparent canvas; auto-reconnect
  WS (exponential backoff + jitter; terminal state on 4401/1008); renders
  placed widgets, filtered by the global `enabled_widgets` preference which
  also updates live via `overlay.widgets_updated` (2026-11-17). Overlay asset
  hashes change every rebuild — OBS Browser Sources need one manual refresh.
- **agent-browser CLI is wedged on this machine (2026-11-17):** `open`
  hangs past 180 s and leaks Chrome processes (26 strays cleaned after
  three attempts). Until it is re-installed, verify UI-adjacent work via
  curl/API probes + `npm run build` green, and say so honestly in the
  checklist instead of claiming a browser test. browse MCP was offline
  too; chrome-devtools MCP was not reachable from this shell.

## Phase 1 remaining work (in order) — STATUS 2026-11-14

1. ~~Tauri-managed backend lifecycle~~ **DONE + VERIFIED (dev mode)**
2. ~~Per-launch authentication~~ **DONE + VERIFIED** (fail-closed 401 confirmed)
3. ~~PyInstaller sidecar packaging~~ **DONE + VERIFIED** (21.5 MB exe;
   externalBin wired; rebuilt with final auth code)
4. Windows verification — **DONE**: dev mode (launch, readiness, auth,
   graceful shutdown, zero orphans) AND packaged release mode (sidecar backend,
   makensis installer built). Remaining: run the NSIS installer itself +
   clean-machine test — optional, user's call.

**Phase 1 status: code-complete and verified.** See PHASE1_ACCEPTANCE.md for
evidence and the 3 documented residual items (installer execution, clean-machine
test, memory measurement).

## Definition of done (Phase 1 gate) — STATUS 2026-11-14

Packaged desktop app launches reliably on Windows, starts its backend,
communicates over loopback with auth, initialises SQLite, and shuts down
cleanly with zero orphan processes.

**Status: VERIFIED in both dev and packaged modes.** Launch, readiness,
authenticated handshake, WM_CLOSE → taskkill tree → zero orphans. The only
remaining leg is executing the NSIS installer itself (and the clean-machine
test) — deliberately not run since it modifies the user's system.

## Coordination notes

- Report progress by editing `docs/PHASE1_ACCEPTANCE.md` and appending a
  dated entry to `docs/PROGRESS_LOG.md`. Keep it terse and factual.
- FE↔BE contract lives in the backend: endpoints declare `response_model`
  (`app/api/schemas.py`) so the OpenAPI spec is complete. The frontend's
  response types alias the generated `src/services/api-schema.ts` — after
  ANY backend response-shape change run `cd frontend && npm run gen:api`
  and commit the regenerated file. Never hand-copy response shapes into
  `api.ts`.
- If a verification cannot be run (missing tool/credentials), say so
  explicitly in the log instead of assuming.
- Frontend dev server and backend may be started for testing; always kill
  spawned processes before finishing.

## Integration direction (LOCKED by research, 2026-11-14)

Read `docs/RESEARCH_INTEGRATIONS.md` before doing any Phase 5/6 work. Key
locked conclusions (all verified from official docs that day):

1. **Kick direct integration is architecturally impossible** for us: the
   official events API is webhook-only with a mandatory public HTTPS callback.
   Do NOT build a Kick webhook adapter. StreamElements Astro is the only
   local-only path for Kick chat + KICKs.
2. **StreamElements `channel.chat` topic (launched 2026-11-03)** is the
   first-choice provider for unified chat: one normalised fragment format
   across Twitch/YouTube/Kick/X, plus moderation events. Known gaps: Kick and
   YouTube have no per-message delete events; Kick lacks chat_cleared.
   The event envelope's `chat.deleted` handling must degrade gracefully.
3. **Twitch EventSub WebSocket** is the native fallback + raid source:
   `wss://eventsub.wss.twitch.tv/ws`, exact scopes in the research doc
   (follow v2, subs, bits, chat read; raid needs no scope).
4. **YouTube Now Playing must be Manifest V3** (MV2 dead since Chrome 138/139).
   Media Session metadata requires MAIN-world injection — plan accordingly.
