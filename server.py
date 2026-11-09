from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import json, os, re, threading, time, webbrowser

ROOT = Path(__file__).resolve().parent
STATE_FILE = ROOT / "study_state.json"
HOST = "127.0.0.1"
PORT = 8765
STATE_LOCK = threading.Lock()

DEFAULT_STATE = {
    "subject": "Your subject", "task": "Your current topic or task",
    "accumulatedMs": 0, "startedAt": None, "running": False,
    "musicTitle": "", "musicArtist": "", "showMusic": True,
    "musicPlaying": False, "lastSession": None, "animation": None,
    "animationId": 0, "twitchChannel": "", "kickChannel": "",
    "timezone": "Asia/Singapore", "locale": "en-SG", "sessionLog": [],
    "layouts": {"study": {"panel": {"on": True, "x": 75.1, "y": 3.9, "w": 22.4},
                          "music": {"on": True, "x": 2.5, "y": 90.2, "w": 19.0},
                          "chat": {"on": True, "x": 75.5, "y": 56.2, "w": 17.7, "h": 39.8},
                          "last": True},
                "wait": {"panel": {"on": False, "x": 75.1, "y": 3.9, "w": 22.4},
                         "music": {"on": True, "x": 2.5, "y": 3.9, "w": 19.0},
                         "chat": {"on": True, "x": 75.5, "y": 56.2, "w": 17.7, "h": 39.8},
                         "last": True}},
    "sceneLayouts": {"study": "study", "wait": "wait"},
    "dailyGoalMs": 0,
    "pomodoro": {"running": False, "phase": None, "endsAt": None,
                 "remainingMs": 0, "phaseLenMs": 0,
                 "focusMin": 25, "breakMin": 5, "cycles": 0},
    "stats": {"viewers": None, "isLive": None, "updatedAt": None, "source": ""}
}

# Cards a profile may add on its own; never auto-injected into defaults, so
# the built-in study/wait arrangements stay exactly as shipped.
OPTIONAL_CARDS = {
    "stats": {"on": True, "x": 2.5, "y": 3.9, "w": 12.0},
    "pomodoro": {"on": True, "x": 2.5, "y": 16.5, "w": 12.0},
    "goal": {"on": True, "x": 2.5, "y": 29.0, "w": 14.0},
}



def _pct(value, low, high, fallback):
    try:
        v = float(value)
    except (ValueError, TypeError):
        return fallback
    return round(min(high, max(low, v)), 2)


def _clean_card(card_in, fallback_card, has_height):
    if not isinstance(card_in, dict):
        card_in = {}
    out = {
        "on": bool(card_in.get("on", fallback_card["on"])),
        "x": _pct(card_in.get("x", fallback_card["x"]), 0.0, 99.99, fallback_card["x"]),
        "y": _pct(card_in.get("y", fallback_card["y"]), 0.0, 99.99, fallback_card["y"]),
        "w": _pct(card_in.get("w", fallback_card["w"]), 6.0, 90.0, fallback_card["w"]),
    }
    if has_height:
        out["h"] = _pct(card_in.get("h", fallback_card["h"]), 10.0, 95.0, fallback_card["h"])
    return out


def _clean_layouts(layouts):
    """Profiles of card arrangements. Positions are top-left percentages of the
    OBS source, so they scale across source sizes."""
    base = DEFAULT_STATE["layouts"]
    if not isinstance(layouts, dict):
        return {name: {card: dict(value) if isinstance(value, dict) else value
                       for card, value in layout.items()}
                for name, layout in base.items()}
    out = {}
    for name, layout in layouts.items():
        name = str(name).strip().lower()
        if not re.fullmatch(r"[a-z0-9_-]{1,24}", name) or not isinstance(layout, dict):
            continue
        out[name] = {
            "panel": _clean_card(layout.get("panel"), base["study"]["panel"], False),
            "music": _clean_card(layout.get("music"), base["study"]["music"], False),
            "chat": _clean_card(layout.get("chat"), base["study"]["chat"], True),
            "last": bool(layout["last"]) if isinstance(layout.get("last"), (bool, int)) else True,
        }
        # Optional cards stay completely absent unless the profile
        # explicitly enables them in the layout editor.
        for card, spawn in OPTIONAL_CARDS.items():
            if isinstance(layout.get(card), dict):
                out[name][card] = _clean_card(layout[card], spawn, False)
        if len(out) >= 12:
            break
    if not out:
        return {n: {c: dict(v) if isinstance(v, dict) else v for c, v in l.items()}
                for n, l in base.items()}
    return out


