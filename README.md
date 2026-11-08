# Study Status Overlay for OBS (Study Stream Display)

A local, zero-dependency overlay system for Study With Me streams: a tiny
Python server keeps one source of truth for your study state, and browser
sources in OBS render the overlay. No Flask, npm, or third-party Python
packages.

Built for study streamers anywhere - not locked to one time zone, one
language, or one layout.

## What the current version includes
- Live clock and date in **any time zone** (or follow the streaming PC),
  formatted with any locale code you type (de-DE, ja-JP, pt-BR, hi-IN…)
- Study stopwatch: Start / Pause / Stop / Reset, with the last completed
  session displayed on the overlay
- **Session history log** (last 30 kept) with a one-click clear-all
- Study-start ("focus session") and session-complete toast animations
- **YouTube Now Playing** card, powered by the bundled Chrome/Edge
  extension that reports the active YouTube tab's title and channel
- **Combined Twitch + Kick chat** feed (via Unified Chat Lite,
  unified-chat.com - read-only, requires internet)
- **Layout profiles**: drag the dashboard, chat and music cards around a
  16:9 stage, save them as named profiles, and get a dedicated OBS link
  per profile - different arrangements for different scenes
- **Optional cards** you can add per profile: live viewer count,
  a pomodoro round timer, and a daily-study-goal progress card
- **Please Wait scene**: the same overlay in "wait mode" with the dashboard
  hidden and the music card moved

## Quick start
1. Double-click `start_windows.bat` (needs Windows, Python 3 as `py`,
   OBS Studio).
2. Control panel opens at `http://127.0.0.1:8765/control.html`.
3. In OBS add a Browser source, 1920 x 1080 recommended:
   - Study scene: `http://127.0.0.1:8765/overlay.html`
   - Please Wait scene: `http://127.0.0.1:8765/wait.html`
4. Optional: load the `youtube_now_playing_extension` folder unpacked in
   Chrome (`chrome://extensions`) or Edge (`edge://extensions`).

## Layout profiles and per-profile OBS links
Open `http://127.0.0.1:8765/layout.html`:
- Drag cards on the stage (or type exact percentages) to place the study
  dashboard, the chat card and the music card
- Toggle cards or the last-session block per profile
- Save named profiles (e.g. `exam_sprint`, `chill_revisions`); each profile
  gets links like:
  - `overlay.html?layout=exam_sprint` (dashboard view)
  - `overlay.html?mode=wait&layout=exam_sprint` (please-wait view)
- Assign which profile each scene uses by default - the plain
  `overlay.html` / `wait.html` URLs then follow that assignment

Positions are stored as percentages of the OBS source, so profiles hold at
any source size. The overlay re-reads its profile roughly once a second,
so saved changes land in OBS without refreshing the Browser source.

## Time zones and languages
In the control panel's "Clock & language" card:
- **Time zone**: any IANA name (`Europe/Berlin`, `Asia/Tokyo`,
  `America/New_York`, …) or `auto` to follow the PC the server runs on
- **Locale**: any BCP-47-ish code that `Intl` accepts; it formats the date
  and the session timestamps everywhere (overlay + control panel)
The panel header automatically labels the zone (e.g. *Current local time -
SGT*), and the control panel shows a live preview before you save.

## Session history
- Stop Session records: subject, task, duration, completion time
- The control panel shows the log with a running total (30 kept)
- "Clear usage history" wipes the log and the previous-session card in one
  confirm-guarded action - the timer and settings are untouched

## Optional overlay cards
The default study/wait profiles keep their shipped arrangement. Three extra
cards exist for you to add yourself, per profile, in the layout editor
(select the card in the "Card" dropdown - it is added to the currently
edited profile the first time you select it):

- **Live viewers** (`stats`) - shows the viewer count of your own stream.
  The companion extension reads the public number shown on your Twitch or
  Kick tab and posts it to the local server; nothing is logged in, stored,
  or sent beyond this machine. Prefer manual? Set it in the control
  panel's "Stream metrics" card.
- **Pomodoro** (`pomodoro`) - focus/break rounds with a progress bar.
  Start, pause and reset them from the control panel; the server keeps
  the clock running even with no browser tab open, and the overlay gets a
  toast when a round flips.
- **Daily study goal** (`goal`) - minutes studied today vs your goal,
  counted from the session history (plus the running session) in your
  stream's time zone. 0 disables the target and the card shows plain time.

## Repository layout
```
server.py           Local server + JSON state API (127.0.0.1:8765 only)
control.html        Streamer-facing control panel
overlay.html        OBS overlay (also serves ?mode=wait and ?layout=name)
layout.html         Drag-and-drop layout profile editor + OBS links
wait.html           Redirect stub to overlay.html?mode=wait
study_state.json    Runtime state (committed copy holds the app defaults)
youtube_now_playing_extension/   Chrome/Edge extension
```

## Notes
- `study_state.json` is runtime data (subject, timer state, chat channels,
  layout profiles). The committed file contains the app defaults; your
  live copy updates as you use the app.
- The server binds only to 127.0.0.1 - never expose it to your network or
  the internet.
- The extension reads only public title/channel metadata; it does not grant
  broadcast rights for music - make sure the music you stream is licensed.

## Making changes safely
Pages do not overwrite each other: layout edits, session actions and
settings go through `/api/config`, which merges keys onto the current
state, so a running stopwatch is never clobbered by the layout editor
(and vice versa). Only the bundled extension posts media metadata, via
`/api/now-playing`.

The design keeps every feature isolated in state, so future quality-of-life
upgrades (new card types, per-profile fonts/colors, countdown timers,
multi-monitor presets…) can be added without touching the stored format.
