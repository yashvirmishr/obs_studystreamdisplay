# Study Stream 2.0 — Build checklist & verification ledger

> Rule: **implemented ≠ tested ≠ verified.** Every line below states what is
> actually proven. Last updated: 2026-11-14.

Legend: ✅ verified on Windows 11 (evidence) · 🧪 implemented + tested via automated tests · 🔧 implemented, partially verified · ⬜ not started/blocked

## A. Backend (FastAPI, `backend/`)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| A1 | FastAPI app, `127.0.0.1` bind only (47831; override via `STUDYSTREAM_PORT`) | ✅ | `app/config.py`; live boot + health check |
| A2 | `/api/v1/health` — minimal body | ✅ | live HTTP 200; 401 without token (fail-closed) verified |
| A3 | `/ws/control` WebSocket echo (auth via query token or first `{"type":"auth"}` message; close 4401) | ✅ | TestClient tests |
| A4 | `LaunchAuthMiddleware` — 401 on all `/api/v1/*` without `X-Auth-Token` / Bearer; OPTIONS preflight passes; CORS restricted | ✅ | `tests/test_auth.py` (8 tests), packaged-exe smoke test 401/200 |
| A5 | SQLite + WAL + FK enforcement + busy timeout | ✅ | `app/database.py`; `_configure_sqlite` arity defect found & fixed |
| A6 | SQLAlchemy 2.0 models: `app_settings`, `scenes`, `widgets` (geometry CHECKs), `integrations`, `events`, `event_rules`, `subjects`, `tasks`, `study_sessions`, `activity_history` | ✅ | `test_db.py` 5/5 passed |
| A7 | Alembic migrations `0001_initial` → `0002_core_tables` → `0003_seed_registry` | ✅ | applied + downgrade-tested on throwaway copy; real DB at 0003 |
| A8 | Layout API (`GET/PUT /api/v1/scenes/{name}/layout`) — atomic replace, clamping, per-scene | ✅ | `test_scenes_seeded_and_layout_roundtrip` (incl. clamp + 422 + 404) |
| A9 | Study lifecycle API (`/start|pause|resume|stop|state|history`) — backend-authoritative, persisted, 409 conflicts | ✅ | `test_study_full_lifecycle`, `test_pause_when_idle_conflicts` — 22/22 suite green |
| A10 | Synthetic test-event API (`POST /api/v1/events/test`, `is_simulated=true`) + `/activity/recent` | ✅ | `test_test_event_lifecycle`, `test_test_event_validation` |
| A11 | Settings allowlist API (`study_goal_hours`, `enabled_widgets`, …) + 422 on unknown keys | ✅ | `test_settings_allowlist` |
| A12 | Integration registry API (`GET /api/v1/integrations` seeded disconnected; `POST .../disconnect` works; `POST .../connect` honest 501) | ✅ | manual + automatic verification of 501 detail; `integrations` seeded by 0003 |

