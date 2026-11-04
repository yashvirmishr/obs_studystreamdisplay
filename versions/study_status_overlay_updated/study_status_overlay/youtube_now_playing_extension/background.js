const ENDPOINT = 'http://127.0.0.1:8765/api/now-playing';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'STUDY_STREAM_NOW_PLAYING') return;
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message.payload || {})
  }).then(response => sendResponse({ ok: response.ok }))
    .catch(error => sendResponse({ ok: false, error: String(error) }));
  return true;
});
