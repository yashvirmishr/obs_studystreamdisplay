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
- ⬜ Phase 2+ features: actual dashboard data density polish, Phase 4 widget registry endpoints, Phase 5 chat SUBSCRIBER pipeline (SE connect handshake is DONE - see section S; streaming chat into the overlay is not), Phase 6 events wiring, Phase 7 study integration into overlay, OBS CEF rendering test
- ✅ ~~Frontend dist is stale vs. current source~~ (rebuilt 2026-11-15, `tsc` + vite exit 0 — includes eventText dedupe + probe cleanup)
- ⬜ Light theme token pass (dark-first shipped)
- ✅ Dev-server advisories (esbuild GHSA-67mh-4wv8-2f99): RESOLVED 2026-11-17 by upgrading vite 5 -> 7.3.8 in BOTH apps (vite 7 ships esbuild ^0.25, clearing both advisories without the rolldown jump of vite 8). npm audit now reports zero vulnerabilities in frontend/ and overlay/. Rolled out + verified live; OBS Browser Sources need one manual refresh (asset hashes changed).
- ✅ OBS overlay URL card on Overview: per-scene picker chips (Study / Please Wait from GET /api/v1/scenes) drive the overlay-url fetch - done 2026-11-17 (agent-browser verified: Study default, Please Wait chip switched URL to the Please Wait scene token)
- ✅ Widgets page toggles vs. per-scene placements: layers unambiguous - Overlay Studio (placements) decides whether/where a widget exists on a scene; the global enabled_widgets page is a cross-scene kill switch filtering placements in the overlay (null = all enabled). Applied live via overlay.widgets_updated (2026-11-17). See section J

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

## K. OBS scene picker for the overlay URL card (2026-11-17)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| K1 | GET /api/v1/scenes: list persisted scenes (honest SQLite rows, names + canvas + active flag) | ✅ pass | endpoint auth-401 fail-closed; live call returned Study (active) + Please Wait |
| K2 | Overview OBS URL card: scene-chip tabs (.scene-chip reuse) replacing the hard-wired "study"; visible only with 2+ scenes; refresh + copy follow the selection | ✅ pass | agent-browser live: Study default shows Study token URL; clicking Please Wait switched to the Please Wait token URL (screenshot obs-scene-picker.png) |
| K3 | New backend test test_scenes_list_seeded | ✅ pass | suite 36 -> 37 passed |
| K4 | Sidecar + NSIS installer rebuilt to ship the endpoint | ✅ done | 26.19 MiB at 12:35; X: unmounted after |

## L. Settings honesty + packaged DB location (2026-11-17)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| L1 | theme_accent round-trips: swatch -> PUT -> reload -> same accent | ✅ pass | agent-browser live; GET /settings returned ss-accent-teal; reload kept Teal checked; test-write reverted to null |
| L2 | Packaged DB dir: shell app_local_data_dir() -> %LOCALAPPDATA%/com.yashvir.studystream2/studystream.db (matches Settings page claim; keeps a local-only DB out of roaming) | ✅ done | main.rs change; installer rebuilt |
| L3 | Settings Storage pane stale schema claims (0002, "applied 0001 -> 0002") corrected; About pane stale claims (phase, 21.5 MB, Alembic 0001-0003) corrected | ✅ done | verified rendering via agent-browser snapshot |
| L4 | Installer rebuilt with shell change | ✅ done | 26.19 MiB at 12:46; X: unmounted after |

## M. Event retention + accepted advisories + honesty sweep (2026-11-17)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| M1 | `events` table grew unboundedly; added retention: `STUDYSTREAM_EVENT_RETENTION_DAYS` (default 30, 0 disables) applied once at backend startup; `activity_history` untouched (SET NULL FK keeps the human-readable record); retention failure logs and does NOT abort startup | ✅ done + tests | app/retention.py, run_backend.py startup hook; test_retention.py: old pruned / recent kept / history survives with SET NULL; 37 -> 39 passed |
| M2 | Fresh code shipped: sidecar + installer rebuilt with retention | ✅ done | 26.20 MiB at 12:57; X: unmounted after |
| M3 | overlay/ + frontend/ advisories (esbuild <=0.24.2 dev-server-only): assessed, documented as accepted exception; `npm audit fix --force` (vite 8 rolldown/OXC) deferred to a dedicated migration; not a production-surface issue | ✅ documented | BUILD_CHECKLIST section E + PROGRESS_LOG |
| M4 | Settings Storage row now states the real retention knob instead of "(Phase 6)" | ✅ done | rendered text verified; js hash index-B7sIv9ow.js |