def _clean_scene_layouts(scene_layouts, layouts):
    names = list(layouts.keys())
    fallback = "study" if "study" in names else names[0]
    if not isinstance(scene_layouts, dict):
        return {"study": fallback, "wait": fallback}
    out = {}
    for scene in ("study", "wait"):
        value = str(scene_layouts.get(scene, fallback)).strip().lower()[:24]
        out[scene] = value if value in names else fallback
    return out


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
    def _ms(value):
        try:
            return max(0, int(value or 0))
        except (ValueError, TypeError):
            return 0
    log = clean.get("sessionLog")
    if not isinstance(log, list):
        log = []
    clean_log = []
    for entry in log[-30:]:
        if not isinstance(entry, dict):
            continue
        clean_log.append({
            "subject": str(entry.get("subject") or "")[:60],
            "task": str(entry.get("task") or "")[:100],
            "durationMs": _ms(entry.get("durationMs")),
            "endedAt": str(entry.get("endedAt") or "")[:32],
            "endedLabel": str(entry.get("endedLabel") or "")[:64],
        })
    clean["sessionLog"] = clean_log
    if clean.get("animation") not in ("start", "stop", "pomodoro", None):
        clean["animation"] = None
    clean["dailyGoalMs"] = min(_ms(clean.get("dailyGoalMs")), 24 * 60 * 60000)
    pom = clean.get("pomodoro")
    if not isinstance(pom, dict):
        pom = {}
    phase = pom.get("phase")
    def _min(value, default, low, high):
        try:
            v = int(value or default)
        except (ValueError, TypeError):
            return default
        return min(max(v, low), high)
    clean["pomodoro"] = {
        "running": bool(pom.get("running")),
        "phase": phase if phase in ("focus", "break") else None,
        "endsAt": int(pom["endsAt"]) if isinstance(pom.get("endsAt"), (int, float)) else None,
        "remainingMs": min(_ms(pom.get("remainingMs")), 3 * 60 * 60000),
        "phaseLenMs": min(_ms(pom.get("phaseLenMs")), 3 * 60 * 60000),
        "focusMin": _min(pom.get("focusMin", 25), 25, 1, 180),
        "breakMin": _min(pom.get("breakMin", 5), 5, 1, 60),
        "cycles": min(_ms(pom.get("cycles")), 999),
    }
    stats = clean.get("stats")
    if not isinstance(stats, dict):
        stats = {}
    viewers = stats.get("viewers")
    clean["stats"] = {
        "viewers": min(int(viewers), 5_000_000) if isinstance(viewers, (int, float)) and viewers >= 0 else None,
        "isLive": bool(stats["isLive"]) if isinstance(stats.get("isLive"), (bool, int)) else None,
        "updatedAt": int(stats["updatedAt"]) if isinstance(stats.get("updatedAt"), (int, float)) else None,
        "source": str(stats.get("source") or "")[:16],
    }
    tz_value = str(clean.get("timezone") or "").strip()[:64] or "Asia/Singapore"
    if tz_value != "auto":
        try:
            ZoneInfo(tz_value)
        except (ZoneInfoNotFoundError, ValueError, KeyError):
            tz_value = "Asia/Singapore"
    clean["timezone"] = tz_value
    locale_value = re.fullmatch(r"[A-Za-z0-9_-]{2,16}", str(clean.get("locale") or "").strip() or "")
    clean["locale"] = locale_value.group(0) if locale_value else "en-SG"
    clean["layouts"] = _clean_layouts(clean.get("layouts"))
    clean["sceneLayouts"] = _clean_scene_layouts(clean.get("sceneLayouts"), clean["layouts"])
    tmp = STATE_FILE.with_suffix('.tmp')
    with tmp.open('w', encoding='utf-8') as f:
        json.dump(clean, f, ensure_ascii=False)
    tmp.replace(STATE_FILE)
    return clean


def _advance_pomodoro():
    """Flip the pomodoro to the next phase in the background, so cycles keep
    running even when every browser tab is closed. Runs while the server does."""
    state = read_state()
    pom = state.get("pomodoro")
    if not isinstance(pom, dict) or not pom.get("running"):
        return
    ends_at = pom.get("endsAt")
    if not isinstance(ends_at, (int, float)):
        return
    now = int(time.time() * 1000)
    if now < ends_at:
        return
    was_focus = pom.get("phase") == "focus"
    phase = "break" if was_focus else "focus"
    minutes = pom.get("breakMin", 5) if phase == "break" else pom.get("focusMin", 25)
    pom = {**pom, "phase": phase, "running": True,
           "endsAt": now + int(minutes) * 60000, "remainingMs": 0,
           "phaseLenMs": int(minutes) * 60000,
           "cycles": pom.get("cycles", 0) + (1 if was_focus else 0)}
    with STATE_LOCK:
        current = read_state()
        current["pomodoro"] = pom
        # Reuse the toast animation so OBS gets a "break started"/"focus back" cue.
        current["animation"] = "pomodoro"
        current["animationId"] = (current.get("animationId") or 0) + 1
        write_state(current)


