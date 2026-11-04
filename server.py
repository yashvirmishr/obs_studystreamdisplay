from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from datetime import datetime, timezone
import json, os, re, threading, webbrowser

ROOT = Path(__file__).resolve().parent
STATE_FILE = ROOT / "study_state.json"
HOST = "127.0.0.1"
PORT = 8765
DEFAULT_STATE = {
    "subject": "Your subject", "task": "Your current topic or task",
    "accumulatedMs": 0, "startedAt": None, "running": False,
    "musicTitle": "", "musicArtist": "", "showMusic": True,
    "musicPlaying": False, "lastSession": None, "animation": None,
    "animationId": 0, "twitchChannel": "", "kickChannel": ""
}


def read_state():
    try:
        with STATE_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return DEFAULT_STATE.copy()
        return {**DEFAULT_STATE, **data}
    except (OSError, json.JSONDecodeError):
        return DEFAULT_STATE.copy()


def write_state(data):
    clean = {**DEFAULT_STATE, **data}
    clean["subject"] = str(clean.get("subject") or "Your subject")[:60]
    clean["task"] = str(clean.get("task") or "Your current topic or task")[:100]
    clean["accumulatedMs"] = max(0, int(clean.get("accumulatedMs") or 0))
    clean["running"] = bool(clean.get("running"))
    clean["musicTitle"] = str(clean.get("musicTitle") or "")[:120]
    clean["musicArtist"] = str(clean.get("musicArtist") or "")[:100]
    channel = str(clean.get("twitchChannel") or "").strip().lower()
    clean["twitchChannel"] = channel if re.fullmatch(r"[a-z0-9_]{1,25}", channel) else ""
    kick_channel = str(clean.get("kickChannel") or "").strip().lower()
    clean["kickChannel"] = kick_channel if re.fullmatch(r"[a-z0-9_.-]{1,64}", kick_channel) else ""
    clean["showMusic"] = bool(clean.get("showMusic", True))
    clean["musicPlaying"] = bool(clean.get("musicPlaying"))
    clean["animationId"] = max(0, int(clean.get("animationId") or 0))
    if clean.get("startedAt") is not None:
        clean["startedAt"] = int(clean["startedAt"])
    if not isinstance(clean.get("lastSession"), (dict, type(None))):
        clean["lastSession"] = None
    if clean.get("animation") not in ("start", "stop", None):
        clean["animation"] = None
    tmp = STATE_FILE.with_suffix('.tmp')
    with tmp.open('w', encoding='utf-8') as f:
        json.dump(clean, f, ensure_ascii=False)
    tmp.replace(STATE_FILE)
    return clean


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _send_json(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', 'chrome-extension://*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        if self.path.split('?', 1)[0] in ('/api/now-playing', '/api/state'):
            self._send_json({'ok': True})
        else:
            self.send_error(404)

    def do_GET(self):
        if self.path.split('?', 1)[0] == '/api/state':
            self._send_json(read_state())
            return
        super().do_GET()

    def do_POST(self):
        path = self.path.split('?', 1)[0]
        if path not in ('/api/state', '/api/now-playing'):
            self.send_error(404, 'Not found')
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size <= 0 or size > 8192:
                self.send_error(400, 'Invalid request size')
                return
            data = json.loads(self.rfile.read(size).decode('utf-8'))
            if not isinstance(data, dict):
                raise ValueError('Expected a JSON object')
            current = read_state()
            if path == '/api/now-playing':
                # The browser extension only supplies public video metadata from the user's own tab.
                current['musicTitle'] = str(data.get('title') or '')[:120]
                current['musicArtist'] = str(data.get('artist') or '')[:100]
                current['musicPlaying'] = bool(data.get('playing'))
                current['showMusic'] = bool(current['musicTitle'])
                result = write_state(current)
            else:
                result = write_state(data)
            self._send_json(result)
        except (ValueError, TypeError, json.JSONDecodeError):
            self.send_error(400, 'Invalid state data')
        except (OSError, OverflowError):
            self.send_error(500, 'Could not save state')

    def log_message(self, fmt, *args):
        pass


if __name__ == '__main__':
    os.chdir(ROOT)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print('Study Stream controls: http://127.0.0.1:8765/control.html')
    print('OBS overlay:          http://127.0.0.1:8765/overlay.html')
    print('Keep this window open. Press Ctrl+C to stop.')
    threading.Timer(0.8, lambda: webbrowser.open(f'http://{HOST}:{PORT}/control.html')).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopping Study Stream server...')
    finally:
        server.server_close()
