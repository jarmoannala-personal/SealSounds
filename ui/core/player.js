import { formatTime } from './utils.js';

let player = null;
let currentVideoId = null;
let currentPlaylistId = null;
let currentPlaylistIndex = -1;
let pendingPlaylistId = null;
let lastSearchResults = [];
let progressTimer = null;

// Callbacks that other modules can register
const listeners = {
  onLoad: [],
  onPlay: [],
  onPause: [],
  onProgress: [],
  onPlaylistVideoChange: [],
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

export function getCurrentPlaylistId() {
  return currentPlaylistId;
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

function resetPlayerDom() {
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
}

function showPlayerChrome() {
  document.getElementById('searchOverlay').classList.add('hidden');
  document.getElementById('ytContainer').style.display = 'block';
  document.getElementById('searchHint').style.display = 'block';
}

export function loadVideo(videoId, title, thumbnail) {
  if (typeof videoId !== 'string' || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    console.error('[Player] loadVideo called with invalid videoId:', videoId);
    return;
  }
  showPlayerChrome();

  currentVideoId = videoId;
  currentPlaylistId = null;
  currentPlaylistIndex = -1;
  pendingPlaylistId = null;

  // Update URL so the link can be shared
  try {
    const url = new URL(window.location);
    url.searchParams.set('v', videoId);
    url.searchParams.delete('list');
    history.replaceState(null, '', url);
  } catch (e) {}

  document.getElementById('trackTitle').textContent = title;
  document.getElementById('trackArtist').textContent = 'Loading info...';
  document.getElementById('albumArt').src = thumbnail;

  // Reuse existing iframe if possible — destroying and recreating triggers
  // postMessage origin-mismatch errors on transition.
  if (player && typeof player.loadVideoById === 'function') {
    try {
      player.loadVideoById(videoId);
      emit('onLoad', { videoId, title, thumbnail, kind: 'video' });
      return;
    } catch (e) {
      console.warn('[Player] reuse failed, recreating:', e);
    }
  }

  resetPlayerDom();

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

  emit('onLoad', { videoId, title, thumbnail, kind: 'video' });
}

export function loadPlaylist(playlistId, title, thumbnail) {
  if (typeof playlistId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(playlistId)) {
    console.error('[Player] loadPlaylist called with invalid playlistId:', playlistId);
    return;
  }
  showPlayerChrome();

  currentVideoId = null;
  currentPlaylistId = playlistId;
  currentPlaylistIndex = -1;

  try {
    const url = new URL(window.location);
    url.searchParams.delete('v');
    url.searchParams.set('list', playlistId);
    history.replaceState(null, '', url);
  } catch (e) {}

  document.getElementById('trackTitle').textContent = title;
  document.getElementById('trackArtist').textContent = 'Loading info...';
  document.getElementById('albumArt').src = thumbnail;

  // Reuse existing iframe if possible — see loadVideo above.
  if (player && typeof player.loadPlaylist === 'function') {
    try {
      player.loadPlaylist({ list: playlistId, listType: 'playlist' });
      pendingPlaylistId = null;
      emit('onLoad', { playlistId, title, thumbnail, kind: 'playlist' });
      return;
    } catch (e) {
      console.warn('[Player] reuse failed, recreating:', e);
    }
  }

  pendingPlaylistId = playlistId;
  resetPlayerDom();

  // Construct a blank player; load the playlist inside onPlayerReady.
  // YT.Player's constructor validates `videoId` and rejects an undefined
  // value with "Invalid video id" — even when playerVars.list is set —
  // so we avoid that path entirely and use the loadPlaylist() API instead.
  player = new YT.Player('ytPlayer', {
    width: '200',
    height: '113',
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

  emit('onLoad', { playlistId, title, thumbnail, kind: 'playlist' });
}

function onPlayerReady(event) {
  if (pendingPlaylistId) {
    try {
      event.target.loadPlaylist({ list: pendingPlaylistId, listType: 'playlist' });
    } catch (e) {
      console.error('[Player] loadPlaylist failed:', e);
    }
    pendingPlaylistId = null;
  } else {
    event.target.playVideo();
  }
  startProgressUpdates();
}

function onPlayerStateChange(event) {
  const btn = document.getElementById('playPauseBtn');
  if (event.data === YT.PlayerState.PLAYING) {
    btn.innerHTML = '&#10074;&#10074;';
    startProgressUpdates();
    emit('onPlay');
    document.dispatchEvent(new Event('sealsounds:firstplay'));
  } else if (event.data === YT.PlayerState.ENDED) {
    if (currentPlaylistId) {
      // In playlist mode: IFrame auto-advances between videos. Only loop when
      // we just finished the last video in the playlist.
      try {
        const list = player.getPlaylist && player.getPlaylist();
        const idx = player.getPlaylistIndex && player.getPlaylistIndex();
        if (Array.isArray(list) && list.length > 0 && idx >= list.length - 1) {
          player.playVideoAt(0);
        }
      } catch (e) {}
    } else {
      // Single-video album: loop from the start
      player.seekTo(0, true);
      player.playVideo();
    }
  } else {
    btn.innerHTML = '&#9654;';
    emit('onPause');
  }
}

function onPlayerError(event) {
  const code = event.data;
  console.error(`[Player] YouTube error code=${code}, videoId=${currentVideoId}, origin=${window.location.origin}`);
  const toast = document.getElementById('errorToast');

  // Sanitize videoId to alphanumeric/dash/underscore only
  const safeId = currentVideoId.replace(/[^a-zA-Z0-9_-]/g, '');

  if (code === 150 || code === 101) {
    // Auto-try next result if available
    if (lastSearchResults.length > 0) {
      console.log('[Player] Embed blocked, auto-trying next result...');
      tryNextResult();
      return;
    }
    // No more results — show error
    toast.textContent = '';
    toast.appendChild(document.createTextNode("This video doesn't allow embedding. "));
    const link = document.createElement('a');
    link.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(safeId);
    link.target = '_blank';
    link.textContent = 'Open on YouTube';
    toast.appendChild(link);
    toast.style.display = 'block';
  } else {
    toast.textContent = '';
    toast.appendChild(document.createTextNode('YouTube error (code ' + parseInt(code) + '). '));
    const tryBtn = document.createElement('span');
    tryBtn.className = 'try-next';
    tryBtn.textContent = 'Try next result';
    tryBtn.addEventListener('click', tryNextResult);
    toast.appendChild(tryBtn);
    toast.style.display = 'block';
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
    if (currentPlaylistId && player.getPlaylistIndex) {
      const idx = player.getPlaylistIndex();
      if (typeof idx === 'number' && idx !== currentPlaylistIndex) {
        currentPlaylistIndex = idx;
        emit('onPlaylistVideoChange', { index: idx });
      }
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
