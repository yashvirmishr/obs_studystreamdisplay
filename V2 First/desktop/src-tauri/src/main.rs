// Study Stream 2.0 desktop shell (Tauri 2).
//
// Phase 1 responsibilities implemented here:
//   - Launch the FastAPI backend as a managed child process.
//     Dev: backend/.venv/Scripts/python.exe run_backend.py (backend applies
//     Alembic migrations at startup in both modes).
//     Packaged: a sidecar executable next to the app binary (externalBin
//     "binaries/studystream-backend"); the backend is pointed at the per-user
//     app-data database via STUDYSTREAM_DATABASE_URL so first runs need no
//     manual setup and the install directory stays untouched.
//   - Generate a random 256-bit per-launch token, pass it to the backend via
//     STUDYSTREAM_AUTH_TOKEN (and the chosen port via STUDYSTREAM_PORT), and
//     expose both to the webview through `get_auth_token` / `get_backend_status`.
//   - Poll http://127.0.0.1:<port>/api/v1/health (with the token) until the
//     backend reports ready, or a 30 s timeout / early exit is hit.
//   - Capture backend stdout/stderr into a timestamped log file under the
//     OS log directory for this app.
//   - Kill the backend process tree on ExitRequested/Exit so no python.exe
//     survives the app.
//
// Threading model: std threads only (no tokio). One reader thread per output
// pipe, one readiness poller thread. Shared state is a small mutex-protected
// struct managed by Tauri.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs::{self, File},
    io::{BufRead, BufReader, BufWriter, Write},
    net::TcpListener,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use rand::RngCore;
use serde::Serialize;
use tauri::{Manager, RunEvent};

/// How long the shell waits for the backend to report healthy.
const READINESS_TIMEOUT: Duration = Duration::from_secs(30);
/// Pause between readiness polls and between lines flushed to the log.
const POLL_INTERVAL: Duration = Duration::from_millis(250);
/// Preferred dev port; falls back to an ephemeral port when taken.
const DEFAULT_PORT: u16 = 47831;
/// Health endpoint polled for readiness (requires the launch token).
const HEALTH_PATH: &str = "/api/v1/health";

#[derive(Clone, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
enum ShellState {
    Starting,
    Ready { port: u16 },
    Error { message: String },
}

struct BackendProcess {
    child: Mutex<Option<Child>>,
    state: Mutex<ShellState>,
    token: String,
}

impl BackendProcess {
    fn status(&self) -> ShellState {
        self.state.lock().expect("backend state poisoned").clone()
    }

    fn set_state(&self, state: ShellState) {
        *self.state.lock().expect("backend state poisoned") = state;
    }

    /// Terminate the backend and every process it spawned. `taskkill /T /F`
    /// is required on Windows because a bare `Child::kill` only signals the
    /// direct child, and the venv interpreter may have helper children.
    fn kill_tree(&self) {
        if let Some(mut child) = self.child.lock().expect("backend child poisoned").take() {
            #[cfg(windows)]
            kill_process_tree(child.id());
            // POSIX fallback: std has no process-tree kill; outside Windows
            // uvicorn is a single process, so signaling the child suffices.
            #[cfg(not(windows))]
            let _ = child.kill();
            // Reap so the child does not linger as a zombie on non-Windows.
            let _ = child.wait();
        }
    }
}

#[cfg(windows)]
fn kill_process_tree(pid: u32) {
    use std::os::windows::process::CommandExt;
    // CREATE_NO_WINDOW keeps taskkill from flashing a console on exit in the
    // windowed release build.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .status();
}

struct LaunchSpec {
    program: PathBuf,
    args: Vec<String>,
    working_dir: PathBuf,
    /// Human-readable mode used in error/log messages.
    mode: &'static str,
}

/// Resolve how to launch the backend for the current build.
///
/// Dev (`debug_assertions`): the project's venv interpreter running
/// `run_backend.py`. The path is anchored to the crate directory at compile
/// time so it works from any working directory.
///
/// Packaged: `studystream-backend.exe` next to the app executable. This is
/// the Tauri externalBin name (wired in tauri.conf.json:
/// `binaries/studystream-backend`); until that build exists, the spawn
/// fails and the window shows a clear error instead of a blank screen
/// (documented placeholder, not a silent failure).
fn launch_spec() -> Result<LaunchSpec, String> {
    if cfg!(debug_assertions) {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let backend_dir = manifest
            .join("..")
            .join("..")
            .join("backend")
            .canonicalize()
            .map_err(|e| format!("backend directory not found: {e}"))?;
        let python = backend_dir.join(".venv").join("Scripts").join("python.exe");
        if !python.exists() {
            return Err(format!("backend venv python not found at {}", python.display()));
        }
        return Ok(LaunchSpec {
            program: python,
            args: vec!["run_backend.py".to_string()],
            working_dir: backend_dir,
            mode: "dev",
        });
    }

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .ok_or_else(|| "could not locate the application executable directory".to_string())?;
    Ok(LaunchSpec {
        program: exe_dir.join("studystream-backend.exe"),
        args: Vec::new(),
        working_dir: exe_dir,
        mode: "sidecar",
    })
}

