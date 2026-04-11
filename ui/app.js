// SealSounds — main application entry point

import { guessArtistFromTitle, pruneStaleCache, fetchWithTimeout } from './core/utils.js';
import { initYouTubeAPI, on, isTestMode, loadVideo } from './core/player.js';
import { initSearch } from './core/search.js';
import { initControls } from './core/controls.js';
import { fetchTracklist, updateActiveTrack } from './core/tracklist.js';
import { fetchWikimediaImages, getImageCount } from './core/images.js';
import { fetchWikipediaFacts } from './core/facts.js';
import { detectCapabilities, loadPlugins, getPlugin } from './plugins/plugin-loader.js';
import { activate, deactivate } from './core/viz-manager.js';

async function init() {
  // Prune stale cache entries from localStorage
  const CACHE_TTL = 24 * 60 * 60 * 1000;
  pruneStaleCache('ss_search_', CACHE_TTL);
  pruneStaleCache('ss_tracks_', CACHE_TTL);

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

  // Check URL for shared video link (?v=VIDEO_ID)
  const urlVideoId = new URLSearchParams(window.location.search).get('v');
  if (urlVideoId && /^[a-zA-Z0-9_-]+$/.test(urlVideoId)) {
    try {
      const { CONFIG } = await import('./config.js');
      const resp = await fetchWithTimeout(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${urlVideoId}&key=${CONFIG.YOUTUBE_API_KEY}`);
      const data = await resp.json();
      if (data.items && data.items[0]) {
        const snippet = data.items[0].snippet;
        loadVideo(urlVideoId, snippet.title, snippet.thumbnails.high.url);
      }
    } catch (e) {
      console.warn('Failed to load shared video:', e);
    }
  }

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

  // When a video loads, fetch artist metadata and tracklist
  on('onLoad', async ({ videoId, title }) => {
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
    fetchTracklist(videoId);

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

  // Notify audio-reactive plugins of play/pause state
  function setPluginsPlaying(state) {
    const vu = getPlugin('vu meters');
    const spectrum = getPlugin('spectrum');
    if (vu && vu.setPlaying) vu.setPlaying(state);
    if (spectrum && spectrum.setPlaying) spectrum.setPlaying(state);
  }

  on('onPlay', () => setPluginsPlaying(true));
  on('onPause', () => setPluginsPlaying(false));

  console.log('SealSounds v1.1.15 initialized');
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
