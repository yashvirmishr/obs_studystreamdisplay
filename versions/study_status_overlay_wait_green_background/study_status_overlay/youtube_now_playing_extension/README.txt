YOUTUBE NOW PLAYING EXTENSION (CHROME / EDGE)
=============================================

WHAT IT DOES
- Detects the title and channel of the current YouTube watch page.
- Detects whether the video is currently playing or paused.
- Sends only that public page metadata to http://127.0.0.1:8765 on your own laptop.
- Updates the OBS music card automatically.

INSTALL (CHROME OR EDGE)
1. Start the Study Status Overlay server using start_windows.bat.
2. Open chrome://extensions (Chrome) or edge://extensions (Edge).
3. Turn on Developer mode.
4. Click Load unpacked.
5. Select this youtube_now_playing_extension folder.
6. Open or refresh your YouTube music tab. Play a video.
7. The Now Playing card should update within a few seconds.

NOTES
- Keep the local Study Status server running.
- This detects the active YouTube tab's video metadata. If you have multiple YouTube tabs playing, the most recently reporting tab may be displayed. Pause other YouTube tabs to avoid confusion.
- The extension does not download, capture, or transmit audio. It does not access your Google account, watch history, or credentials.
- It works on youtube.com watch pages, not every embedded YouTube player.
- If the card does not update, refresh the YouTube tab and check that the local server is running.
