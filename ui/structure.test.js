import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const UI_DIR = resolve(import.meta.dirname);
const indexHtml = readFileSync(join(UI_DIR, 'index.html'), 'utf-8');

// ---------------------------------------------------------------------------
// 1. Cache busting — all asset references must have matching version strings
// ---------------------------------------------------------------------------
describe('cache busting', () => {
  // Extract the version from the version label in index.html (e.g. "v0.10.2")
  const versionMatch = indexHtml.match(/class="version-label">v([\d.]+)</);
  const displayVersion = versionMatch ? versionMatch[1] : null;

  // Extract the cache-bust query params (e.g. "?v=0102")
  const cssVersionMatch = indexHtml.match(/styles\.css\?v=(\w+)/);
  const jsVersionMatch = indexHtml.match(/app\.js\?v=(\w+)/);
  const cssVersion = cssVersionMatch ? cssVersionMatch[1] : null;
  const jsVersion = jsVersionMatch ? jsVersionMatch[1] : null;

  // Extract the version from console.log in app.js
  const appJs = readFileSync(join(UI_DIR, 'app.js'), 'utf-8');
  const consoleVersionMatch = appJs.match(/SealSounds v([\d.]+)/);
  const consoleVersion = consoleVersionMatch ? consoleVersionMatch[1] : null;

  it('has a version label in the UI', () => {
    expect(displayVersion).not.toBeNull();
  });

  it('has cache-bust param on styles.css', () => {
    expect(cssVersion).not.toBeNull();
  });

  it('has cache-bust param on app.js', () => {
    expect(jsVersion).not.toBeNull();
  });

  it('CSS and JS cache-bust versions match each other', () => {
    expect(cssVersion).toBe(jsVersion);
  });

  it('console.log version matches the UI version label', () => {
    expect(consoleVersion).toBe(displayVersion);
  });

  it('cache-bust param is derivable from display version (digits only)', () => {
    // v0.10.2 -> "0102"
    const expected = displayVersion.replace(/\./g, '');
    expect(cssVersion).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// 2. Desktop keyboard shortcuts must have mobile equivalents
// ---------------------------------------------------------------------------
describe('mobile parity with desktop keyboard shortcuts', () => {
  const controlsJs = readFileSync(join(UI_DIR, 'core/controls.js'), 'utf-8');

  // Desktop shortcuts that NEED a mobile equivalent (user-facing actions)
  // Excluded: fullscreen (handled by OS/PWA), mandelbrot & visual mode (optional power-user features)
  const essentialShortcuts = [
    { key: 'Escape (search)', desktopPattern: /Escape/, mobileElement: 'mobileBackBtn' },
    { key: 'I (info)', desktopPattern: /toggleInfo/, mobileElement: 'mobileInfoBtn' },
    { key: 'Space (play/pause)', desktopPattern: /togglePlayPause/, mobileElement: 'playPauseBtn' },
  ];

  for (const shortcut of essentialShortcuts) {
    it(`"${shortcut.key}" has a mobile-accessible element (${shortcut.mobileElement})`, () => {
      // The element must exist in HTML
      expect(indexHtml).toContain(`id="${shortcut.mobileElement}"`);
      // The element must have a click handler in controls.js
      expect(controlsJs).toContain(shortcut.mobileElement);
    });
  }

  it('mobile nav bar exists in HTML', () => {
    expect(indexHtml).toContain('id="mobileNav"');
  });

  it('mobile nav shows on first play', () => {
    expect(controlsJs).toContain("sealsounds:firstplay");
    expect(controlsJs).toContain("mobileNav.classList.remove('hidden')");
  });

  it('search has a clickable submit button', () => {
    expect(indexHtml).toContain('id="searchBtn"');
    const searchJs = readFileSync(join(UI_DIR, 'core/search.js'), 'utf-8');
    expect(searchJs).toContain('searchBtn');
  });
});

// ---------------------------------------------------------------------------
// 3. Desktop vs mobile UI separation
// ---------------------------------------------------------------------------
describe('desktop vs mobile UI separation', () => {
  const stylesCss = readFileSync(join(UI_DIR, 'styles.css'), 'utf-8');

  it('has a mobile breakpoint media query', () => {
    expect(stylesCss).toMatch(/@media\s*\(max-width:\s*768px\)/);
  });

  it('has a desktop breakpoint media query', () => {
    expect(stylesCss).toMatch(/@media\s*\(min-width:\s*769px\)/);
  });

  it('hides mobile nav on desktop', () => {
    // The desktop media query should hide mobile-nav
    const desktopBlock = stylesCss.match(/@media\s*\(min-width:\s*769px\)\s*\{([^}]*\{[^}]*\})*[^}]*\}/);
    expect(desktopBlock).not.toBeNull();
    expect(desktopBlock[0]).toContain('.mobile-nav');
    expect(desktopBlock[0]).toContain('display: none');
  });

  it('hides search hint on mobile', () => {
    const mobileBlock = stylesCss.slice(stylesCss.indexOf('@media (max-width: 768px)'));
    expect(mobileBlock).toContain('.search-hint');
    expect(mobileBlock).toMatch(/\.search-hint\s*\{[^}]*display:\s*none/);
  });

  it('info overlay has desktop-only and mobile-only sections', () => {
    expect(indexHtml).toContain('info-desktop-only');
    expect(indexHtml).toContain('info-mobile-only');
  });

  it('keyboard shortcuts section is desktop-only', () => {
    // The shortcuts grid should be inside a desktop-only section
    const shortcutsSection = indexHtml.match(/info-desktop-only[\s\S]*?shortcuts-grid/);
    expect(shortcutsSection).not.toBeNull();
  });

  it('mobile controls section is mobile-only', () => {
    const mobileSection = indexHtml.match(/info-mobile-only[\s\S]*?Controls/);
    expect(mobileSection).not.toBeNull();
  });
});