## B. Frontend (React + TS strict, `frontend/`)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| B1 | Material 3 Expressive design system: tokens (light↔dark ambient, tonal surfaces, expressive radii 16→28px, spring motion), `tokens.ts`↔`tokens.css` in sync | ✅ | `src/design/`; visual QA via screenshots |
| B2 | Hand-rolled icon set (36 icons, enum-checked) | ✅ | `design/icons.tsx` |
| B3 | Primitives: Button, Card, StatusPill, SectionHeader, Snackbar | ✅ | builds + used in app |
| B4 | App shell: top bar (brand, ⌘K search hint, preview badge) + M3 navigation rail | ✅ | screenshot |
| B5 | Overview page — **all live backend data**: study session (start/pause/resume/stop via API), timer tick, goal ring (today_total vs `study_goal_hours`), week stats/streak from `/study/history`, activity feed from `/activity/recent`, connection health from live probe + `/integrations` | ✅ | chrome-devtools deep test: start → pause → resume → stop exercised through the real UI against a live backend; 0-mock confirmed |
| B6 | Overlay Studio — canvas 1920×1080, drag/resize via pointer events, snap grid, guides, layers, opacity/lock/visible, duplicate, remove, debounced SQLite save, per-scene (Study / Please Wait) | 🔧 | All property paths + persistence verified via API round-trips; **mouse drag & resize-handle not exercised via MCP** (pointer drag unsupported by tooling) — user verification pending |
| B7 | Widgets page — registry of 8 widgets, enable/disable persisted via settings API | ✅ | wired to `/api/v1/settings` |
| B8 | Integrations page — real provider registry, Connect → honest 501 (never fakes connected), synthetic event console → real `events` rows | ✅ | deep test: 501 surfaced verbatim; `stream.follow` synthetic posted and visible in Activity feed |
| B9 | Activity Centre — real `/activity/recent` feed, platform filter tabs, honest "chat not wired (Phase 5)" panel | ✅ | deep test: synthetic follow visible, marked SIMULATED; Tips filter empties correctly |
| B10 | Settings page — appearance (accent swatches, client-side), storage/security/about (real facts), **daily goal editor wired to backend** | ✅ | goal `<select>` writes to `/api/v1/settings` |

## C. Desktop shell & packaging

| # | Item | Status | Evidence |
|---|------|--------|----------|
| C1 | Tauri 2 shell manages backend lifecycle: spawn, readiness poll vs `/api/v1/health`, startup timeout, crash exit detection, stdout/stderr → timestamped log, tree-kill on exit (`taskkill /T /F`) | ✅ | `tauri dev` live test: launch, ready in ~2 s, authenticated 200s in log, WM_CLOSE → tree killed, port free, zero orphans |
| C2 | Per-launch auth: 256-bit CSPRNG token in memory only; env-var handoff; frontend receives via Tauri IPC; never argv/disk | ✅ | dev + packaged runs |
| C3 | PyInstaller one-file backend sidecar (21.5 MB); target-triple naming; `externalBin` wired; `build-backend-sidecar.ps1` reproducible | ✅ | built twice; exe smoke-tested |
| C4 | NSIS installer built (`Study Stream 2.0_0.1.0_x64-setup.exe`, 23.64 MiB); packaged app launched in-place, sidecar confirmed, health 200, clean WM_CLOSE shutdown, zero orphans | ✅ | `tauri build --target x86_64-pc-windows-msvc` exit 0 |
| C5 | Installer execution on this machine / clean-machine test | ⬜ | deliberately not run (modifies user system) — **needs your go-ahead** |
| C6 | MSVC `ring` C1083 build failure (workspace path > MAX_PATH) — workaround `subst X:` | 🔧 | remembered in AGENT_CONTEXT; consider enabling Windows long paths or shortening workspace path |

## D. Cross-cutting

| # | Item | Status | Evidence |
|---|------|--------|----------|
| D1 | Zero mock/sample data — `data/sample.ts` **deleted**; every visible number is live or an honest empty state | ✅ | `grep` for sample/SAMPLE/fake → clean |
| D2 | UTC-naive timestamp parsing bug (8-hour offset) | ✅ fixed | `utils/time.ts`; "2 min ago" now correct |
| D3 | `_configure_sqlite` arity defect (would TypeError on first real DB connection) | ✅ fixed | `app/database.py`; suite re-run 15→22 green |
| D4 | Vite dev servers must bind `127.0.0.1` (IPv6-only default otherwise) | ✅ documented | AGENT_CONTEXT.md |
| D5 | StrictMode double-fire of layout saves (side effect in state updater) | ✅ fixed | snapshot-at-fire-time pattern; double-PUT sequences observed pre-fix, none post-fix |
| D6 | Locked widgets moved by keyboard nudge | ✅ fixed | `onKeyDown` guard |
| D7 | Pending debounced save could write Scene B's widgets into Scene A's layout | ✅ fixed | save cancelled on scene switch |
| D8 | Naive-UTC SQLite datetimes displayed as local time ("completed 8 hr ago") | ✅ fixed | `utils/time.ts` |
| D9 | Shared contracts: `shared/event-schemas/event-envelope.v1.json` (+ TS types), `docs/ARCHITECTURE.md`, `docs/RESEARCH_INTEGRATIONS.md`, `docs/ARCHITECTURE.md` invariants | ✅ | all present |
| D10 | AGENT_CONTEXT/CODING_STANDARDS for future agents (pit-of-success environment) | ✅ | all current |

