// SealSounds — main application entry point

import { guessArtistFromTitle } from './core/utils.js';
import { initYouTubeAPI, on, isTestMode } from './core/player.js';
import { initSearch } from './core/search.js';
import { initControls } from './core/controls.js';
import { fetchTracklist, updateActiveTrack } from './core/tracklist.js';
import { fetchWikimediaImages, getImageCount } from './core/images.js';
import { fetchWikipediaFacts } from './core/facts.js';
import { detectCapabilities, loadPlugins, getPlugin } from './plugins/plugin-loader.js';

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

    // Hide mandelbrot when loading new content
    const mandelbrot = getPlugin('mandelbrot');
    if (mandelbrot) mandelbrot.hide();

    if (isTestMode()) {
      // Test mode — skip external API calls, show mandelbrot as visual
      document.getElementById('factText').textContent = 'Test mode — no external API calls.';
      fetchTracklist(videoId);
      if (mandelbrot) mandelbrot.show();
      return;
    }

    await Promise.all([
      fetchWikipediaFacts(artist),
      fetchWikimediaImages(artist),
    ]);
    fetchTracklist(videoId);

    // If we have few images, show the Mandelbrot as a visual enhancement
    if (mandelbrot && getImageCount() <= 3) {
      mandelbrot.show();
    }
  });

  // Update active track as playback progresses
  on('onProgress', ({ current }) => {
    updateActiveTrack(current);
  });

  console.log('SealSounds v1.0.0 initialized');
}

init();
