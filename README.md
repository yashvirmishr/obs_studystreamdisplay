# Study Status Overlay for OBS

A local, zero-dependency overlay system for Study With Me streams: a tiny
Python server keeps one source of truth for your study state, and browser
sources in OBS render the overlay. No Flask, npm, or third-party Python
packages.

## What the final version includes
- Live Singapore (SGT) clock and date, subject + topic/task panel
- Study stopwatch: Start / Pause / Stop / Reset, with the last completed
  session displayed on the overlay
- Study-start ("focus session") and session-complete toast animations
- **YouTube Now Playing** card, powered by the bundled Chrome/Edge
  extension that reports the active YouTube tab's title and channel
- **Combined Twitch + Kick chat** feed (via Unified Chat Lite,
  unified-chat.com - read-only, requires internet)
- **Please Wait scene** (`wait.html`): same overlay in "wait mode" with the
  dashboard hidden and the music card moved top-left

## Quick start
1. Double-click `start_windows.bat` (needs Windows, Python 3 as `py`,
   OBS Studio).
2. Control panel opens at `http://127.0.0.1:8765/control.html`.
3. In OBS add a Browser source 1920x1080:
   - Study scene: `http://127.0.0.1:8765/overlay.html`
   - Please Wait scene: `http://127.0.0.1:8765/wait.html`
4. Optional: load the `youtube_now_playing_extension` folder unpacked in
   Chrome (`chrome://extensions`) or Edge (`edge://extensions`).

## Repository layout
```
server.py           Local server + JSON state API (127.0.0.1:8765 only)
control.html        Streamer-facing control panel
overlay.html        OBS overlay (also serves ?mode=wait)
wait.html           Redirect stub to overlay.html?mode=wait
study_state.json    Runtime state (committed copy holds the app defaults)
youtube_now_playing_extension/   Chrome/Edge extension
versions/           Every draft archived as-distributed, plus its original
                    download ZIP (zips/)
```

## Development history
One commit per draft, in order; commit dates are restored from the
original draft ZIP timestamps. The root files are the latest draft.

| Commit | Draft (archived under `versions/`) |
|---|---|
| 1. First draft | `study_status_overlay` |
| 2. Session lifecycle, animations, YouTube Now Playing + extension | `study_status_overlay_updated` |
| 3. Twitch live chat panel | `study_status_overlay_final` |
| 4. Dark chat popout | `study_status_overlay_dark_chat` |
| 5. Combined Twitch + Kick chat | `study_status_overlay_multichat` |
| 6. Please Wait scene | `study_status_overlay_wait_screen` |
| 7. Wait-screen chat card aligned with the main overlay | `study_status_overlay_wait_same_chat` |
| 8. Green background tint on the wait screen | `study_status_overlay_wait_green_background` |
| 9. One shared overlay implementation for both scenes | `obs_shared_chat_fix_download` |

## Notes
- `study_state.json` is runtime data (subject, timer state, chat channels).
  The committed file contains the app defaults; your live copy updates as
  you use the app.
- The server binds only to 127.0.0.1 - never expose it to your network or
  the internet.
- The extension reads only public title/channel metadata; it does not grant
  broadcast rights for music - make sure the music you stream is licensed.