from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import os
import threading
import webbrowser

ROOT = Path(__file__).resolve().parent
STATE_FILE = ROOT / "study_state.json"
HOST = "127.0.0.1"
PORT = 8765
DEFAULT_STATE = {
    "subject": "Your subject",
    "task": "Your current topic or task",
    "accumulatedMs": 0,
    "startedAt": None,
    "running": False,
}


def read_state():
    try:
        with STATE_FILE.open("r", encoding="utf-8") as file:
            data = json.load(file)
        if not isinstance(data, dict):
            return DEFAULT_STATE.copy()
        return {**DEFAULT_STATE, **data}
    except (OSError, json.JSONDecodeError):
        return DEFAULT_STATE.copy()


def write_state(data):
    clean = {
        "subject": str(data.get("subject", DEFAULT_STATE["subject"]))[:60],
        "task": str(data.get("task", DEFAULT_STATE["task"]))[:100],
        "accumulatedMs": max(0, int(data.get("accumulatedMs", 0))),
        "startedAt": data.get("startedAt"),
        "running": bool(data.get("running", False)),
    }
    if clean["startedAt"] is not None:
        clean["startedAt"] = int(clean["startedAt"])
    temporary = STATE_FILE.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as file:
        json.dump(clean, file)
    temporary.replace(STATE_FILE)
    return clean


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/api/state":
            payload = json.dumps(read_state()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/state":
            self.send_error(404, "Not found")
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size <= 0 or size > 4096:
                self.send_error(400, "Invalid request size")
                return
            data = json.loads(self.rfile.read(size).decode("utf-8"))
            if not isinstance(data, dict):
                raise ValueError("Expected a JSON object")
            payload = json.dumps(write_state(data)).encode("utf-8")
        except (ValueError, TypeError, json.JSONDecodeError):
            self.send_error(400, "Invalid state data")
            return
        except (OSError, OverflowError):
            self.send_error(500, "Could not save state")
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    os.chdir(ROOT)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("Study Stream controls are available at:")
    print(f"  Control panel: http://{HOST}:{PORT}/control.html")
    print(f"  OBS overlay:   http://{HOST}:{PORT}/overlay.html")
    print("Keep this window open while using the overlay. Press Ctrl+C to stop.")
    threading.Timer(0.8, lambda: webbrowser.open(f"http://{HOST}:{PORT}/control.html")).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\\nStopping Study Stream server...")
    finally:
        server.server_close()