## E. What is NOT done / honest gaps

- ⬜ Mouse **drag & resize-handle** in Overlay Studio untested via MCP (no pointer-drag in tooling) — you should try dragging once by hand
- ⬜ NSIS installer never executed (needs your go-ahead) + clean-machine test
- ⬜ Memory measurement on 16 GB machine
- ⬜ Phase 2+ features: actual dashboard data density polish, Phase 4 widget registry endpoints, Phase 5 chat (StreamElements), Phase 6 events wiring, Phase 7 study integration into overlay, OBS CEF rendering test
- ✅ ~~Frontend dist is stale vs. current source~~ (rebuilt 2026-11-15, `tsc` + vite exit 0 — includes eventText dedupe + probe cleanup)
- ⬜ Light theme token pass (dark-first shipped)
- ⬜ 2 browser advisories in overlay/ dev deps (transitive, dev-only)
- ⬜ OBS overlay URL card on Overview is hard-wired to the "study" scene; the endpoint accepts any scene — a per-scene picker (or the URL shown in Overlay Studio per scene tab) would serve multi-scene setups better
- ⬜ Design ambiguity to reconcile: Widgets page toggles (`enabled_widgets` setting) vs. per-scene placements — the overlay currently renders what is *placed* (studio is source of truth) and ignores the global toggle; decide which layer is authoritative before Phase 6

## F. Test suite summary (2026-11-14)

`pytest` (Windows 11, native): **28 passed** - health (2), auth (8), DB (5), API (7), event bus (6).

**2026-11-15:** **32 passed** - event bus grew to 10 tests (hello bootstrap snapshot,
layout envelope + live broadcast, stop→hello refresh, resume≠start event type).

## G. Architecture candidates (2026-11-14)

| # | Candidate | Status | Evidence |
|---|-----------|--------|----------|
| G1 | Eliminate double-probing race (useBackendProbe + ad-hoc frontend fetches) | ✅ | sdk rewritten as api.ts; useBackendProbe drives all reads; no raw fetch() calls remain in frontend |
| G2 | Deepen API client (many shallow functions → one typed gateway) | ✅ | `api.health/study/activity/events/integrations/settings/scenes`; HttpError taxonomy; `isNormalisedPlacement()` + placement SQLite CHECKs |
| G3 | Cross-boundary placement contract | ✅ | shared guard `isNormalisedPlacement`; round-trip backend test (zero-g, 100%, opacity 0.35) |
| G4 | Event bus: paper → real | ✅ | `app/events/bus.py` in-process pub/sub, wildcard subscribers, drop-newest eviction. `/ws/overlay/{scene_name}` resolves scene, authenticates, fan-out WS. Live-test verified 2026-11-14T09:23:00Z (`stream.follow` round-trip). Test suite: `test_event_bus.py` (6 tests) |
| G5 | Doc comments / AGENT_CONTEXT documentation of known bugs (IPv6-only dev servers, max_path, one-mechanism-per-file) | ✅ | AGENT_CONTEXT.md expanded; overlay IPv6 pitfall documented; `CODING_STANDARDS.md` created |

**Note:** G5 may not be fully correct — AGENT_CONTEXT is maintained over time.

```
backend/tests/test_health.py     2  ✅
backend/tests/test_auth.py       8  ✅
backend/tests/test_db.py         5  ✅
backend/tests/test_api.py        7  ✅   (lifecycle, 409s, clamp, 422, 404, auth 401)
```

