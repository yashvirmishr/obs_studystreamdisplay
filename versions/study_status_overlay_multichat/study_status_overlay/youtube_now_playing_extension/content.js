(() => {
  let lastPayload = '';
  let lastSentAt = 0;
  let timer = null;

  function currentVideo() {
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (!video) return null;
    const titleNode = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') || document.querySelector('h1.title yt-formatted-string') || document.querySelector('meta[name="title"]');
    const channelNode = document.querySelector('#owner #channel-name a') || document.querySelector('ytd-channel-name a') || document.querySelector('meta[itemprop="author"]');
    const title = titleNode?.getAttribute?.('content') || titleNode?.textContent?.trim() || document.title.replace(/\s*-\s*YouTube$/, '').trim();
    const artist = channelNode?.getAttribute?.('content') || channelNode?.textContent?.trim() || '';
    if (!title || title === 'YouTube') return null;
    return { title: title.slice(0, 120), artist: artist.slice(0, 100), playing: !video.paused && !video.ended && video.readyState >= 2 };
  }

  function update() {
    const info = currentVideo();
    if (!info) return;
    const payload = JSON.stringify(info);
    if (payload === lastPayload && Date.now() - lastSentAt < 15000) return;
    chrome.runtime.sendMessage({ type: 'STUDY_STREAM_NOW_PLAYING', payload: info }, response => {
      if (chrome.runtime.lastError || !response?.ok) return;
      lastPayload = payload;
      lastSentAt = Date.now();
    });
  }

  function restartPolling() {
    if (timer) clearInterval(timer);
    lastPayload = '';
    update();
    timer = setInterval(update, 2500);
  }

  document.addEventListener('yt-navigate-finish', restartPolling);
  document.addEventListener('play', update, true);
  document.addEventListener('pause', update, true);
  document.addEventListener('ended', update, true);
  restartPolling();
})();
