# Study Stream 2.0 — Architecture (living document)

Approved baseline. Change requires explicit user approval. Last updated: 2026-11-14.

## System layers

```
┌──────────────────────────────────────────────────────────┐
│ Tauri 2 desktop shell (Windows 11)                       │
│  - launches/supervises backend sidecar                   │
│  - generates per-launch auth token, hands to both sides  │
└──────────────┬─────────────────────────────┬─────────────┘
               │                             │
┌──────────────▼──────────────┐  ┌───────────▼─────────────┐
│ React dashboard (Vite+TS)   │  │ FastAPI backend          │
│  Overview · Overlay Studio  │  │  REST /api/v1/*          │
│  Widgets · Integrations     │  │  WS /ws/control          │
│  Activity Centre · Settings │  │  WS /ws/overlay/{scene}  │
└─────────────────────────────┘  │  event engine            │
                                 │  integration adapters    │
┌───────────────────────────────►│  SQLite (SQLAlchemy 2.0) │
│ OBS Browser Sources            └─────────────────────────┘
│  http://127.0.0.1:<port>/overlay/<scene_id>?token=...    │
│  separate React renderer, zero Tauri API dependencies    │
└──────────────────────────────────────────────────────────┘
```

## Invariants (enforced in review)

1. Backend binds `127.0.0.1` only. No public exposure, ever.
2. Every API/WS request authenticated with per-launch token (issued by the
   Tauri shell at process start; dies with the process).
3. OBS overlay renderer: standalone entry point, no Tauri imports, auto-reconnect.
4. One Browser Source per OBS scene; all widgets render inside it.
5. Widget instances are independent: own config, own z-index, own visibility.
   Layout positions are normalised floats (0..1 of canvas), never raw pixels only.
6. All provider events normalise to the shared event envelope (see
   `shared/event-schemas/`) before hitting widgets. No widget talks to providers.
7. Schema changes via Alembic migrations only — applied automatically at
   backend startup (`run_backend.py` → `app/migrate.py` → `alembic
   upgrade head`, fatal on failure). Packaged installs use the per-user
   `app_local_data_dir()` DB (`%LOCALAPPDATA%/com.yashvir.studystream2/
   studystream.db`); dev keeps `backend/studystream.db`. No manual migration
   step exists.
8. Study timer state is backend-authoritative (persisted transitions; survives
   dashboard refresh, OBS reload, app restart).

## Overlay data contract (Phase 4)

The overlay page holds only its per-scene token, so it can never call the
`/api/v1` HTTP API (that would 401 by design — invariant 2). Everything the
overlay renders arrives over its authenticated WebSocket
(`ws://127.0.0.1:<port>/ws/overlay/{scene}?token=<scene-token>`):

| Envelope | When | Payload |
|---|---|---|
| `overlay.hello` | on accept; re-sent after each study stop | `scene`, `study` (full `state_payload`), `goal.study_goal_hours`, `enabled_widgets` (null = all enabled / explicit registry-id list), `recent_events[]`, `recent_sessions[]` |
| `overlay.layout` | on accept | `scene`, `placements` (or `null` when none saved) |
| `overlay.layout_updated` | Overlay Studio saves | same shape as `overlay.layout`; sockets filter by `payload.scene` |
| `overlay.widgets_updated` | Widgets page saves `enabled_widgets` | `enabled_widgets` (null or explicit list); **not** scene-scoped (global preference) — every overlay re-filters its placements live |
| `study.started/paused/resumed/stopped` | lifecycle transitions | **full state payload** (stopped adds `seconds`) so the timer re-bases from backend truth |

Consequences (do not regress):
- Widget components key off placement `variant`; `widget_type` is the
  canonical registry id (`app/widget_types.py`) for grouping/joins.
- `enabled_widgets` filters placements client-side: absent/null ⇒ every
  placed widget renders; an explicit list removes disabled types from the
  stream surface even while the scene still holds their instances.
  Toggling applies live via `overlay.widgets_updated` (no OBS refresh).
- Empty widgets are honest states, never placeholder content (no mock data).
- Live layouts mean OBS updates instantly on studio save; OBS Browser Sources
  still need one manual refresh after a rebuild of the overlay bundle.

## Phase map

| Phase | Scope | Status |
|---|---|---|
| 1 Foundation | shell, sidecar lifecycle, auth, SQLite | **done (verified)** |
| 2 Design system | tokens, primitives, dashboard shell | **done (verified)** |
| 3 Overlay Studio | canvas, drag/resize, layers, presets | **usable; drag hand-test pending** |
| 4 Widget engine | registry, config schemas, renderer | **overlay rendering verified 2026-11-15** |
| 5 Unified chat | StreamElements-first, locally rendered | research done; OAuth pending |
| 6 Events/alerts | event engine, alert modes, test events | research done; rules UI pending |
| 7 Study/media | timer, subjects, history, Now Playing | timer/history/goal live in overlay; media pending |
| 8 Release | packaging, install, clean-install test | packaging groundwork done; installer run pending |

## Directory map

- `backend/` FastAPI app (`app/api`, `app/events`, `app/integrations`, `app/study`,
  `app/security`, `app/services`), `migrations/`, `tests/`
- `frontend/` dashboard React app; `src/design/` token system + primitives
- `overlay/` standalone OBS renderer React app (separate Vite entry)
- `desktop/` Tauri shell (`src-tauri/`), dev/build scripts
- `shared/` cross-boundary contracts: event schemas, widget type defs, design tokens
- `docs/` acceptance ledger, progress log, research
