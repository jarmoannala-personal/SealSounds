// SealSounds — main application entry point

import { guessArtistFromTitle, pruneStaleCache, fetchWithTimeout, decodeEntities } from './core/utils.js';
import { initYouTubeAPI, on, isTestMode, loadVideo, loadPlaylist } from './core/player.js';
import { initSearch } from './core/search.js';
import { initControls } from './core/controls.js';
import { fetchTracklist, fetchPlaylistTracks, updateActiveTrack, updateActivePlaylistVideo } from './core/tracklist.js';
import { fetchWikimediaImages, getImageCount } from './core/images.js';
import { fetchWikipediaFacts } from './core/facts.js';
import { detectCapabilities, loadPlugins, getPlugin } from './plugins/plugin-loader.js';
import { activate, deactivate } from './core/viz-manager.js';

async function init() {
  // Prune stale cache entries from localStorage
  const CACHE_TTL = 3 * 24 * 60 * 60 * 1000; // 3 days
  pruneStaleCache('ss_search_', CACHE_TTL);
  pruneStaleCache('ss_tracks_', CACHE_TTL);
  pruneStaleCache('ss_pltracks_', CACHE_TTL);

  // Detect device capabilities and load visual plugins
  const caps = detectCapabilities();
  await loadPlugins(caps);

  // Show ambient effect on search screen if available
  const ambient = getPlugin('ambient');
  if (ambient) ambient.show();

  // Initialize YouTube API
  await initYouTubeAPI();

  // Initialize UI modules
  initSearch();
  initControls();

  // Watch for search overlay visibility to toggle ambient effect
  const searchOverlay = document.getElementById('searchOverlay');
  const observer = new MutationObserver(() => {
    if (ambient) {
      if (searchOverlay.classList.contains('hidden')) {
        ambient.hide();
      } else {
        ambient.show();
      }
    }
  });
  observer.observe(searchOverlay, { attributes: true, attributeFilter: ['class'] });

  // When a video or playlist loads, fetch artist metadata and tracklist
  on('onLoad', async ({ videoId, playlistId, title, kind }) => {
    const artist = guessArtistFromTitle(title);
    document.getElementById('trackArtist').textContent = artist;

    // Reset visualization when loading new content
    clearInterval(mobileCycleTimer);
    deactivate();

    if (isTestMode()) {
      // Test mode — skip external API calls, default to slideshow
      document.getElementById('factText').textContent = 'Test mode — no external API calls.';
      fetchTracklist(videoId);
      return;
    }

    await Promise.all([
      fetchWikipediaFacts(artist),
      fetchWikimediaImages(artist),
    ]);
    if (kind === 'playlist' && playlistId) {
      fetchPlaylistTracks(playlistId);
    } else if (videoId) {
      fetchTracklist(videoId);
    }

    // On mobile: use images if available, otherwise mandelbrot
    if (window.matchMedia('(max-width: 768px)').matches) {
      if (getImageCount() === 0) {
        activate(1); // No images — start with mandelbrot
      } else {
        deactivate(); // Images available — slideshow mode
        startMobileMandelbrotCycle();
      }
    }
  });

  // Update active track as playback progresses
  on('onProgress', ({ current }) => {
    updateActiveTrack(current);
  });

  // In playlist mode, update the active track when the player advances videos
  on('onPlaylistVideoChange', ({ index }) => {
    updateActivePlaylistVideo(index);
  });

  // Notify audio-reactive plugins of play/pause state
  function setPluginsPlaying(state) {
    const vu = getPlugin('vu meters');
    const spectrum = getPlugin('spectrum');
    if (vu && vu.setPlaying) vu.setPlaying(state);
    if (spectrum && spectrum.setPlaying) spectrum.setPlaying(state);
  }

  on('onPlay', () => setPluginsPlaying(true));
  on('onPause', () => setPluginsPlaying(false));

  // Check URL for shared link — done last so onLoad listeners are registered.
  // Supports ?list=PLAYLIST_ID (preferred if both are present) and ?v=VIDEO_ID.
  const params = new URLSearchParams(window.location.search);
  const urlPlaylistId = params.get('list');
  const urlVideoId = params.get('v');
  const idLike = /^[a-zA-Z0-9_-]+$/;
  if (urlPlaylistId && idLike.test(urlPlaylistId)) {
    try {
      const { CONFIG } = await import('./config.js');
      const resp = await fetchWithTimeout(`https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${urlPlaylistId}&key=${CONFIG.YOUTUBE_API_KEY}`);
      const data = await resp.json();
      if (data.items && data.items[0]) {
        const snippet = data.items[0].snippet;
        const thumb = snippet.thumbnails && (snippet.thumbnails.high || snippet.thumbnails.default);
        loadPlaylist(urlPlaylistId, decodeEntities(snippet.title), thumb ? thumb.url : '');
      }
    } catch (e) {
      console.warn('Failed to load shared playlist:', e);
    }
  } else if (urlVideoId && idLike.test(urlVideoId)) {
    try {
      const { CONFIG } = await import('./config.js');
      const resp = await fetchWithTimeout(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${urlVideoId}&key=${CONFIG.YOUTUBE_API_KEY}`);
      const data = await resp.json();
      if (data.items && data.items[0]) {
        const snippet = data.items[0].snippet;
        loadVideo(urlVideoId, decodeEntities(snippet.title), snippet.thumbnails.high.url);
      }
    } catch (e) {
      console.warn('Failed to load shared video:', e);
    }
  }

  console.log('SealSounds v1.3.0 initialized');
}

// Mobile: periodically show mandelbrot between image slideshows
let mobileCycleTimer = null;

function startMobileMandelbrotCycle() {
  clearInterval(mobileCycleTimer);
  let showingMandelbrot = false;

  // Every 3 minutes, toggle between mandelbrot and slideshow
  mobileCycleTimer = setInterval(() => {
    if (showingMandelbrot) {
      deactivate(); // Back to images
    } else {
      activate(1);  // Show mandelbrot
    }
    showingMandelbrot = !showingMandelbrot;
  }, 3 * 60 * 1000);
}

init();
