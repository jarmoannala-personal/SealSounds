import { togglePlayPause, seekToPercent } from './player.js';
import { nextTrack, previousTrack } from './tracklist.js';
import { activate, deactivate, cycleNext } from './viz-manager.js';

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

    // Q or ArrowUp to return to album selection
    if (e.key === 'q' || e.key === 'ArrowUp') {
      document.getElementById('searchOverlay').classList.remove('hidden');
      document.getElementById('searchInput').focus();
      return;
    }

    // Arrow keys for track navigation
    if (e.key === 'ArrowRight') nextTrack();
    if (e.key === 'ArrowLeft') previousTrack();

    // Number keys 1-9 to select visualization
    if (e.key >= '1' && e.key <= '9') {
      activate(parseInt(e.key));
    }

    // 0 to return to slideshow mode
    if (e.key === '0') deactivate();

    // S to cycle through visualizations
    if (e.key === 's') cycleNext();

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
    // Show mobile nav when entering listening mode (search overlay hidden)
    const searchOverlay = document.getElementById('searchOverlay');
    const navObserver = new MutationObserver(() => {
      if (searchOverlay.classList.contains('hidden')) {
        mobileNav.classList.remove('hidden');
      } else {
        mobileNav.classList.add('hidden');
      }
    });
    navObserver.observe(searchOverlay, { attributes: true, attributeFilter: ['class'] });

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

  // Album select button (desktop, upper left)
  const albumSelectBtn = document.getElementById('albumSelectBtn');
  if (albumSelectBtn && !isMobile) {
    document.addEventListener('sealsounds:firstplay', () => {
      albumSelectBtn.style.display = 'flex';
    }, { once: true });
    albumSelectBtn.addEventListener('click', () => {
      document.getElementById('searchOverlay').classList.remove('hidden');
      document.getElementById('searchInput').focus();
    });
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
