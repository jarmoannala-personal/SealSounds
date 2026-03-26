// SealSounds — main application entry point

import { guessArtistFromTitle } from './core/utils.js';
import { initYouTubeAPI, on, isTestMode } from './core/player.js';
import { initSearch } from './core/search.js';
import { initControls } from './core/controls.js';
import { fetchTracklist, updateActiveTrack } from './core/tracklist.js';
import { fetchWikimediaImages, getImageCount } from './core/images.js';
import { fetchWikipediaFacts } from './core/facts.js';
import { detectCapabilities, loadPlugins, getPlugin } from './plugins/plugin-loader.js';
import { activate, deactivate } from './core/viz-manager.js';

async function init() {
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

  // When a video loads, fetch artist metadata and tracklist
  on('onLoad', async ({ videoId, title }) => {
    const artist = guessArtistFromTitle(title);
    document.getElementById('trackArtist').textContent = artist;

    // Reset visualization when loading new content
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

    // On mobile, auto-activate a visualization since background images are hidden
    if (window.matchMedia('(max-width: 768px)').matches) {
      activate(1);
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

  console.log('SealSounds v1.1.6 initialized');
}

init();
