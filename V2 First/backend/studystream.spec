# PyInstaller spec for the Study Stream 2.0 backend sidecar.
#
# Build with: backend\build_backend.ps1 (calls .venv\Scripts\pyinstaller.exe
# directly — no venv activation needed).
#
# Console app (NOT windowed): the Tauri shell captures this process's
# stdout/stderr for backend logs, so the bootloader must keep the console
# stream alive. windowed=True would break log capture.

a = Analysis(
    ["run_backend.py"],
    pathex=["."],
    binaries=[],
    datas=[
        # Overlay renderer bundle. Required for OBS Browser Sources to load
        # the overlay HTML/JS/CSS from http://127.0.0.1:<port>/overlay/<scene>.
        # Without this datas entry, the "overlay-dist/" folder is absent from the
        # packaged exe and /overlay/{scene} returns 503 at runtime.
        ("overlay-dist", "overlay-dist"),
        # Schema + seed migrations, applied at startup by app/migrate.py
        # (run_backend.py -> alembic upgrade head). Without this the
        # packaged first run starts against an empty database and every
        # endpoint fails.
        ("migrations", "migrations"),
    ],
    hiddenimports=[
        # run_backend.py starts uvicorn with the import string
        # "app.main:app", which static analysis cannot see. Pull the whole
        # app package in explicitly; app.main's own imports (api.health,
        # security.auth, config) are then analysed from it.
        "app.main",
        "app.api.health",
        "app.security.auth",
        "app.database",
        "app.models",
        # uvicorn resolves its event loop / protocol / lifespan modules at
        # runtime through importlib with string names ("auto" selectors),
        # so pin the concrete implementations as hidden imports.
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.http.httptools_impl",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.protocols.websockets.websockets_impl",
        "uvicorn.protocols.websockets.wsproto_impl",
        "uvicorn.lifespan.on",
        "uvicorn.lifespan.off",
        # app/migrate.py runs alembic programmatically at startup; pull in
        # the modules the upgrade path touches so static analysis covers
        # them even if PyInstaller's importer misses a dynamic import.
        "alembic",
        "alembic.config",
        "alembic.command",
        "alembic.script",
        "alembic.script.revision",
        "alembic.runtime.migration",
        "alembic.runtime.environment",
        "alembic.operations.ops",
        "alembic.operations.toimpl",
        # OAuth tokens live in the OS credential vault (app/security/vault.py)
        # via keyring's win32ctypes backend; keyring discovers backends at
        # runtime through atypical imports, so pin them for the bundle.
        "keyring",
        "keyring.backends.Windows",
        "keyring.backends.fail",
        "win32ctypes.pywin32.win32cred",
        "win32ctypes.pywin32.pywintypes",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="studystream-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
