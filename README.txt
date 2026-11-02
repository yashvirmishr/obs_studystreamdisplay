STUDY STATUS OVERLAY FOR OBS - UPDATED
======================================

WHAT'S INCLUDED
- Live Singapore clock and date.
- Current subject and topic/task.
- Study stopwatch with Start, Pause, Stop and Reset.
- Last completed study session, saved when Stop is pressed.
- Study Start and Session Complete animations in OBS.
- Automatic YouTube Now Playing metadata through a small Chrome/Edge extension.
- Local Python server; no Flask, npm or third-party Python packages.

REQUIREMENTS
- Windows 11
- Python 3 available as py or python
- OBS Studio
- Chrome or Edge for automatic YouTube metadata detection

START THE SERVER
1. Extract the ZIP to a normal folder (not inside the ZIP preview).
2. Double-click start_windows.bat.
3. Keep the server window open while streaming.
4. Control panel: http://127.0.0.1:8765/control.html

ADD THE OBS OVERLAY
1. OBS > Sources > + > Browser.
2. URL: http://127.0.0.1:8765/overlay.html
3. Width: 1920; Height: 1080.
4. Keep one Browser Source and reuse it across scenes.

AUTOMATIC YOUTUBE NOW PLAYING
1. With the server running, open youtube_now_playing_extension inside the extracted project folder.
2. In Chrome, visit chrome://extensions. In Edge, visit edge://extensions.
3. Enable Developer mode.
4. Choose Load unpacked and select the youtube_now_playing_extension folder.
5. Refresh your YouTube tab and play a video.
6. The overlay reads the video title and channel automatically.

STUDY SESSION CONTROLS
- Start studying: starts/resumes the stopwatch. Starting from zero triggers the start animation.
- Pause: pauses the current session without saving it as completed.
- Stop session: saves the subject, task, duration and completion time as Last study session, resets the active stopwatch and triggers the completion animation.
- Reset timer: clears the active timer without saving a completed session.

TROUBLESHOOTING
- If download fails, use the ZIP link supplied in the chat, not the individual folder preview. Save the ZIP to Downloads, then right-click > Extract All.
- If the server does not start, install Python 3 and ensure the Python launcher (py) is available.
- If the OBS overlay is blank, check that the server window is open and reload the Browser Source.
- If YouTube metadata does not update, check the extension is enabled, refresh youtube.com and verify the server is running.
- If more than one YouTube tab is playing, pause the others.
- The server binds only to 127.0.0.1. Do not expose it to your network or the internet.

MUSIC RIGHTS
The extension reads only public title/channel metadata. It does not grant rights to broadcast music. Ensure the music is licensed for Twitch livestreams and VODs; a YouTube or YouTube Premium subscription alone does not grant those rights.
