# CODING_STANDARDS.md — Study Stream 2.0

Read this before writing any code. Violations are treated as defects.

## Absolute rules

1. **V1 is untouchable.** The `V1/` directory and `V1.zip` in the parent folder
   (`StudyWithMeStreamApp/`) are reference-only. Never read-modify, copy code
   from, or depend on V1. Do not reuse V1 secrets or signing material.
2. **Local-only backend.** The backend binds exclusively to `127.0.0.1`.
   Never bind `0.0.0.0`. Never expose the machine publicly.
3. **No hardcoded secrets.** Per-launch credentials are generated at runtime.
   OAuth tokens (future) go to the OS credential vault, never plaintext SQLite.
4. **No unverified claims.** Distinguish implemented → tested → verified.
   Update `docs/PHASE1_ACCEPTANCE.md` with real command output only.
5. **No workarounds.** No one-off hacks, no disabling type checks, no
   `# type: ignore` / `as any` / `unwrap()` in app code without justification
   in a comment explaining why failure is impossible there.
6. **Schema changes only via Alembic migrations.** Never edit an applied
   migration; add a new one.
7. **Centralised events.** Integrations feed the event engine; widgets never
   talk to providers directly (relevant from Phase 5 onward).
8. **Modularity.** No god files. Backend modules per responsibility
   (api, events, integrations, study, security, services).

## Environment facts (verified on this machine)

- Python: use `py -3` (the `python` alias is the broken Store stub).
  Backend venv exists at `backend/.venv` (Python 3.14.3).
- Node 24 / npm 11 available. Rust `cargo 1.97.1` available.
- Backend dev port: `127.0.0.1:47831`. Frontend dev: `http://localhost:5173`.
- Run backend tests: `cd "V2 First\backend" && .venv\Scripts\python -m pytest -v`
- Frontend build: `cd "V2 First\frontend" && npm run build`

## Verification protocol

Every milestone must record evidence in `docs/PHASE1_ACCEPTANCE.md`:
- Command executed (exact invocation)
- Exit code / output summary
- Whether it ran on Windows natively

Never mark an item complete without running the command yourself.

## Style

- Backend: Python type hints everywhere; dataclasses/pydantic for config.
- Frontend: TypeScript strict mode is on — keep it on.
- Rust: clippy-clean where practical; no `unsafe`.
- Comments explain *why*, not *what*.
