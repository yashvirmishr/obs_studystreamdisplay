// Reads the public viewer count shown on the streamer's own Twitch or Kick
// tab and posts it to the local overlay. It never logs in, stores anything,
// or sends anything except the plain number the page already displays.
(() => {
  const isTwitch = location.hostname.endsWith('twitch.tv');
  const source = isTwitch ? 'twitch' : 'kick';

  function parseViewerCount(text) {
    // Twitch shows "1.2K viewers" / "1,873 viewers", Kick shows similar
    // "viewing"/"watching" wording depending on rollout.
    const m = /(\d[\d.,]*\s*[kKmM]?)\s*(?:viewers?|viewing|watching)/.exec(text || '');
    if (!m) return null;
    let raw = m[1].replace(/[,\s]/g, '');
    let mult = 1;
    if (/k$/i.test(raw)) { mult = 1000; raw = raw.slice(0, -1); }
    else if (/m$/i.test(raw)) { mult = 1000000; raw = raw.slice(0, -1); }
    const value = parseFloat(raw);
    if (Number.isNaN(value) || value < 0) return null;
    return Math.round(value * mult);
  }

  function readPage() {
    const text = document.body ? document.body.innerText.slice(0, 60000) : '';
    const viewers = parseViewerCount(text);
    let isLive = null;
    if (viewers != null) {
      isLive = true;
    } else if (/^\s*offline/im.test(text) && !/(viewers?|viewing|watching)/i.test(text)) {
      isLive = false;
    } else if (isTwitch && /live-indicator/i.test(document.body.innerHTML.slice(0, 100000))) {
      isLive = true;
    }
    return { source, viewers, isLive };
  }

  let lastPayload = '{}';
  let lastSentAt = 0;

  function sendNow() {
    const page = readPage();
    if (page.viewers == null && page.isLive == null) return; // nothing usable
    const payload = JSON.stringify(page);
    const stale = Date.now() - lastSentAt > 60000; // heartbeat keeps updatedAt fresh
    if (payload === lastPayload && !stale) return;
    chrome.runtime.sendMessage({ type: 'STUDY_STREAM_STATS', payload: page }, () => {
      if (chrome.runtime.lastError) return;
      lastPayload = payload;
      lastSentAt = Date.now();
    });
  }

  sendNow();
  setInterval(sendNow, 15000);
})();
