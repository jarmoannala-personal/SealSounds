import { CONFIG } from '../config.js';
import { formatTime, fetchWithTimeout } from './utils.js';
import { seekTo } from './player.js';

let currentTracks = [];
let currentTrackIndex = -1;

// localStorage cache for tracklist data (avoids re-fetching for replayed videos)
const TRACKLIST_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCachedTracklist(videoId) {
  try {
    const stored = localStorage.getItem('ss_tracks_' + videoId);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Date.now() - parsed.ts < TRACKLIST_CACHE_TTL) return parsed.data;
      localStorage.removeItem('ss_tracks_' + videoId);
    }
  } catch (e) {}
  return null;
}

function setCachedTracklist(videoId, tracks) {
  try {
    localStorage.setItem('ss_tracks_' + videoId, JSON.stringify({ data: tracks, ts: Date.now() }));
  } catch (e) {}
}

export function getTracks() {
  return currentTracks;
}

export function getCurrentTrackIndex() {
  return currentTrackIndex;
}

export function nextTrack() {
  if (currentTracks.length === 0) return;
  const next = currentTrackIndex + 1;
  if (next < currentTracks.length) {
    seekTo(currentTracks[next].time);
  }
}

export function previousTrack() {
  if (currentTracks.length === 0) return;
  const prev = currentTrackIndex - 1;
  if (prev >= 0) {
    seekTo(currentTracks[prev].time);
  }
}

function generateTestTracklist() {
  const names = [
    'Opening', 'Into the Light', 'Echoes of Dawn',
    'Midnight Run', 'The Crossing', 'Velvet Horizon',
    'Undertow', 'Distant Shores', 'Amber Glow',
    'Freefall', 'Quiet Storm', 'Outro — Fade to Silence',
  ];
  // 12 tracks spread across 55 minutes
  return names.map((name, i) => ({
    time: Math.round(i * (55 * 60) / 12),
    name,
  }));
}

export async function fetchTracklist(videoId) {
  currentTracks = [];
  currentTrackIndex = -1;
  const tracklistEl = document.getElementById('tracklist');
  tracklistEl.innerHTML = '';

  // Test mode — no API calls
  if (videoId === 'TEST_MODE') {
    currentTracks = generateTestTracklist();
    renderTracklist();
    return;
  }

  // Check cache first (0 API units)
  const cached = getCachedTracklist(videoId);
  if (cached && cached.length > 0) {
    console.log(`[API] Tracklist ${videoId} — cache hit (0 units)`);
    currentTracks = cached;
    renderTracklist();
    return;
  }

  try {
    // Fetch video description (1 unit)
    console.log(`[API] Tracklist ${videoId} — calling videos.list for description (1 unit)`);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${CONFIG.YOUTUBE_API_KEY}`;
    const resp = await fetchWithTimeout(url);
    const data = await resp.json();

    let tracks = [];
    if (data.items && data.items[0]) {
      const description = data.items[0].snippet.description;
      tracks = parseTimestamps(description);
    }

    // If no timestamps in description, try top comments
    if (tracks.length === 0) {
      console.log(`[API] No timestamps in description — calling commentThreads.list (1 unit)`);
      tracks = await fetchTimestampsFromComments(videoId);
    }

    if (tracks.length === 0) return;

    // Cache for this session
    setCachedTracklist(videoId, tracks);

    currentTracks = tracks;
    renderTracklist();
  } catch (err) {
    console.error('Failed to fetch tracklist:', err);
  }
}

async function fetchTimestampsFromComments(videoId) {
  try {
    const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=20&order=relevance&key=${CONFIG.YOUTUBE_API_KEY}`;
    const resp = await fetchWithTimeout(url);
    const data = await resp.json();

    if (!data.items) return [];

    let bestTracks = [];
    for (const thread of data.items) {
      const text = thread.snippet.topLevelComment.snippet.textDisplay
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '');
      const tracks = parseTimestamps(text);
      if (tracks.length > bestTracks.length) {
        bestTracks = tracks;
      }
    }
    return bestTracks;
  } catch (err) {
    console.error('Failed to fetch comments:', err);
    return [];
  }
}

export function parseTimestamps(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const tracks = [];

  const tsRegex = /(?:\(?(\d{1,2}):(\d{2})(?::(\d{2}))?\)?)/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !tsRegex.test(trimmed)) continue;

    const match = trimmed.match(tsRegex);
    if (!match) continue;

    let seconds;
    if (match[3] !== undefined) {
      seconds = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
    } else {
      seconds = parseInt(match[1]) * 60 + parseInt(match[2]);
    }

    let name = trimmed
      .replace(tsRegex, '')
      .replace(/^[\s\-–—:|.·•#\d)]+/, '')
      .replace(/[\s\-–—:|.]+$/, '')
      .trim();

    if (name.length > 0 && name.length < 200) {
      tracks.push({ time: seconds, name: name });
    }
  }

  tracks.sort((a, b) => a.time - b.time);
  return tracks.length >= 3 ? tracks : [];
}

function renderTracklist() {
  const el = document.getElementById('tracklist');
  el.innerHTML = `<div class="tracklist-title">Tracklist</div>`;

  currentTracks.forEach((track, i) => {
    const div = document.createElement('div');
    div.className = 'track-item';
    div.dataset.index = i;

    const num = document.createElement('span');
    num.className = 'track-num';
    num.textContent = i + 1;
    const name = document.createElement('span');
    name.className = 'track-name';
    name.textContent = track.name;
    const time = document.createElement('span');
    time.className = 'track-time';
    time.textContent = formatTime(track.time);
    div.appendChild(num);
    div.appendChild(name);
    div.appendChild(time);

    div.addEventListener('click', () => seekTo(track.time));
    el.appendChild(div);
  });

  el.classList.add('visible');
}

export function updateActiveTrack(currentSeconds) {
  if (currentTracks.length === 0) return;

  let idx = -1;
  for (let i = currentTracks.length - 1; i >= 0; i--) {
    if (currentSeconds >= currentTracks[i].time) {
      idx = i;
      break;
    }
  }

  if (idx === currentTrackIndex) return;
  currentTrackIndex = idx;

  if (idx >= 0) {
    document.getElementById('trackTitle').textContent = currentTracks[idx].name;
  }

  const items = document.querySelectorAll('.track-item');
  items.forEach((item, i) => {
    item.classList.toggle('active', i === idx);
  });

  if (idx >= 0 && items[idx]) {
    items[idx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
