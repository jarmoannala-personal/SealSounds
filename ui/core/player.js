import { formatTime } from './utils.js';

let player = null;
let currentVideoId = null;
let lastSearchResults = [];
let progressTimer = null;

// Callbacks that other modules can register
const listeners = {
  onLoad: [],
  onPlay: [],
  onPause: [],
  onProgress: [],
  onError: [],
};

export function on(event, fn) {
  if (listeners[event]) listeners[event].push(fn);
}

function emit(event, data) {
  for (const fn of listeners[event] || []) fn(data);
}

export function getPlayer() {
  return player;
}

export function getCurrentVideoId() {
  return currentVideoId;
}

export function setLastSearchResults(results) {
  lastSearchResults = results;
}

export function initYouTubeAPI() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = resolve;
  });
}

export function loadVideo(videoId, title, thumbnail) {
  document.getElementById('searchOverlay').classList.add('hidden');
  document.getElementById('ytContainer').style.display = 'block';
  document.getElementById('searchHint').style.display = 'block';

  currentVideoId = videoId;
  document.getElementById('trackTitle').textContent = title;
  document.getElementById('trackArtist').textContent = 'Loading info...';
  document.getElementById('albumArt').src = thumbnail;

  // Destroy old player and re-create the DOM element
  if (player) {
    try { player.destroy(); } catch (e) {}
    player = null;
  }
  const container = document.getElementById('ytContainer');
  const oldEl = document.getElementById('ytPlayer');
  if (oldEl) oldEl.remove();
  const newEl = document.createElement('div');
  newEl.id = 'ytPlayer';
  container.appendChild(newEl);

  player = new YT.Player('ytPlayer', {
    width: '200',
    height: '113',
    videoId: videoId,
    playerVars: {
      autoplay: 1,
      controls: 1,
      modestbranding: 1,
      origin: window.location.origin,
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
      onError: onPlayerError,
    }
  });

  emit('onLoad', { videoId, title, thumbnail });
}

function onPlayerReady(event) {
  event.target.playVideo();
  startProgressUpdates();
}

function onPlayerStateChange(event) {
  const btn = document.getElementById('playPauseBtn');
  if (event.data === YT.PlayerState.PLAYING) {
    btn.innerHTML = '&#10074;&#10074;';
    startProgressUpdates();
    emit('onPlay');
    document.dispatchEvent(new Event('sealsounds:firstplay'));
  } else {
    btn.innerHTML = '&#9654;';
    emit('onPause');
  }
}

function onPlayerError(event) {
  const code = event.data;
  const toast = document.getElementById('errorToast');

  if (code === 150 || code === 101) {
    const ytLink = `https://www.youtube.com/watch?v=${currentVideoId}`;
    const nextAvailable = lastSearchResults.length > 0;
    toast.innerHTML = `
      This video doesn't allow embedding.<br>
      <a href="${ytLink}" target="_blank">Open on YouTube</a>
      ${nextAvailable ? '<br><span class="try-next" id="tryNextBtn">Try next result</span>' : ''}
    `;
    toast.style.display = 'block';
    if (nextAvailable) {
      setTimeout(() => {
        const btn = document.getElementById('tryNextBtn');
        if (btn) btn.addEventListener('click', tryNextResult);
      }, 0);
    }
  } else {
    toast.innerHTML = `YouTube error (code ${code}). <span class="try-next" id="tryNextBtn">Try next result</span>`;
    toast.style.display = 'block';
    setTimeout(() => {
      const btn = document.getElementById('tryNextBtn');
      if (btn) btn.addEventListener('click', tryNextResult);
    }, 0);
  }
  emit('onError', { code });
}

function tryNextResult() {
  document.getElementById('errorToast').style.display = 'none';
  if (lastSearchResults.length > 0) {
    const next = lastSearchResults.shift();
    loadVideo(next.id, next.title, next.thumbnail);
  }
}

function startProgressUpdates() {
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    if (!player || !player.getDuration) return;
    const current = player.getCurrentTime();
    const total = player.getDuration();
    if (total > 0) {
      const pct = (current / total) * 100;
      document.getElementById('progressFill').style.width = pct + '%';
      document.getElementById('currentTime').textContent = formatTime(current);
      document.getElementById('totalTime').textContent = formatTime(total);
      emit('onProgress', { current, total });
    }
  }, 500);
}

export function togglePlayPause() {
  if (testMode) {
    testPlaying = !testPlaying;
    const btn = document.getElementById('playPauseBtn');
    btn.innerHTML = testPlaying ? '&#10074;&#10074;' : '&#9654;';
    emit(testPlaying ? 'onPlay' : 'onPause');
    return;
  }
  if (!player || !player.getPlayerState) return;
  const state = player.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
}

export function seekTo(seconds) {
  if (testMode) {
    testTime = seconds;
    return;
  }
  if (player && player.seekTo) {
    player.seekTo(seconds, true);
  }
}

export function seekToPercent(pct) {
  if (testMode) {
    testTime = pct * TEST_DURATION;
    return;
  }
  if (player && player.getDuration) {
    player.seekTo(pct * player.getDuration(), true);
  }
}

// ---------------------------------------------------------------------------
// Test mode — simulates a YouTube player without any API calls
// ---------------------------------------------------------------------------
let testMode = false;
let testTime = 0;
let testPlaying = false;
const TEST_DURATION = 55 * 60; // 55 minutes

export function isTestMode() { return testMode; }

export function loadTestVideo(title) {
  testMode = true;
  testTime = 0;
  testPlaying = true;

  document.getElementById('searchOverlay').classList.add('hidden');
  document.getElementById('ytContainer').style.display = 'none'; // no iframe needed
  document.getElementById('searchHint').style.display = 'block';

  currentVideoId = 'TEST_MODE';
  document.getElementById('trackTitle').textContent = title;
  document.getElementById('trackArtist').textContent = 'Test Artist';
  document.getElementById('albumArt').src = '';

  const btn = document.getElementById('playPauseBtn');
  btn.innerHTML = '&#10074;&#10074;';

  document.dispatchEvent(new Event('sealsounds:firstplay'));

  // Simulate progress
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    if (!testPlaying) return;
    testTime += 0.5;
    if (testTime > TEST_DURATION) testTime = TEST_DURATION;
    const pct = (testTime / TEST_DURATION) * 100;
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('currentTime').textContent = formatTime(testTime);
    document.getElementById('totalTime').textContent = formatTime(TEST_DURATION);
    emit('onProgress', { current: testTime, total: TEST_DURATION });
  }, 500);

  emit('onLoad', { videoId: 'TEST_MODE', title, thumbnail: '' });
  emit('onPlay');
}
