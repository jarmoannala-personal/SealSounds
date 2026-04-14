# SealSounds

A distraction-free album listening room. No ads, no comments, no commercial breaks -- just music, art, and context.

SealSounds plays full albums from YouTube in a clean environment enriched with artist photos from Wikimedia Commons, facts from Wikipedia, and 9 WebGL visualizations.

## Features

- **Album search** -- finds full album videos on YouTube, auto-skips videos that block embedding
- **Shareable album URLs** -- `?v=<videoId>` links open the same album with full context
- **Artist context** -- Wikipedia facts and Wikimedia Commons photos displayed during playback
- **Tracklist parsing** -- extracts track timestamps from video descriptions and comments, deduplicates multi-language entries
- **9 visualizations** -- Mandelbrot zoom, VU Meters, Spectrum Analyzer, Starfield, Butterflies, Aurora City, Rainforest, Volumetric Clouds, Highland Landscape
- **Adaptive rendering** -- GPU-heavy shaders auto-adjust resolution to maintain smooth playback
- **Mobile responsive** -- touch gestures (swipe for tracks), background images with auto-cycling Mandelbrot
- **Caching** -- search results and tracklist data cached in localStorage (3-day TTL) to reduce API usage
- **Desktop app** -- Tauri wrapper embeds the UI for native macOS/Windows experience

## Setup

### Web (hosted)

1. Copy `ui/config.example.js` to `ui/config.js`
2. Add your [YouTube Data API v3](https://console.cloud.google.com/apis/credentials) key
3. Serve the `ui/` directory with any web server

### Desktop (Tauri)

Requires [Rust](https://rustup.rs/) and Tauri CLI:

```bash
cd src-tauri
cargo build --release
```

Binary output: `src-tauri/target/release/seal-sounds`

### Development

```bash
npm install
npm test        # run tests (vitest)
npm run test:watch  # watch mode
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| Left / Right | Previous / Next track |
| 0 | Slideshow mode (artist images) |
| 1-9 | Select visualization |
| S | Cycle visualizations |
| F | Toggle fullscreen |
| Y | Expand YouTube player to fill the viewport |
| Q / Up | Return to album selection |
| Escape | Search / Back |
| I | Info screen |
| H | Version history |

## Mobile Controls

- **Swipe left/right** to change tracks
- **Back arrow** (top left) to return to album search
- **Info button** (top right) for about screen
- **"Back to album" button** on search screen to return to playing album

## Architecture

```
ui/
  app.js              -- entry point, orchestrates startup
  index.html          -- single page structure
  styles.css          -- all styling (responsive)
  core/
    player.js         -- YouTube IFrame API wrapper
    search.js         -- album search with caching
    tracklist.js      -- timestamp parsing
    controls.js       -- keyboard/touch/UI handlers
    images.js         -- Wikimedia image fetching
    facts.js          -- Wikipedia facts
    viz-manager.js    -- visualization switching
    utils.js          -- helpers (formatTime, fetchWithTimeout)
  plugins/
    plugin-loader.js  -- capability detection, plugin registry
    ambient/          -- smoke effect (search screen)
    mandelbrot/       -- fractal zoom (6 locations)
    vu-meters/        -- analog VU meter dials
    spectrum/         -- bar-graph frequency display
    starfield/        -- flying through stars
    butterflies/      -- 3D raymarched butterflies
    aurora/           -- city + starfield + light ribbons
    rainforest/       -- layered jungle landscape
    clouds/           -- volumetric raymarched clouds
    highland/         -- 3D terrain with trees and fog
src-tauri/            -- Tauri desktop wrapper (Rust)
```

## API Usage

SealSounds uses three external APIs (no authentication needed except YouTube):

- **YouTube Data API v3** -- album search (100 units/search), video metadata (1 unit), comments (1 unit)
- **Wikipedia MediaWiki API** -- artist facts (CORS-enabled, no key needed)
- **Wikimedia Commons API** -- artist photos (CORS-enabled, no key needed)

Daily YouTube quota is 10,000 units. Caching (3 days) and Enter-to-search (instead of per-keystroke) keep usage low.

## Security

- Content Security Policy headers (web and Tauri)
- XSS prevention: all user-facing content rendered with `textContent`, not `innerHTML`
- API key separated from source (gitignored `config.js`)
- Fetch timeouts (10s) on all API calls
- Image content filtering (excludes medical/scientific keywords)

## License

MIT — see [LICENSE](LICENSE).
