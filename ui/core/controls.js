import { togglePlayPause, seekToPercent } from './player.js';
import { nextTrack, previousTrack } from './tracklist.js';
import { getPlugin } from '../plugins/plugin-loader.js';

let effectsMode = false;

function toggleVisualMode() {
  effectsMode = !effectsMode;
  const mandelbrot = getPlugin('mandelbrot');

  if (effectsMode) {
    document.getElementById('bg1').style.display = 'none';
    document.getElementById('bg2').style.display = 'none';
    if (mandelbrot) mandelbrot.show();
  } else {
    document.getElementById('bg1').style.display = '';
    document.getElementById('bg2').style.display = '';
    if (mandelbrot) mandelbrot.hide();
  }
}

function toggleInfo() {
  const infoOverlay = document.getElementById('infoOverlay');
  infoOverlay.classList.toggle('hidden');
}

export function initControls() {
  // Play/pause button
  document.getElementById('playPauseBtn').addEventListener('click', togglePlayPause);

  // Progress bar seek
  document.getElementById('progressBar').addEventListener('click', (e) => {
    const rect = e.target.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    seekToPercent(pct);
  });

  // Info link on search screen
  document.getElementById('infoLink').addEventListener('click', toggleInfo);

  // Close info overlay on click (outside panel)
  // Close info overlay — on mobile tap anywhere, on desktop click outside panel
  document.getElementById('infoOverlay').addEventListener('click', (e) => {
    const isMobileView = window.matchMedia('(max-width: 768px)').matches;
    if (isMobileView || e.target === document.getElementById('infoOverlay')) {
      toggleInfo();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const searchOverlay = document.getElementById('searchOverlay');
    const infoOverlay = document.getElementById('infoOverlay');

    // I to toggle info (works everywhere)
    if (e.key === 'i' && document.activeElement.tagName !== 'INPUT') {
      toggleInfo();
      return;
    }

    // Escape — close info first, then toggle search
    if (e.key === 'Escape') {
      if (!infoOverlay.classList.contains('hidden')) {
        toggleInfo();
        return;
      }
      if (!searchOverlay.classList.contains('hidden')) {
        searchOverlay.classList.add('hidden');
      } else {
        searchOverlay.classList.remove('hidden');
        document.getElementById('searchInput').focus();
      }
      return;
    }

    // Everything below only when search is hidden and not typing
    if (!searchOverlay.classList.contains('hidden')) return;
    if (!infoOverlay.classList.contains('hidden')) return;

    // Spacebar to toggle play/pause
    if (e.key === ' ') {
      e.preventDefault();
      togglePlayPause();
    }

    // Arrow keys for track navigation
    if (e.key === 'ArrowRight') nextTrack();
    if (e.key === 'ArrowLeft') previousTrack();

    // M to toggle Mandelbrot visual
    if (e.key === 'm') {
      const mandelbrot = getPlugin('mandelbrot');
      if (mandelbrot) mandelbrot.toggle();
    }

    // S to toggle between slideshow and effects mode
    if (e.key === 's') toggleVisualMode();

    // F to toggle fullscreen
    if (e.key === 'f') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }
  });

  // Click background to toggle play/pause (desktop only — overlay hidden on mobile)
  const overlayEl = document.querySelector('.overlay');
  if (overlayEl) {
    overlayEl.addEventListener('click', () => {
      const searchOverlay = document.getElementById('searchOverlay');
      if (searchOverlay.classList.contains('hidden')) {
        togglePlayPause();
      }
    });
  }

  // Mobile nav buttons
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const mobileNav = document.getElementById('mobileNav');
  const mobileBackBtn = document.getElementById('mobileBackBtn');
  const mobileInfoBtn = document.getElementById('mobileInfoBtn');

  if (isMobile && mobileNav) {
    // Show mobile nav when playing
    document.addEventListener('sealsounds:firstplay', () => {
      mobileNav.classList.remove('hidden');
    }, { once: true });

    if (mobileBackBtn) {
      mobileBackBtn.addEventListener('click', () => {
        document.getElementById('searchOverlay').classList.remove('hidden');
        document.getElementById('searchInput').focus();
      });
    }

    if (mobileInfoBtn) {
      mobileInfoBtn.addEventListener('click', () => {
        toggleInfo();
      });
    }
  }

  // Search hint (desktop)
  document.getElementById('searchHint').addEventListener('click', () => {
    document.getElementById('searchOverlay').classList.remove('hidden');
    document.getElementById('searchInput').focus();
  });

  // Swipe left/right to change tracks (mobile)
  let touchStartX = 0;
  let touchStartY = 0;
  document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    // Only trigger if horizontal swipe is dominant and long enough
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const searchOverlay = document.getElementById('searchOverlay');
      if (searchOverlay.classList.contains('hidden')) {
        if (dx < 0) nextTrack();      // swipe left = next
        else previousTrack();          // swipe right = previous
      }
    }
  }, { passive: true });
}
