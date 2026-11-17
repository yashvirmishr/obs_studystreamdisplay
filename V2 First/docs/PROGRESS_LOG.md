# Study Stream 2.0 — progress log (append-only, newest at bottom)

<!-- NOTE 2026-11-14 coordinator: a creation race briefly overwrote this file
(design agent + coordinator both created it). History below is restored from
session records. From now on: read the file, append at the bottom, never
rewrite or delete existing lines. -->

## 2026-11-14 — coordinator session (scaffold)

- Created `V2 First/` scaffold (backend, frontend, desktop, docs). Verified on Windows:
  pytest 2/2 passed, alembic 0001_initial applied, frontend tsc+vite build exit 0,
  live backend boot on 127.0.0.1:47831 with HTTP health 200. Evidence in
  docs/PHASE1_ACCEPTANCE.md.
- Wrote CODING_STANDARDS.md and AGENT_CONTEXT.md (environment pointers for agents).
- Launched agent A (Tauri backend lifecycle + per-launch auth), agent B (PyInstaller
  packaging), agent C (design system foundation), agent D (integration research).
- Launched agent E (database schema expansion) and agent F (OBS overlay skeleton).
- Coordinator wrote: PROGRESS_LOG.md, docs/ARCHITECTURE.md, shared/event-schemas/
  (event envelope JSON Schema v1 + TS types).

## 2026-11-14 — agent D (integration research) completed

- docs/RESEARCH_INTEGRATIONS.md written (~250 lines, official docs, dated).
- Critical finding: Kick official events API is webhook-only (public HTTPS
  callback mandatory) → direct Kick integration incompatible with the
  local-only architecture. StreamElements Astro `channel.chat` topic
  (launched 2026-11-03) locked as first-choice unified chat provider.
- Conclusions recorded in AGENT_CONTEXT.md § Integration direction (LOCKED).

## 2026-11-14 — agent C (design system foundation) completed

- frontend/src/design/ built as isolated module: tokens.ts (strongly-typed
  source of truth) + tokens.css (--ss-* custom properties) + primitives
  (Button 5 variants, Card 3 tones, StatusPill, SectionHeader, barrel export)
  + DesignPreview.tsx acceptance page + README.md.
- Palette: deep green #3d8a66 + muted sage #9dc0af primary; teal/blue/lavender
  accents; distinct status colors.
- Verified in frontend/: `npx tsc --noEmit` exit 0 (strict), `npm run build`
  exit 0. Deliberately NOT imported by App.tsx (agent A owns it).
- Coordination fix by coordinator: creation race on this log file resolved;
  full history restored.

## 2026-11-14 — agent F (OBS overlay skeleton) completed

- overlay/ created as an independent Vite + React + TS app (port 5174,
  host 127.0.0.1 explicit): transparent body, scene-id resolution (path or
  ?scene=, default "study"), useOverlaySocket hook with StrictMode-safe
  socket lifecycle, exponential backoff reconnect (500ms→10s cap + jitter),
  corner-only ConnectionBanner.
- Verified: npm install OK; `npm run build` exit 0 (33 modules); dev smoke
  test HTTP 200 with transparent body confirmed; all spawned processes
  killed, port 5174 verified free.
- Environment fact captured for all agents: Vite default localhost binding
  is IPv6-only (::1) — dev servers must bind 127.0.0.1 explicitly.
- Assumption pending reconciliation: overlay sends WS auth as `token` query
  param; backend /ws/overlay implementation must match.

## 2026-11-14 — agent B (PyInstaller packaging) completed

- backend/studystream.spec (one-file, console, hidden imports for app.* +
  uvicorn runtime modules), build_backend.ps1, desktop/scripts/
  build-backend-sidecar.ps1 (produces target-triple name
  studystream-backend-x86_64-pc-windows-msvc.exe), packaging/README.md.
- Verified: PyInstaller 6.22.3 on Python 3.14.3 — no 3.14 incompatibility;
  two clean builds (80.5s / 72.3s) → 21.5 MB one-file exe.
- Smoke-tested exe twice: health 200 with x-auth-token header (2.9s / 2.2s
  to ready incl. one-file unpack); unauthenticated request → 401 fail-closed;
  process tree killed via taskkill /T /F; port confirmed free; no orphans.