Live end-to-end (dev): window → sidecar/venv backend → SQLite → authenticated API round-trips → WM_CLOSE → zero orphan processes.

**Bottom line:** Phase 1 foundation is verified end-to-end (dev + packaged). Phase 2 design groundwork is code-complete and builds. Nothing is marked verified without evidence; the gaps above are the known ones.

## H. Phase 4 — overlay renders real widgets (2026-11-15)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| H1 | WS bootstrap: `overlay.hello` (study state, goal, recent events, recent sessions) + `overlay.layout` sent on socket accept | ✅ | `app/overlay_snapshot.py`; `test_overlay_hello_carries_real_state`; live browser run |
| H2 | Overlay renders placed widgets on a scaled 1920×1080 canvas (8 widget components keyed by placement `variant`) | ✅ | screenshots `overlay-widgets-live.png` / `overlay-final.png` (agent-browser) |
| H3 | Live layout updates: PUT layout → `overlay.layout_updated` broadcast → widgets re-render **without reload**; cross-scene updates filtered | ✅ | placed 8 widgets via API while page open — appeared in ~2 s, no reload |
| H4 | Timer widget ticks from authoritative backend state (full state in every `study.*` envelope, local 1 Hz drift, re-based per envelope) | ✅ | start → 00:00:04→00:00:13 ticking; pause → frozen amber 00:00:24 |
| H5 | Stop refreshes history/goal/today-totals live (stop re-publishes `overlay.hello`) | ✅ | `test_stop_republishes_hello_snapshot`; history showed "Physics · 3s — just now" without reload |
| H6 | Resume labelled `study.session.resumed` (was mislabelled `started` — candidate 6) | ✅ | `test_resume_is_not_labelled_as_start` |
| H7 | Widget-type registry: `app/widget_types.py` canonical ids; PUT normalises legacy label-slugs (`youtube_now_playing` → `now_playing`); studio maps label→id directly (candidate 4 slug bug) | ✅ | API PUT echoed `now_playing`; new tests |
| H8 | Honest empty states — chat ("appears once an integration is connected"), media ("connect the YouTube extension"), goal (no goal set), history (no completed sessions), activity (no events) | ✅ | screenshots; zero mock data |
| H9 | Test events visually marked in overlay feed (`sim` badge, `is_simulated` end-to-end) | ✅ | cheer test event rendered with SIM badge |
| H10 | Overlay bundle rebuilt + copied to `backend/overlay-dist/` (served by backend) | ✅ | new asset hashes live; OBS reload required to pick up (note below) |
| H11 | Frontend studio slug fix builds (`tsc` + vite) | ✅ | `npm run build` exit 0 |

**Note for OBS:** Browser Sources pointed at `/overlay/...` must be **refreshed once** (right-click → Refresh) to fetch the new bundle — asset filenames change per build.

## I. Review-candidate fixes round 2 (2026-11-15)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| I1 | C7 — overlay WS terminal auth state: 4401 → "overlay token rejected" banner, **no retry**; 1008 unknown scene → "check the Browser Source URL"; error-tone dot (no pulse) | ✅ | live: wrong token showed terminal banner unchanged at t=18 s (previously retried forever, log showed endless HTTP 403) |
| I2 | Backend WS bug found by I1: overlay socket closed **before accept** → uvicorn answered HTTP 403 → browser close code 1006 → renderer could never distinguish bad-token from backend-down | ✅ fixed | `main.py` accept-then-close; suite 32 passed; valid-token path re-verified (widgets render) |
| I3 | C5 — `useBackendProbe` dead code (`if (attempts > 400) return` ran after all side effects, stopped nothing) | ✅ removed | hook now probes indefinitely by design (comment added); builds |
| I4 | C3 — dashboard envelope→text dedup: `frontend/src/utils/eventText.ts` (`formatEventTitle`, `formatEventSource`) is now the single formatter for Overview + ActivityCentre (was two drifting copies; gift counts now shown consistently) | ✅ | both pages import it; `tsc` exit 0 |