/// Random 256-bit token, hex-encoded. Generated per launch, held only in
/// memory, never written to disk or passed on argv (argv is world-readable
/// via the process list; env vars are scoped to the child).
fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Port for the backend: the fixed dev port when free, otherwise an OS-assigned
/// ephemeral port. The port is handed to the backend via STUDYSTREAM_PORT, so
/// a stale server on 47831 degrades gracefully instead of failing the launch.
fn choose_port() -> u16 {
    if TcpListener::bind(("127.0.0.1", DEFAULT_PORT)).is_ok() {
        DEFAULT_PORT
    } else {
        // Small race between dropping the probe listener and uvicorn binding,
        // accepted because uvicorn reports a bind failure into the error state.
        TcpListener::bind(("127.0.0.1", 0))
            .ok()
            .and_then(|l| l.local_addr().ok())
            .map(|a| a.port())
            .unwrap_or(DEFAULT_PORT)
    }
}

/// Timestamped log file name, e.g. `backend-20261114-093000.log`.
fn log_file_name() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86_400;
    let tod = secs % 86_400;
    let (h, m, s) = (tod / 3600, (tod % 3600) / 60, tod % 60);
    // Civil date from days since epoch (Howard Hinnant's algorithm) — avoids
    // a chrono dependency just for a filename.
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mth = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mth <= 2 { y + 1 } else { y };
    format!("backend-{y:04}{mth:02}{d:02}-{h:02}{m:02}{s:02}.log")
}

/// Resolve the log directory: the OS app-log dir, falling back to the
/// system temp dir if the resolver fails (so logging never blocks startup).
fn log_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_log_dir()
        .ok()
        .unwrap_or_else(std::env::temp_dir)
}

type SharedWriter = Arc<Mutex<BufWriter<File>>>;

fn timestamp_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Local time is unavailable without a timezone crate; UTC is fine for
    // correlation with the uvicorn log lines.
    let (h, m, s) = (
        (secs % 86_400) / 3600,
        (secs % 3600) / 60,
        secs % 60,
    );
    format!("{h:02}:{m:02}:{s:02}")
}

/// Stream one output pipe into the shared log file, tagging each line.
fn pipe_to_log<R: std::io::Read + Send + 'static>(
    stream: R,
    tag: &'static str,
    writer: SharedWriter,
) {
    thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let mut w = writer.lock().expect("log writer poisoned");
            let _ = writeln!(w, "{} [{tag}] {}", timestamp_now(), line);
            let _ = w.flush();
        }
    });
}

