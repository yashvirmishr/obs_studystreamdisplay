const ENDPOINT = 'http://127.0.0.1:8765/api/now-playing';
const METRICS_ENDPOINT = 'http://127.0.0.1:8765/api/metrics';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'STUDY_STREAM_NOW_PLAYING') {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message.payload || {})
    }).then(response => sendResponse({ ok: response.ok }))
      .catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message?.type === 'STUDY_STREAM_STATS') {
    fetch(METRICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message.payload || {})
    }).then(response => sendResponse({ ok: response.ok }))
      .catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
});
