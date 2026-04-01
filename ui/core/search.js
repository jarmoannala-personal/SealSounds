import { CONFIG } from '../config.js';
import { loadVideo, setLastSearchResults, loadTestVideo } from './player.js';
import { fetchWithTimeout } from './utils.js';

// In-memory + localStorage cache for search results
const searchCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

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
    if (query.length > 2) {
      searchYouTube(query);
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
    // Step 1: Search for videos (100 units)
    console.log(`[API] Search "${query}" — calling YouTube search.list (100 units)`);
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query + ' full album')}&type=video&videoDuration=long&maxResults=12&key=${CONFIG.YOUTUBE_API_KEY}`;
    const searchResp = await fetchWithTimeout(searchUrl);
    const searchData = await searchResp.json();

    if (searchData.error) {
      resultsContainer.innerHTML = `<div class="loading">API error: ${searchData.error.message}</div>`;
      return;
    }

    const searchItems = searchData.items || [];
    if (searchItems.length === 0) {
      resultsContainer.innerHTML = '<div class="loading">No results found.</div>';
      return;
    }

    // Step 2: Check which videos allow embedding (1 unit)
    console.log(`[API] Checking embeddability for ${searchItems.length} videos — calling videos.list (1 unit)`);
    const videoIds = searchItems.map(i => i.id.videoId).join(',');
    const statusUrl = `https://www.googleapis.com/youtube/v3/videos?part=status,contentDetails&id=${videoIds}&key=${CONFIG.YOUTUBE_API_KEY}`;
    const statusResp = await fetchWithTimeout(statusUrl);
    const statusData = await statusResp.json();

    const embeddable = new Set();
    for (const video of (statusData.items || [])) {
      if (video.status && video.status.embeddable) {
        embeddable.add(video.id);
      }
    }

    const items = searchItems.filter(i => embeddable.has(i.id.videoId));

    if (items.length === 0) {
      resultsContainer.innerHTML = '<div class="loading">No embeddable results found. Try a different search.</div>';
      return;
    }

    // Cache the results
    setCachedSearch(query, items);
    renderResults(items);
  } catch (err) {
    resultsContainer.innerHTML = `<div class="loading">Search failed: ${err.message}</div>`;
  }
}

function renderResults(items) {
  const resultsContainer = document.getElementById('searchResults');
  resultsContainer.innerHTML = '';

  items.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'search-result';

    const img = document.createElement('img');
    img.src = item.snippet.thumbnails.default.url;
    img.alt = '';

    const info = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'result-title';
    title.textContent = item.snippet.title;
    const channel = document.createElement('div');
    channel.className = 'result-channel';
    channel.textContent = item.snippet.channelTitle;
    info.appendChild(title);
    info.appendChild(channel);

    div.appendChild(img);
    div.appendChild(info);

    div.addEventListener('click', () => {
      setLastSearchResults(items.slice(index + 1).map(i => ({
        id: i.id.videoId,
        title: i.snippet.title,
        thumbnail: i.snippet.thumbnails.high.url,
      })));
      document.getElementById('errorToast').style.display = 'none';
      loadVideo(
        item.id.videoId,
        item.snippet.title,
        item.snippet.thumbnails.high.url
      );
    });
    resultsContainer.appendChild(div);
  });
}