## N. OpenAPI response contract + generated FE types (2026-11-17)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| N1 | Backend response bodies were untyped in the spec (`additionalProperties`); endpoints now declare `response_model` | ✅ done | app/api/schemas.py (HealthResponse, StudyState, HistoryEntry, ActivityEvent, IntegrationInfo, SceneList/SceneInfo, ObsOverlayUrl, LayoutResponse/Placement); 39 tests still pass (FastAPI runtime-validates declared responses) |
| N2 | Frontend hand-maintained response interfaces replaced by aliases of the generated schema | ✅ done | frontend/src/services/api-schema.ts generated via `npm run gen:api` (openapi-typescript 7.13.0); api.ts exports the same names (StudyState narrowed on `state`; IntegrationInfo/LayoutPlacement/HistoryEntry/RecentEvent required-key-pinned); 1 strict-null fix (Overview received_at) |
| N3 | gen:api script added | ✅ done | package.json `gen:api`; spec is public (not behind /api/v1) so no token in the script |
| N4 | Sidecar + installer rebuilt with validated responses | ✅ done | 26.20 MiB at 13:11; X: unmounted after |

## O. Widget registry as the single source of truth (2026-11-17)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| O1 | GET /api/v1/widgets/registry serves the canonical catalog (ids, names, categories, descriptions, icons, default variant) | ✅ done | app/widget_types.py WIDGET_REGISTRY; app/api/widgets.py; test_widgets_registry; 40 passed; 401 fail-closed |
| O2 | Widgets page + Overlay Studio consume the endpoint - the two hand-maintained registries are deleted; unknown backend icon names fall back via utils/icons.ts | ✅ done | both pages verified live: studio library renders backend-supplied cards; session_history placed via registry persisted (user's layout restored after) |
| O3 | Icon repair effect in Studio: placements loaded before registry arrival get icons fixed in place (ids/variants untouched) | ✅ done | visible in code path |
| O4 | Sidecar + installer rebuilt with the registry (packaging gotcha fixed: PyInstaller cleanup hung ~10 min on OneDrive reparse locks leaving dist/build empty; recovered with pyinstaller --workpath on local temp) | ✅ done | installer 26.20 MiB at 14:10; AGENT_CONTEXT carries the recovery recipe |
| O5 | Registry endpoint present in the PACKAGED sidecar | ✅ verified | fresh-scratch-DB smoke: health ok; /api/v1/widgets/registry -> 8 widgets; wrong token 401 |

## P. OS credential vault for OAuth tokens (Phase 5 foundation, 2026-11-17)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| P1 | `app/security/vault.py`: set/get/delete/probe for provider tokens via `keyring` (Windows Credential Manager; win32ctypes backend); fail-loud CredentialVaultError (never silent clear); provider name validation | ✅ done + tests | test_vault.py round trip, overwrite, validation, probe - 5 tests |
| P2 | `POST /api/v1/integrations/{provider}/disconnect` also purges the vault; response gains `credential_purged` so the UI never claims a secret was erased when it was not | ✅ done + live-verified | live: planted token for kick, disconnect via API, credential_purged: true, token_stored false |
| P3 | Sidecar bundles the vault backend: `keyring>=25.7` in requirements.txt; spec hiddenimports pin win32ctypes for the onefile exe | ✅ done | sidecar REBUILT with vault (log shows keyring.backends.Windows analyzed; installer 26.37 MiB at 18:54). Round trip verified through the dev backend on this machine (identical keyring/win32ctypes stack). NOT yet smoked inside the packaged exe - no code path can reach the vault until the Phase 5 OAuth handlers exist |
| P4 | Connect 501 detail now states the vault is ready and a handshake is what is missing (Phase 5, needs the provider developer app) | ✅ done | integrations.py |
| P5 | Test count 40 -> 45 (5 vault tests, including real Windows Credential Manager round trips with cleanup) | ✅ pass | suite green |

## Q. Vite 5 -> 7 migration (2026-11-17)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| Q1 | vite 5.4.21 -> 7.3.8 in frontend/ AND overlay/ (peers: @vitejs/plugin-react ^4.3.4 accepts ^7) | ✅ done | both builds green (tsc + vite) |
| Q2 | npm audit: zero vulnerabilities in both apps (advisory GHSA-67mh-4wv8-2f99 gone) | ✅ done | `npm audit` output in both dirs |
| Q3 | overlay bundle rebuilt + served live (index-CfM3a5Ma.js); widgets render from the fresh bundle | ✅ verified live | agent-browser snapshot: NO ACTIVE SESSION / DAILY GOAL / SESSION HISTORY present; served HTML references the new hash |
| Q4 | sidecar + installer rebuilt with the fresh bundle | ✅ done | 26.37 MiB at 19:13; X: unmounted after |

## R. White edge line fix (2026-11-17)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| R1 | White sliver around the window: html/body never got a dark background (only .ss-ambient painted dark; the browser's default page background leaked at the outermost 1-2 px) | ✅ fixed | app.css: html, body, #root now paint var(--ss-color-surface-background); verified via vite preview + agent-browser screenshot (no edge sliver at viewport edges) |
| R2 | Installer rebuilt with the fix | ✅ done | 26.37 MiB; OBS refresh not needed (this change does not touch the overlay bundle) |
| R3 | Remaining edge line, if any, is the Windows DWM rounded-corner frame, not app content; cosmetic and external to the app | noted | only removable by frameless mode (tauri decorations=false) or Windows accent-border setting |

## S. StreamElements connect handshake - real, vault-backed (Phase 5 slice, 2026-11-17)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| S1 | `app/integrations/streamelements.py`: local JWT decode (claims UNTRUSTED - used only to learn the room id), claim validation (iss/exp/channel/role), `verify_token` = real `wss://astro.streamelements.com` gateway subscribe round trip whose ack is the ONLY trusted proof | ? done | module + tests |
| S2 | `POST /{provider}/connect` is async + real for streamelements: validate claims -> gateway handshake -> vault store -> row connected; response carries `verified`/`gateway`/`credential_store`. Garbage -> friendly 400; every OTHER provider stays an honest 501 | ? done | supersedes B8/P4 wording for SE only; A12's 501 design note stays true for the rest |
| S3 | Dashboard: SE card gains a password field + "Connect with JWT"; token cleared from the page after use; backend error text surfaced verbatim | ? done | Integrations.tsx + api.ts; `npm run build` green (tsc strict) |
| S4 | `api-schema.ts` regenerated from the CURRENT backend - the first `gen:api` in this slice silently used a still-running OLD server; backend was restarted and the spec regenerated | ? done | generated types now include ConnectRequest + IntegrationConnectResponse |
| S5 | Suite 45 -> 52 passed (7 new in test_se_connect.py; the 5 vault tests from section P included) | ? pass | `pytest -q` |
| S6 | LIVE proof with the real dashboard JWT: connect -> verified:true, account "SE channel 67adcbd8c9f465394f8c7f47 (linked twitch)"; garbage -> 400 "that is not a JWT"; disconnect -> credential_purged:true; vault confirmed empty after | ? verified live | curl run transcript in PROGRESS_LOG; the pasted token was then purged from this machine |
| S7 | Deps bundled: `websockets>=14` in requirements.txt; spec hiddenimports pin websockets + keyring backends | ? done | Analysis-00.toc: 138 websockets entries, 59 keyring entries, app.integrations.streamelements present |
| S8 | Sidecar + installer rebuilt and smoked: packaged exe on a scratch DB - health 200 (migrations applied), long garbage token -> 400, wrong auth -> 401 fail-closed, registry serves 8 widgets; tree-killed, port free, scratch DB removed | ? done | sidecar 24.3 MB; installer Study Stream 2.0_0.1.0_x64-setup.exe 26.38 MiB |
| S9 | Browser UI pass of the Connect button | ⬜ NOT claimed | agent-browser CLI is wedged on this machine (AGENT_CONTEXT); evidence is API + build only - owner should click Connect once in the app |