fn spawn_backend(
    spec: &LaunchSpec,
    token: &str,
    port: u16,
    database_url: Option<&str>,
) -> Result<Child, String> {
    let mut command = Command::new(&spec.program);
    command
        .args(&spec.args)
        .current_dir(&spec.working_dir)
        .env("STUDYSTREAM_AUTH_TOKEN", token)
        .env("STUDYSTREAM_PORT", port.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Packaged first run: point the backend at the per-user data dir instead
    // of the install directory (which is typically not writable). Dev runs
    // keep the backend's default ./studystream.db.
    if let Some(url) = database_url {
        command.env("STUDYSTREAM_DATABASE_URL", url);
    }
    command.spawn().map_err(|e| {
        format!(
            "failed to launch backend ({}, mode {}): {e}",
            spec.program.display(),
            spec.mode
        )
    })
}

/// Probe the health endpoint with the launch token. A 200 marks readiness.
fn health_check(port: u16, token: &str) -> bool {
    let url = format!("http://127.0.0.1:{port}{HEALTH_PATH}");
    match ureq::get(&url)
        .timeout(Duration::from_secs(2))
        .set("X-Auth-Token", token)
        .call()
    {
        Ok(resp) => resp.status() == 200,
        Err(_) => false,
    }
}

/// Poll until the backend is ready, the child exits, or the deadline passes.
/// Runs on its own thread; updates the shared state accordingly.
fn poll_readiness(backend: Arc<BackendProcess>, port: u16) {
    let deadline = Instant::now() + READINESS_TIMEOUT;
    loop {
        // A backend that dies during startup is an immediate error.
        if let Some(Ok(Some(exit))) = backend
            .child
            .lock()
            .expect("backend child poisoned")
            .as_mut()
            .map(|c| c.try_wait())
        {
            backend.set_state(ShellState::Error {
                message: format!(
                    "backend exited during startup (exit code: {}); see log file for details",
                    exit.code().map(|c| c.to_string()).unwrap_or_else(|| "unknown".into())
                ),
            });
            return;
        }
        if health_check(port, &backend.token) {
            backend.set_state(ShellState::Ready { port });
            return;
        }
        if Instant::now() >= deadline {
            backend.set_state(ShellState::Error {
                message: format!(
                    "backend did not become ready within {}s; see log file for details",
                    READINESS_TIMEOUT.as_secs()
                ),
            });
            return;
        }
        thread::sleep(POLL_INTERVAL);
    }
}

/// Start the backend and wire up its log/poller threads. Failures are
/// reported through the shared state (visible in the window), never by
/// aborting setup, so the window always renders a UI.
fn start_backend(app: &tauri::AppHandle) -> Arc<BackendProcess> {
    let token = generate_token();
    let port = choose_port();

    let backend = match launch_spec().and_then(|spec| {
        let dir = log_dir(app);
        let _ = fs::create_dir_all(&dir);
        let log_path = dir.join(log_file_name());
        let file = File::options()
            .create(true)
            .append(true)
            .open(&log_path)
            .map_err(|e| format!("cannot open backend log {}: {e}", log_path.display()))?;
        Ok((spec, file, log_path))
    }) {
        Ok((spec, file, log_path)) => {
            let database_url = if spec.mode == "sidecar" {
                // Per-user data dir (%APPDATA%/com.yashvir.studystream2):
                // writable, survives reinstalls, never touched by uninstall.
                app.path()
                    .app_data_dir()
                    .ok()
                    .and_then(|dir| {
                        if fs::create_dir_all(&dir).is_err() {
                            eprintln!(
                                "studystream2: could not create data dir {}",
                                dir.display()
                            );
                            return None;
                        }
                        Some(format!(
                            "sqlite:///{}",
                            dir.join("studystream.db")
                                .to_string_lossy()
                                .replace('\\', "/")
                        ))
                    })
            } else {
                None
            };
            let writer: SharedWriter = Arc::new(Mutex::new(BufWriter::new(file)));
            match spawn_backend(&spec, &token, port, database_url.as_deref()) {
                Ok(mut child) => {
                    // Pipes must be taken before the child is shared, since
                    // Child is not Sync and readers need raw ownership.
                    let stdout = child.stdout.take();
                    let stderr = child.stderr.take();
                    if let Some(out) = stdout {
                        pipe_to_log(out, "stdout", writer.clone());
                    }
                    if let Some(err) = stderr {
                        pipe_to_log(err, "stderr", writer.clone());
                    }
                    {
                        let mut w = writer.lock().expect("log writer poisoned");
                        let _ = writeln!(
                            w,
                            "{} [shell] launching backend (mode: {}, port: {port}, pid: {}, log: {})",
                            timestamp_now(),
                            spec.mode,
                            child.id(),
                            log_path.display()
                        );
                        let _ = w.flush();
                    }
                    let backend = Arc::new(BackendProcess {
                        child: Mutex::new(Some(child)),
                        state: Mutex::new(ShellState::Starting),
                        token,
                    });
                    let poller = Arc::clone(&backend);
                    thread::spawn(move || poll_readiness(poller, port));
                    backend
                }
                Err(message) => {
                    eprintln!("studystream2: {message}");
                    Arc::new(BackendProcess {
                        child: Mutex::new(None),
                        state: Mutex::new(ShellState::Error { message }),
                        token,
                    })
                }
            }
        }
        Err(message) => {
            eprintln!("studystream2: {message}");
            Arc::new(BackendProcess {
                child: Mutex::new(None),
                state: Mutex::new(ShellState::Error { message }),
                token,
            })
        }
    };
    backend
}

#[tauri::command]
fn get_backend_status(backend: tauri::State<'_, Arc<BackendProcess>>) -> ShellState {
    backend.status()
}

#[tauri::command]
fn get_auth_token(backend: tauri::State<'_, Arc<BackendProcess>>) -> String {
    backend.token.clone()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_backend_status, get_auth_token])
        .setup(|app| {
            let backend = start_backend(app.handle());
            app.manage(backend);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Study Stream 2.0")
        .run(|app_handle, event| {
            // Both exit paths are covered: window close raises ExitRequested,
            // process teardown raises Exit. kill_tree takes the child so a
            // double call is a no-op.
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                if let Some(backend) = app_handle.try_state::<Arc<BackendProcess>>() {
                    backend.kill_tree();
                }
            }
        });
}
