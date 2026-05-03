import { CONFIG } from '../config.js';
import { loadVideo, loadPlaylist, setLastSearchResults, loadTestVideo } from './player.js';
import { fetchWithTimeout, decodeEntities, parseYouTubeUrl } from './utils.js';

// In-memory + localStorage cache for search results
const searchCache = new Map();
const CACHE_TTL = 3 * 24 * 60 * 60 * 1000; // 3 days

function getCachedSearch(query) {
  const key = query.toLowerCase();

  // Check in-memory first
  const mem = searchCache.get(key);
  if (mem && Date.now() - mem.ts < CACHE_TTL) return mem.data;

  // Check localStorage
  try {
    const stored = localStorage.getItem('ss_search_' + key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Date.now() - parsed.ts < CACHE_TTL) {
        searchCache.set(key, parsed);
        return parsed.data;
      }
      localStorage.removeItem('ss_search_' + key);
    }
  } catch (e) {}

  return null;
}

function setCachedSearch(query, data) {
  const key = query.toLowerCase();
  const entry = { data, ts: Date.now() };
  searchCache.set(key, entry);
  try {
    localStorage.setItem('ss_search_' + key, JSON.stringify(entry));
  } catch (e) {}
}

export function initSearch() {
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');

  // iOS: tapping the search overlay should focus the input
  document.getElementById('searchOverlay').addEventListener('touchend', (e) => {
    // Only focus if they didn't tap a search result
    if (e.target.closest('.search-result')) return;
    searchInput.focus();
  });

  function submitSearch() {
    const query = searchInput.value.trim();
    if (query.toLowerCase() === 'testalbum') {
      loadTestVideo('Test Artist — Greatest Hits (Full Album)');
      return;
    }
    // If the user pasted a YouTube URL or bare ID, load it directly.
    const parsed = parseYouTubeUrl(query);
    if (parsed) {
      loadByParsedRef(parsed);
      return;
    }
    if (query.length > 2) {
      searchYouTube(query);
    }
  }

  async function loadByParsedRef(ref) {
    const resultsContainer = document.getElementById('searchResults');
    if (!CONFIG.YOUTUBE_API_KEY) {
      resultsContainer.innerHTML = '<div class="loading">No API key configured.</div>';
      return;
    }
    resultsContainer.innerHTML = '<div class="loading">Loading…</div>';
    try {
      if (ref.kind === 'playlist') {
        const url = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${ref.id}&key=${CONFIG.YOUTUBE_API_KEY}`;
        const resp = await fetchWithTimeout(url);
        const data = await resp.json();
        if (!data.items || !data.items[0]) {
          resultsContainer.innerHTML = '<div class="loading">Playlist not found.</div>';
          return;
        }
        const sn = data.items[0].snippet;
        const thumb = sn.thumbnails && (sn.thumbnails.high || sn.thumbnails.default);
        loadPlaylist(ref.id, decodeEntities(sn.title), thumb ? thumb.url : '');
      } else {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ref.id}&key=${CONFIG.YOUTUBE_API_KEY}`;
        const resp = await fetchWithTimeout(url);
        const data = await resp.json();
        if (!data.items || !data.items[0]) {
          resultsContainer.innerHTML = '<div class="loading">Video not found.</div>';
          return;
        }
        const sn = data.items[0].snippet;
        loadVideo(ref.id, decodeEntities(sn.title), sn.thumbnails.high.url);
      }
    } catch (err) {
      resultsContainer.innerHTML = `<div class="loading">Failed to load: ${err.message}</div>`;
    }
  }

  // Clear stale results when user types a new query
  searchInput.addEventListener('input', () => {
    document.getElementById('searchResults').innerHTML = '';
  });

  // Search on Enter key
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = searchInput.value.trim();

      // Hidden test mode — bypass API entirely
      if (query.toLowerCase() === 'testalbum') {
        loadTestVideo('Test Artist — Greatest Hits (Full Album)');
        return;
      }

      // Pasted YouTube URL — load directly without searching
      const parsed = parseYouTubeUrl(query);
      if (parsed) {
        loadByParsedRef(parsed);
        return;
      }

      const firstResult = document.querySelector('.search-result');
      if (firstResult && document.getElementById('searchResults').children.length > 0) {
        // If results already showing, Enter selects the first one
        firstResult.click();
      } else {
        submitSearch();
      }
    }
  });

  // Search button click
  if (searchBtn) {
    searchBtn.addEventListener('click', submitSearch);
  }
}

