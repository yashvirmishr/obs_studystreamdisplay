STUDY STATUS OVERLAY FOR OBS
============================

WHAT IT DOES
- Shows current Singapore time and date.
- Shows your subject and current topic/task.
- Provides a study stopwatch with Start, Pause and Reset controls.
- Synchronises the control page and OBS Browser Source through a tiny local Python server.
- Saves the current subject and stopwatch state in study_state.json.
- Requires no Flask, npm, or third-party Python packages.

REQUIREMENTS
- Windows 11
- Python 3 installed and available as `py` or `python`
- OBS Studio

START IT
1. Extract this folder somewhere convenient.
2. Double-click start_windows.bat.
3. Your browser should open the local control panel at http://127.0.0.1:8765/control.html.
4. Leave the server window running while you use the overlay.

ADD IT TO OBS
1. In OBS, open your Study scene.
2. Under Sources, click +, then Browser.
3. Choose Create New and name it Study Status Overlay.
4. Set URL to: http://127.0.0.1:8765/overlay.html
5. Set Width to 1920 and Height to 1080.
6. The panel appears in the top-right; the rest of the Browser Source is transparent.
7. Click OK. Use the OBS preview to adjust its placement if needed.

HOW TO USE
- In the control panel, enter your subject and topic/task, then click Update stream overlay.
- Click Start when you begin studying.
- Click Pause when you take a break.
- Click Start again to resume the same session.
- Click Reset to return the stopwatch to zero.
- The clock always displays Singapore time (SGT, Asia/Singapore).

TROUBLESHOOTING
- If the control panel or overlay does not load, check that the server window is still open.
- If port 8765 is already in use, change PORT in server.py and update the port in both URLs in OBS and your browser.
- If updates do not appear, refresh the Browser Source in OBS and reload the control page.
- Do not expose this local control panel to the internet or your public network.

PRIVACY
The server binds only to 127.0.0.1, so it is accessible from your own laptop and not other devices on your network.