def pomodoro_worker():
    while True:
        time.sleep(1)
        try:
            _advance_pomodoro()
        except Exception:
            pass


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _send_json(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        # '*' is the spec-valid wildcard: the extension origin is
        # chrome-extension://<id>, and 'chrome-extension://*' is not a
        # valid ACAO value, so CORS-preflighted requests would be refused.
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        if self.path.split('?', 1)[0] in ('/api/now-playing', '/api/state', '/api/config', '/api/metrics'):
            self._send_json({'ok': True})
        else:
            self.send_error(404)

    def do_GET(self):
        if self.path.split('?', 1)[0] == '/api/state':
            self._send_json(read_state())
            return
        super().do_GET()

    # Keys a page may update without sending a full snapshot - the server
    # merges onto the current state so a running stopwatch, a session log
    # and the layout editor never clobber each other.
    CONFIG_KEYS = ('subject', 'task', 'accumulatedMs', 'startedAt', 'running',
                   'animation', 'animationId', 'lastSession', 'sessionLog',
                   'timezone', 'locale', 'twitchChannel', 'kickChannel',
                   'showMusic', 'layouts', 'sceneLayouts',
                   'dailyGoalMs', 'pomodoro', 'stats')

    def do_POST(self):
        path = self.path.split('?', 1)[0]
        if path not in ('/api/state', '/api/now-playing', '/api/config', '/api/metrics'):
            self.send_error(404, 'Not found')
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size <= 0 or size > (2048 if path == '/api/metrics' else 32768):
                self.send_error(400, 'Invalid request size')
                return
            data = json.loads(self.rfile.read(size).decode('utf-8'))
            if not isinstance(data, dict):
                raise ValueError('Expected a JSON object')
            with STATE_LOCK:
                current = read_state()
                if path == '/api/now-playing':
                    # The browser extension only supplies public video metadata from the user's own tab.
                    current['musicTitle'] = str(data.get('title') or '')[:120]
                    current['musicArtist'] = str(data.get('artist') or '')[:100]
                    current['musicPlaying'] = bool(data.get('playing'))
                    current['showMusic'] = bool(current['musicTitle'])
                    result = write_state(current)
                elif path == '/api/metrics':
                    # Live stream metrics: the companion extension reads public
                    # viewer counts from the streamer's own Twitch/Kick tab,
                    # and the control panel can set them manually.
                    stats = {**current['stats']}
                    viewers = data.get('viewers')
                    if isinstance(viewers, (int, float)) and viewers >= 0:
                        stats['viewers'] = int(viewers)
                    elif viewers is None and 'viewers' in data:
                        stats['viewers'] = None
                    if 'isLive' in data:
                        stats['isLive'] = bool(data['isLive']) if data['isLive'] is not None else None
                    stats['updatedAt'] = int(time.time() * 1000)
                    stats['source'] = str(data.get('source') or 'manual')[:16]
                    current['stats'] = stats
                    result = write_state(current)
                elif path == '/api/config':
                    merged = {key: data[key] for key in self.CONFIG_KEYS if key in data}
                    result = write_state({**current, **merged})
                else:
                    result = write_state(data)
            self._send_json(result)
        except (ValueError, TypeError, json.JSONDecodeError):
            self.send_error(400, 'Invalid state data')
        except (OSError, OverflowError):
            self.send_error(500, 'Could not save state')

    def log_message(self, fmt, *args):
        # Debug visibility for extension traffic: instead of vanishing with
        # the console window (the old pass-through), every request line
        # lands in server_traffic.log, truncated at ~1 MB.
        try:
            log_file = ROOT / 'server_traffic.log'
            if log_file.exists() and log_file.stat().st_size > 1_000_000:
                log_file.write_text('', encoding='utf-8')
            stamp = datetime.now().strftime('%H:%M:%S')
            with log_file.open('a', encoding='utf-8') as f:
                f.write(f"{stamp} {self.address_string()} {fmt % args}\n")
        except OSError:
            pass


if __name__ == '__main__':
    os.chdir(ROOT)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print('Study Stream controls: http://127.0.0.1:8765/control.html')
    print('OBS overlay:          http://127.0.0.1:8765/overlay.html')
    print('OBS please-wait:      http://127.0.0.1:8765/wait.html')
    print('Layout editor:        http://127.0.0.1:8765/layout.html')
    print('Keep this window open. Press Ctrl+C to stop.')
    threading.Thread(target=pomodoro_worker, daemon=True).start()
    threading.Timer(0.8, lambda: webbrowser.open(f'http://{HOST}:{PORT}/control.html')).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopping Study Stream server...')
    finally:
        server.server_close()