## J. Performance, enablement unification & fresh-install fix (2026-11-17)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| J1 | C8 - today_total_seconds full-table scan on every /study/state poll (~2 s) eliminated: SQL-level date predicate + index | ✅ fixed | app/study/service.py (created_at >= today); migration 0004_study_session_index; ix_study_sessions_created_at also declared in model __table_args__ so create_all matches |
| J2 | Migration 0004 applied to the real dev DB | ✅ done | alembic upgrade head -> 0004_study_session_index; alembic current confirms |
| J3 | enabled_widgets id drift: Widgets page toggled "daily_goal", backend registry id is "goal_ring" (toggle wrote a key nothing read) | ✅ fixed | Widgets page ids now mirror widget_types.py (all 8); comment warns against re-introducing drift |
| J4 | enabled_widgets semantics made honest: absent/null => all placed widgets render; explicit list => disabled types filtered from the overlay even when placed | ✅ fixed | overlay socket carries enabled_widgets from hello; App.tsx filters placements; Widgets page shows "All 8 enabled (default)"; absent-setting display no longer invents a 6-widget default |
| J5 | Settings PUT accepts null to clear a preference (row deleted) - "enable everything" restores backend default instead of persisting a redundant list | ✅ fixed | app/api/settings.py; test_settings_null_clears_preference |
| J6 | Widget enablement applies live to running overlays: new overlay.widgets_updated bus envelope broadcast by settings PUT; overlay re-filters immediately - no OBS refresh, no page reload | ✅ done + verified live | overlay "widgets" envelope kind; test_settings_put_broadcasts_widgets_updated; agent-browser: PUT ["clock","study_timer"] -> only timer + clock rendered; PUT null -> all 8 back (widgets-live-restored.png) |
| J7 | overlay.hello payload now carries enabled_widgets (null or explicit string list) | ✅ done | app/overlay_snapshot.py (read_enabled_widgets); test_overlay_hello_carries_enabled_widgets |
| J8 | Fresh-install production defect: packaged sidecar started against an empty/missing DB with no migrations bundled -> "no such table: app_settings"; every endpoint failed; overlay tokens never generated | ✅ fixed | app/migrate.py (alembic upgrade head at startup, fatal on failure -> shell Error state with log path); migrations/ bundled as PyInstaller datas + alembic hiddenimports; run_backend.py migrates before uvicorn starts |
| J9 | Packaged DB location: shell points STUDYSTREAM_DATABASE_URL at the per-user app-data dir (created if needed), so the app never writes next to the installed exe | ✅ fixed | desktop/src-tauri/src/main.rs (app.path().app_data_dir() -> sqlite:///.../studystream.db); dev mode unchanged |
| J10 | Fresh-install smoke of rebuilt sidecar against an empty scratch DB | ✅ | migrations 0001->0004 applied, scenes seeded, /api/v1/study/state 200, /api/v1/scenes/Study/layout 200 (placements null), /health 200, wrong token 401, boot log free of the J8 traceback |
| J11 | Installer rebuilt with the fixes | ✅ done | Study Stream 2.0_0.1.0_x64-setup.exe 26.19 MiB (bundles sidecar 24.1 MB with migrations + overlay-dist index-iYyoVvnm.js); MSVC via subst X:; X: unmounted after |
| J12 | Test suite after round | ✅ | 36 passed (+4: settings null-clear, today-totals predicate, hello enabled_widgets, widgets_updated broadcast) |

Note for OBS: overlay asset hashes changed again (index-iYyoVvnm.js) - Browser Sources need one manual refresh.
Note: backend startup now logs "applying database migrations... database is up to date" on every start; on partial-migration failure it exits 1 so the shell reports the early exit with the log path (honest, diagnosable) instead of serving a broken API.