- KEY FACT: one-file bootloader spawns a child process — the Tauri shell
  must kill the process TREE, not the PID.
- exe is NOT final: must be rebuilt after agent A's remaining work lands.
- tauri.conf.json externalBin wiring deferred to coordinator (agent A scope).

## 2026-11-14 — packaged verification (tauri build) — coordinator

- Fixed two build-blocking defects found by actually running `tauri build`:
  frontendDist path (`../frontend/dist` → `../../frontend/dist`) and the
  default gnu host triple (rebuilt with `--target x86_64-pc-windows-msvc`).
- MSVC ring.c C1083 failure diagnosed as MAX_PATH vs the very long workspace
  path; built via session-scoped `subst X:` (removed after).
- RESULT: release build OK; NSIS installer `Study Stream 2.0_0.1.0_x64-setup.exe`
  23.64 MiB produced by makensis (hash-validated).
- Packaged app launched from target\x86_64-pc-windows-msvc\release\studystream2.exe;
  log shows `mode: sidecar` backend launch on 47831; authenticated health 200
  from the packaged webview; WM_CLOSE killed the tree; port closed; zero orphans.
- Installer NOT executed (user's call); clean-machine test remains.
- Phase 1 now verified in both dev and packaged modes (minus installer execution).

## 2026-11-14 — zero-mock pass + deep verification — coordinator

- Removed ALL sample/mock data: src/data/sample.ts deleted; every page now
  renders live backend data or honest empty states (chat, now-playing, stats,
  goal ring, event feed all live or empty).
- New backend: study lifecycle API (/start|pause|resume|stop|state|history),
  test-event endpoint (is_simulated=true), allowlist settings API, layout
  persistence API (atomic replace + clamping), integration registry (connect
  returns honest 501; disconnect works). Migration 0003 seeds scenes +
  disconnected providers. 22/22 pytest green (fresh tests incl. lifecycle,
  409 conflicts, clamping, 422/404 paths).
- Frontend rewired: Overview live (start/pause/resume/stop, goal ring =
  today vs study_goal_hours, real history stats/streak), OverlayStudio with
  debounced SQLite save + status, connect→501 honest, test-event console
  posts real rows.
- DEEP TEST (chrome-devtools, against a live backend + DB): full lifecycle
  start→pause→resume→stop exercised through real UI; nav, filters, switches,
  lock/visibility/opacity, duplicate, scene isolation, keyboard nudge — all
  verified persisting to SQLite. Timezone-naive fixes (GMT-8h bug) fixed.
  All test processes killed; ports free.
- CHECKLIST: docs/BUILD_CHECKLIST.md = the authoritative ledger (D-section
  lists known gaps incl. mouse-drag untested, installer not executed).

## 2026-11-14 — architecture candidates 1-5 — coordinator

1 (two probing loops, App polls study/history/everything separately):
   → Single typed API client (services/api.ts) + useBackendProbe rewritten on
     it. DEFAULT_PORT exported. api.health.check, api.study/…/settings/…
     services/backend.ts DELETED.
2 (API client is a façade with no depth):
   → 200 calls from pages now flow through one typed gateway. HttpError with
     isAuth/isConflict/isNotImplemented. Full App shell verified working.
5 (config/env scattered):
   → docs/CONFIG.md = single launch contract covering every env var,
     browser vs Tauri token discovery, spawn instructions, and the
     local-only invariant.
3 (placement contract, 4 parallel definitions):
   → isNormalisedPlacement() shared guard in api.ts; OverlayStudio refuses
     to render corrupt layouts and silently drops unpersistable snapshots.
     Backend edge-roundtrip test proves REAL/int/bool fidelity through PUT.
4 (event bus on paper):
   → app/events/bus.py implemented: in-process pub/sub with bounded queues,
     wildcard * channel, drop-newest eviction. /ws/overlay/{scene_name} WS
     endpoint resolves scene against SQLite and authenticates via token.
     Study transitions + test events publish envelopes. overlay/ renderer
     wired to actually receive + display. Verified end-to-end over WS.
     KNOWN GAP (case-insensitive scene match fixed via func.lower).
     Control socket now subscribes to * too.

Test suite: 28 passed (was 22). No mock data anywhere. All test processes
killed. Ports free after testing.

## 2026-11-14 — frontend-design skill pass: M3 Expressive dashboard — coordinator

- Applied frontend-design skill with M3 Expressive direction (researched
  expressive principles from m3.material.io / design.google research; Google
  Sans Flex/Text + JetBrains Mono via fonts.googleapis.com with system
  fallbacks).
- Extended design tokens (tokens.ts + tokens.css): tonal surface container
  roles (lowest→highest), expressive shape scale (28/40 px), spring/reveal
  motion easings, ambient glow, focus ring, hover state layers.
- New hand-rolled 24px icon set (design/icons.tsx), 36 enum-checked icons.
- Full six-section application shell built: AppShell (top bar with brand
  lockup + search + preview badge, M3 NavigationRail), pages/Overview,
  OverlayStudio, Widgets, Integrations, ActivityCentre, SettingsPage,
  app/routes.ts, hooks/useBackendProbe.ts; sample data in data/sample.ts
  (all clearly demo-chipped); snackbar primitive; deleted legacy styles/theme.css.
- OverlayStudio is interactive: place/drag/resize widgets, snap grid, dot
  grid toggle, crosshair guides, selection chrome, arrow-key nudge, Delete to
  remove, duplicate, layers panel (opacity/visible/locked/z-order), scene
  presets (Study / Please Wait).
- Verified: tsc strict + vite build exit 0; visual QA via chrome-devtools
  screenshots of Overview and Overlay Studio (both coherent, M3-expressive,
  professional). NOTE: frontend dist rebuilt — rebuild sidecar not required
  (frontend changes only).
- Backend wiring note: useBackendProbe polls Tauri lifecycle/health — the
  Connection health card shows live probe state when run inside the app.

## 2026-11-14 — agent A (Tauri lifecycle + auth) completed by coordinator finish

- Agent A implemented everything (Rust lifecycle, per-launch token, auth
  middleware, 8 auth tests) then died at the usage limit with 2 compile errors
  and the frontend unwired. Coordinator: fixed BufWriter import, logged
  backend log path, built sidecar pipeline, renamed packaged sidecar path to
  studystream-backend.exe, wired externalBin in tauri.conf.json, rewrote
  frontend services/backend.ts (Tauri IPC discovery + ?token= override for
  browser dev), rewrote App.tsx (lifecycle-aware status UI using design
  primitives), mounted tokens.css + primitives.css in main.tsx.
- VERIFIED END-TO-END (dev mode): `tauri dev` launched the window; backend
  auto-launched via venv python (parent 4804 → child 27904); LISTEN 47831;
  readiness poll 200 OK; dashboard authenticated 200 OK; WM_CLOSE on the
  window triggered RunEvent::ExitRequested → taskkill /T /F killed both
  python processes; 0 orphans; port 5173 also stopped afterwards.
- cargo build: exit 0, 0 warnings. frontend build: exit 0.
- Packaged dev→prod path (exe_dir/studystream-backend.exe) wired; NSIS
  installer not yet built (documented next step).

## 2026-11-14 — agent E (database schema expansion) completed

- models.py: 9 additive models (Scene, Widget, Integration, Event, EventRule,
  Subject, Task, StudySession, ActivityHistory) + events envelope constants;
  AppSetting untouched. Migration 0002_core_tables applied and down-tested on
  a throwaway DB copy; real studystream.db upgraded to head.
- Verified: tests/test_db.py 5 passed (FK round-trips, DB-level cascade,
  SET NULL, unique constraints, geometry CHECK); full suite 15 passed.
- DB-level enforcement of ARCHITECTURE invariant 5: widget geometry CHECK
  constraints (0..1 normalised) in both model and migration.
- DEFECT FIXED by coordinator: database.py _configure_sqlite signature took
  one arg but SQLAlchemy "connect" event passes two — would TypeError on the
  first real connection. Signature corrected to (dbapi_connection,
  connection_record); test wrapper updated to pass both. Full suite re-run:
  15 passed, exit 0.

## 2026-11-14 - agent F (OBS overlay skeleton) completed

- Created `overlay/` standalone Vite+React+TS renderer skeleton
  (studystream2-overlay, port 5174 strictPort, loopback 127.0.0.1 bind,
  react 18, zero Tauri imports).
- `src/connection/useOverlaySocket.ts`: ws://127.0.0.1:47831/ws/overlay/{scene_id}
  (scene from URL path or ?scene=, default "study"), auto-reconnect with
  exponential backoff (500ms base, 10s cap, jitter), StrictMode-safe,
  token forwarded as ?token= query param (param name pending backend auth
  confirmation - documented in code).
- Verified: `npm install` OK (68 pkgs, 2 npm-audit advisories in transitive
  deps); `npm run build` (tsc strict + vite) exit 0; dev server smoke test on
  http://127.0.0.1:5174/overlay/study?token=x -> HTTP 200 with transparent
  body; all spawned processes killed, port 5174 free after test.
- NOT done: scene resolution, widget rendering, WS message protocol, auth
  endpoint confirmation. See overlay/README.md.

## 2026-11-14 - agent B (PyInstaller packaging) in progress

- PyInstaller 6.22.3 installed into backend/.venv; wrote backend/studystream.spec
  (one-file, console), backend/build_backend.ps1, backend/requirements-dev.txt,
  desktop/scripts/build-backend-sidecar.ps1, backend/packaging/README.md.
- Two clean builds verified on Python 3.14.3 (no PyInstaller 3.14 incompat):
  80.5 s / 72.3 s, dist\studystream-backend.exe 21.5 MB + triple-named sidecar copy.
- Smoke tests on alternate port 47999 with random STUDYSTREAM_AUTH_TOKEN:
  /api/v1/health HTTP 200 in 2.9 s / 2.2 s from launch; unauthenticated request
  rejected 401 (fail closed); no orphan processes after taskkill /T /F.
- Sidecar exe must be REBUILT after agent A's auth changes land - current exe
  is not final. tauri.conf.json untouched (agent A scope); externalBin naming
  documented in backend/packaging/README.md. Evidence in
  docs/PHASE1_ACCEPTANCE.md under "Packaging (in progress)".

## 2026-11-14 - database-schema agent

- Phase 4/6 groundwork tables implemented (scenes, widgets, integrations,
  events, event_rules, subjects, tasks, study_sessions, activity_history):
  additive `0002_core_tables` migration applied to studystream.db, 5 new
  schema tests, full backend suite 15/15 green. Evidence in
  docs/PHASE1_ACCEPTANCE.md ("Database expansion" section).
- Reported (not fixed, out of scope): `_configure_sqlite` in
  backend/app/database.py has a wrong-arity connect-event listener that
  will raise TypeError on the first real connection.

## 2026-11-15 - Phase 4: overlay renders real widgets (agent C)

- Widget-type registry: backend/app/widget_types.py (8 canonical ids;
  canonical_widget_type() normalises legacy label-slugs on PUT). Frontend
  studio no longer slugifies labels (candidate 4 fix).
- WS bootstrap contract: /ws/overlay/{scene} now sends overlay.hello (full
  study state, goal, recent events/sessions) + overlay.layout on accept
  (app/overlay_snapshot.py). Layout saves broadcast overlay.layout_updated so
  OBS re-renders without reload; cross-scene updates filtered client-side.
- study.* envelopes carry the FULL state payload; resume is now
  study.session.resumed (candidate 6 fix); stop re-publishes overlay.hello so
  history/goal widgets refresh live.
- Overlay renderer: 1920x1080 stage scaled to viewport; 8 widget components
  (StudyTimer, Clock, SubjectTask, GoalRing, SessionHistory, UnifiedChat,
  NowPlaying, LiveActivity); ticker only when no alert widget placed. Chat and
  media render honest empty states (Phases 5/7 pending) - zero mock data.
- Verified live (agent-browser + API): 8 widgets placed via PUT appeared
  without reload in ~2s; timer ticked 00:00:04->00:00:13 during a real session;
  pause froze amber at 00:00:24; stop refreshed Session History ("Physics  3s
  - just now") and goal ring (27s of 2h) live; test cheer rendered with SIM
  badge. Screenshots: %TEMP%\opencode\overlay-*.png.
- Tests: 28 -> 32 passed (hello snapshot content, layout+broadcast,
  stop->hello refresh, resume!=start).
- Backend rebuilt/restarted on 47831 mid-session; sidecar exe rebuild
  re-queued (backend Python changed). OBS Browser Sources need one manual
  refresh to fetch the new overlay bundle (asset hashes changed).

- Sidecar rebuilt 2026-11-15 (~22.65 MB, includes overlay-dist). Copy into
  desktop/src-tauri/binaries/ initially failed: OneDrive reparse-point lock
  ("Access denied", no owning process). Worked around by renaming binaries/
  aside and recreating it; stale copy left in binaries-stale-DELETE-ME/
  for manual deletion. Smoke tests on the new exe: health 200 with token,
  401 fail-closed, /overlay/{scene} 200 + asset 200 from the packaged exe,
  clean process kill. Recorded in AGENT_CONTEXT (env gotcha).
- Please Wait scene seeded with its 3 default widgets (media/chat/clock) via
  the layout API; overlay verified live for that scene as well.

## 2026-11-15 - review candidates 3/5/7 fixed (agent C, round 2)

- C7: overlay WS now goes TERMINAL on close 4401 (auth-error banner, no
  retry) and 1008 (unknown scene). Root cause found while verifying: the
  backend closed unaccepted WS upgrades, so uvicorn answered HTTP 403 and
  browsers saw close code 1006 - bad token was indistinguishable from
  backend-down and retried forever (visible as endless 403s in backend log).
  Fixed in main.py: accept-then-close. Verified live: wrong token shows
  "overlay token rejected" banner unchanged at t=18s; valid token still
  renders all widgets.
- C5: removed dead probe code in useBackendProbe (attempts>400 check ran
  after all side effects and stopped nothing).
- C3: created frontend/src/utils/eventText.ts; Overview + ActivityCentre now
  share formatEventTitle/formatEventSource (gift counts were shown in one
  page and dropped in the other).
- Backend process hygiene note: a stale backend instance kept 47831 through
  one kill attempt (Get-NetTCPConnection -State Listen returned nothing
  mid-restart, so the kill was skipped) - the browser then verified stale
  code. Always confirm "port free" after killing; kill by netstat PID list.
- Overlay + frontend rebuilt; overlay-dist refreshed (new hashes
  index-DhHVa-Gu.js / index-DugE1euS.css).

## 2026-11-15 - Phase 4 polish verifications + sidecar hardening (agent C)

- Cross-scene layout filter verified live: PUT to "Please Wait" while the
  Study overlay page was open changed nothing; PUT to Study with
  w-alert visible=false made the Live Activity widget vanish without reload;
  restoring visible=true brought it back.
- Layout/state durability across 4+ backend restarts confirmed via API
  (8 Study placements, 3 Please Wait placements, 2 history rows, events).
- Sidecar rebuilt again (WS accept-then-close fix included). Copy step keeps
  hitting the OneDrive reparse lock; build-backend-sidecar.ps1 now retries
  4x then falls back to a directory swap (stale dir renamed *-DELETE-ME).
  New exe smoke-ready at binaries/studystream-backend-x86_64-pc-windows-msvc.exe.
- Locked dirs awaiting manual deletion when OneDrive releases them:
  desktop/src-tauri/binaries-stale-DELETE-ME/, binaries-prev-DELETE-ME/.

## 2026-11-17 - C8 close + enabled_widgets unified + fresh-install production fix (session continuation)

- C8 closed: today_total_seconds now filters created_at >= today at the SQL
  level (migration 0004_study_session_index + model __table_args__ mirror;
  index range scan instead of full-table load per 2 s poll). Verified against
  the real dev DB: alembic current = 0004_study_session_index. New regression
  test proves a yesterday-created completed session does not inflate today.
- enabled_widgets unification (the Widgets page used to do nothing to the
  overlay, and toggled a drifted id `daily_goal` vs registry `goal_ring`):
  - page ids mirror widget_types.py; absent/null setting means "all enabled";
    explicit list restricts; toggling back to everything clears the preference
    (settings PUT now accepts null = delete row).
  - overlay.hello carries enabled_widgets; new overlay.widgets_updated bus
    envelope broadcast by settings PUT -> live overlays re-filter WITHOUT a
    page reload or OBS refresh. Verified live (agent-browser): PUT
    ["clock","study_timer"] -> only those two widgets rendered; PUT null ->
    all 8 restored.
- New tests: settings null-clear, today-totals predicate, hello
  enabled_widgets contract, widgets_updated broadcast. Suite: 32 -> 36 passed.
- PRODUCTION DEFECT FOUND + FIXED during sidecar smoke: the packaged exe
  against a fresh empty DB logged "no such table: app_settings" and every
  endpoint failed (overlay tokens never generated; health still 200). Fixes:
  app/migrate.py runs alembic upgrade head before uvicorn in run_backend.py
  (fatal on failure -> shell Error state with log path); migrations/ shipped
  in the PyInstaller bundle (datas + alembic hiddenimports); the desktop
  shell now passes STUDYSTREAM_DATABASE_URL pointing at the per-user
  app-data dir (dev unchanged). Fresh-install smoke against an empty scratch
  DB: migrations 0001->0004 applied, scenes seeded, study/state + scenes
  layout 200 (honest nulls), health 200 / wrong token 401, boot log clean.
- Installer rebuilt with everything: Study Stream 2.0_0.1.0_x64-setup.exe
  26.19 MiB, bundles the 24.1 MB sidecar
  (overlay index-iYyoVvnm.js + migrations). MSVC via subst X:; X: unmounted
  afterwards. OBS Browser Sources need one manual refresh (asset hashes
  changed again).
- OpenCode server restarted mid-session (shell interruptions); dev backend
  was killed and restarted cleanly each time with verified "port free"
  checks. Current dev backend on 47831 runs the migration-at-startup code.


## 2026-11-17 - OBS scene picker for the overlay URL card (follow-up slice)

- New endpoint GET /api/v1/scenes (list persisted scenes from SQLite; honest,
  no invented rows). scenes.list() added to the frontend api client.
- Overview OBS overlay URL card now renders scene-chip tabs (reusing
  .scene-chip); selection drives the overlay-url fetch. Visible only when
  more than one scene exists; falls back gracefully if the list call fails.
  Health section's OBS overlay line follows the selection; the two
  hard-wired overlayUrl("study") calls are gone.
- Verified live (agent-browser, vite dev on 127.0.0.1:5173 + fresh backend
  on 47831): picker showed Study (selected) and Please Wait; clicking
  Please Wait switched the URL to the Please Wait scene token (1925552...
  faa) with selected state moved. Study stays the default when present,
  falling back to names[0] otherwise. Screenshot: obs-scene-picker.png.
- Backend test added: test_scenes_list_seeded (36 -> 37 passed).
- Frontend build exit 0. Sidecar + NSIS installer rebuilt again so the
  shipped installer includes the endpoint (26.19 MiB). Overlay bundle hash
  unchanged in this slice, so OBS sources do not need a refresh for it.
- Git: V2 First tree initially committed as f12c440 (v2-open-overlay) and
  pushed to origin (6f803d3..f12c440). V1 root restructure, V1.zip and the
  Lo-fi image remain uncommitted on purpose (owner's call).

## 2026-11-17 - Settings persistence + honest static text + packaged DB path (follow-up slice 2)

- theme_accent setting was in the allowlist and the Settings page rendered
  working accent swatches, but the selection never persisted (reset to Sage
  on every reload - exactly the "looks like it works but doesn't" genre).
  Now round-trips through SQLite (load on mount; clicking Sage clears the
  preference via settings PUT null). Verified live (agent-browser): Teal
  selected -> GET settings returns "ss-accent-teal" -> full page reload ->
  Teal still checked. User-visible note: accent classes land on .ss-ambient
  (app root) at mount and on click. Test-write reverted afterwards
  (theme_accent = null).
- Packaged DB path unified on %LOCALAPPDATA%: desktop shell switched from
  Tauri app_data_dir() (%APPDATA%, roaming) to app_local_data_dir() so the
  code matches the Settings page claim and keeps a local-only DB out of
  roaming sync. Docs updated (ARCHITECTURE invariant 7, AGENT_CONTEXT).
- Settings page honesty fixes in Storage and About panes (all stale claims):
  schema 0002 -> 0004_study_session_index; migrations 0001->0004;
  backend sidecar 21.5 -> ~24 MB; "Phase 1 verified, Phase 2 in flight"
  -> "Phases 1-4 verified"; Alembic range 0001-0003 -> 0001-0004.
- Frontend build exit 0; installer rebuilt (26.19 MiB, 12:46:07) via subst
  X: (X: unmounted after). Backend unchanged this slice; dev backend on
  47831 serves the current code (37 tests passed).

## Dev server advisories (accepted exception, 2026-11-17)

- GHSA-67mh-4wv8-2f99 (esbuild <=0.24.2, moderate+high via vite <=6.4.3):
  affects only the vite DEV SERVER binding 127.0.0.1 at dev time. Production
  surface (Tauri webview + OBS Browser Sources) serves static built assets
  and never runs the dev server. The fix (vite 8 / rolldown-OXC) is a
  toolchain migration for BOTH apps and must not ride a feature session;
  queued as a release-blocker decision in Phase 8. No `npm audit fix
  --force` until that migration is planned and verified end to end.

## 2026-11-17 - Event retention + accepted advisories + honesty sweep

- events table had no pruning at all. Added STUDYSTREAM_EVENT_RETENTION_DAYS
  (default 30, 0 disables) applied once at startup (hygiene, non-fatal);
  activity_history never pruned; SET NULL verified by test. New tests:
  test_prune_old_events_keeps_history_and_recent, test_prune_disabled_with_zero.
  Suite 37 -> 39 passed.
- Dev-server advisories (esbuild/vite) assessed + documented as accepted
  (dev-only, 127.0.0.1, never ships); vite 8 migration queued as the real
  fix for release planning. No blind npm audit fix --force.
- Settings Storage row shows the actual retention knob. Sidecar + installer
  rebuilt again (26.20 MiB at 12:57). Dev backend on 47831 restarted with
  retention in place (verified 0 rows pruned at startup - correct for a
  young dev DB) and is serving.

## 2026-11-17 - OpenAPI response contract + generated FE types

- Root cause of every hand-maintained FE<->BE mismatch: the spec omitted
  response schemas (typed additionalProperties). Fixed at the source:
  response_model declared on every endpoint (app/api/schemas.py).
- Frontend interfaces now alias the generated schema; `npm run gen:api`
  regenerates src/services/api-schema.ts against the local backend.
  tsc + vite exit 0; suite 39 passed. Contract drift is now a type error.
- Installer rebuilt (26.20 MiB at 13:11). Dev backend restarted on 47831
  and serves the response models.

## 2026-11-17 - Widget registry endpoint (single source of truth)

- The Studio and the Widgets page each hand-maintained widget-type maps
  (the goal_ring/daily_goal drift class). Now one registry: widget_types.py
  WIDGET_REGISTRY served at GET /api/v1/widgets/registry; both pages fetch
  it; studio places instances with the registry default variant + id;
  unknown backend icons fall back to "widgets" instead of rendering garbage.
- Verified live: studio library + widgets grid render from the endpoint;
  Session History placed from the library persisted via debounced save
  (user's scene layout restored afterwards); registry smoke passed in the
  packaged sidecar too.
- BUILD GOTCHA (added to AGENT_CONTEXT): if build_backend.ps1 hangs about
  10 minutes, it wipes dist/build; recover with pyinstaller using
  --workpath on a LOCAL temp dir, then the wrapper for the copy step.
- Sidecar + installer rebuilt (26.20 MiB, 14:10). Suite 40 passed.

## 2026-11-17 - OS credential vault for OAuth tokens (Phase 5 foundation)

- CODING_STANDARDS rule 3 honored: OAuth tokens never live in SQLite.
  app/security/vault.py is the single path (keyring -> Windows Credential
  Manager). Fail-loud CredentialVaultError; provider name validation;
  probe() canary to test backend health.
- Disconnect now purges the vault too and reports `credential_purged`
  honestly. Verified LIVE on the dev backend: planted token for kick,
  disconnect via API, credential_purged: true, vault empty afterwards.
- keyring added to requirements; spec hiddenimports pin win32ctypes for
  the packaged exe. Connect 501 message updated: storage ready; handshake
  is what Phase 5 still owes (needs provider developer app registrations).
- Suite: 40 -> 45 passed (real Windows Credential Manager round trips).
