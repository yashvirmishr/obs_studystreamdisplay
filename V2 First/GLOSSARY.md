# GLOSSARY.md — Study Stream 2.0 domain language

Use these terms as-is in code, reviews, docs, and reports. Don't introduce
synonyms for them.

| Term | Meaning |
|------|---------|
| **Scene** | A named canvas (1920×1080) bound to an OBS Browser Source. Currently: `Study`, `Please Wait` |
| **Widget** | An independent, configurable unit of UI rendered on a scene (Study Timer, Unified Chat, …). Widgets never touch each other; the layout engine places them |
| **Widget registry** | The catalogue of widget *types* with their defaults + config schemas (`frontend/src/pages/Widgets.tsx`, DB table `widgets`) |
| **Layout / placement** | The per-scene set of placed widget instances: id, (x,y,w,h) normalised, z, visible, locked, opacity, variant. Persisted in SQLite `widgets` |
| **Overlay** | The standalone OBS renderer app (`overlay/`). No Tauri dependencies; speaks the same WS/HTTP contracts as the dashboard |
| **Envelope** | The normalised event shape every integration adapter produces (`shared/event-schemas/`, v1) |
| **Event engine** | Backend component that normalises, dedups, orders, and routes envelopes (Phase 6 — not yet wired) |
| **Provider adapter** | Per-platform integration code (Twitch EventSub WS, Kick via StreamElements, YouTube extension) |
| **Launch token** | Per-process, 256-bit, in-memory-only credential issued by the Tauri shell; required for every `/api/v1/*` call and every WS connection |
| **Fail closed** | Absence of a valid token ⇒ request rejected. Never "allow on error" |
| **Study session** | `idle → running ↔ paused → completed`, backend-authoritative, persisted (`study_sessions`) |
| **Simulated event** | `is_simulated=true`. Marked in every UI; never mixed silently into real history |
| **Deepened module** | (architecture vocabulary) A module whose interface becomes smaller as its capability (leverage) grows |
| **Seam** | Where two modules meet and can be replaced independently |
| **Locality** | Changes to one module mostly stay in that module |