async function searchYouTube(query) {
  const resultsContainer = document.getElementById('searchResults');

  if (!CONFIG.YOUTUBE_API_KEY) {
    resultsContainer.innerHTML = `
      <div class="loading">
        <p>No API key configured.</p>
        <p style="margin-top:8px; font-size:13px; color:rgba(255,255,255,0.4);">
          Set YOUTUBE_API_KEY in config.js<br>
          Get a free key at console.cloud.google.com &rarr; YouTube Data API v3
        </p>
      </div>`;
    return;
  }

  // Check cache first
  const cached = getCachedSearch(query);
  if (cached) {
    console.log(`[API] Search "${query}" — cache hit (0 units)`);
    renderResults(cached);
    return;
  }

  resultsContainer.innerHTML = '<div class="loading">Searching...</div>';

  try {
    const q = encodeURIComponent(query + ' full album');
    const key = CONFIG.YOUTUBE_API_KEY;
    const videoSearchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=video&videoDuration=long&maxResults=10&key=${key}`;
    const playlistSearchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=playlist&maxResults=6&key=${key}`;

    console.log(`[API] Search "${query}" — videos.list + playlists.list (200 units)`);
    const [videoResp, playlistResp] = await Promise.all([
      fetchWithTimeout(videoSearchUrl),
      fetchWithTimeout(playlistSearchUrl),
    ]);
    const [videoData, playlistData] = await Promise.all([videoResp.json(), playlistResp.json()]);

    if (videoData.error && playlistData.error) {
      resultsContainer.innerHTML = `<div class="loading">API error: ${videoData.error.message}</div>`;
      return;
    }

    const videoSearchItems = (videoData.items || []).filter(i => i.id && i.id.videoId);
    const playlistSearchItems = (playlistData.items || []).filter(i => i.id && i.id.playlistId);

    // Embeddability check for video results (1 unit)
    let embeddableVideos = [];
    if (videoSearchItems.length > 0) {
      console.log(`[API] Checking embeddability for ${videoSearchItems.length} videos — videos.list (1 unit)`);
      const videoIds = videoSearchItems.map(i => i.id.videoId).join(',');
      const statusUrl = `https://www.googleapis.com/youtube/v3/videos?part=status&id=${videoIds}&key=${key}`;
      const statusResp = await fetchWithTimeout(statusUrl);
      const statusData = await statusResp.json();
      const embeddable = new Set();
      for (const video of (statusData.items || [])) {
        if (video.status && video.status.embeddable) embeddable.add(video.id);
      }
      embeddableVideos = videoSearchItems.filter(i => embeddable.has(i.id.videoId));
    }

    const items = [
      ...embeddableVideos.map(i => ({ kind: 'video', id: i.id.videoId, snippet: i.snippet })),
      ...playlistSearchItems.map(i => ({ kind: 'playlist', id: i.id.playlistId, snippet: i.snippet })),
    ];

    if (items.length === 0) {
      resultsContainer.innerHTML = '<div class="loading">No results found.</div>';
      return;
    }

    setCachedSearch(query, items);
    renderResults(items);
  } catch (err) {
    resultsContainer.innerHTML = `<div class="loading">Search failed: ${err.message}</div>`;
  }
}

// Adapt cached items written before the unified shape was introduced.
// Raw YouTube search-result items also carry a `kind` field (set to
// "youtube#searchResult") on the outer object, so check for our specific
// normalized values rather than truthiness.
function normalizeItem(item) {
  if (!item) return null;
  if (item.kind === 'video' || item.kind === 'playlist') return item;
  if (item.id && typeof item.id === 'object') {
    if (item.id.videoId) {
      return { kind: 'video', id: item.id.videoId, snippet: item.snippet };
    }
    if (item.id.playlistId) {
      return { kind: 'playlist', id: item.id.playlistId, snippet: item.snippet };
    }
  }
  return null;
}

function renderResults(rawItems) {
  const items = (rawItems || []).map(normalizeItem).filter(Boolean);
  const resultsContainer = document.getElementById('searchResults');
  resultsContainer.innerHTML = '';

  items.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'search-result';

    const img = document.createElement('img');
    const thumbs = item.snippet.thumbnails || {};
    img.src = (thumbs.default && thumbs.default.url) || (thumbs.medium && thumbs.medium.url) || '';
    img.alt = '';

    const info = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'result-title';
    title.textContent = decodeEntities(item.snippet.title);
    if (item.kind === 'playlist') {
      const badge = document.createElement('span');
      badge.className = 'result-badge';
      badge.textContent = 'Playlist';
      title.appendChild(badge);
    }
    const channel = document.createElement('div');
    channel.className = 'result-channel';
    channel.textContent = decodeEntities(item.snippet.channelTitle || '');
    info.appendChild(title);
    info.appendChild(channel);

    div.appendChild(img);
    div.appendChild(info);

    div.addEventListener('click', () => {
      // Build a fallback list of *video* results that follow this one — used to
      // auto-skip an embed-blocked video. Playlists are excluded.
      const fallback = items
        .slice(index + 1)
        .filter(i => i.kind === 'video')
        .map(i => ({
          id: i.id,
          title: decodeEntities(i.snippet.title),
          thumbnail: (i.snippet.thumbnails && i.snippet.thumbnails.high && i.snippet.thumbnails.high.url) || '',
        }));
      setLastSearchResults(fallback);
      document.getElementById('errorToast').style.display = 'none';

      const titleText = decodeEntities(item.snippet.title);
      const thumbHi = item.snippet.thumbnails && item.snippet.thumbnails.high && item.snippet.thumbnails.high.url;
      if (item.kind === 'playlist') {
        loadPlaylist(item.id, titleText, thumbHi || '');
      } else {
        loadVideo(item.id, titleText, thumbHi || '');
      }
    });
    resultsContainer.appendChild(div);
  });
}
