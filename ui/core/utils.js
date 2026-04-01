export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

export function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

export function pruneStaleCache(prefix, ttl) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const stored = JSON.parse(localStorage.getItem(key));
        if (stored && stored.ts && Date.now() - stored.ts > ttl) {
          localStorage.removeItem(key);
        }
      }
    }
  } catch (e) {}
}

export function guessArtistFromTitle(title) {
  const patterns = [
    /^(.+?)\s*[-–—]\s*.+?full\s*album/i,
    /^(.+?)\s*[-–—]\s*/i,
    /^(.+?)\s*full\s*album/i,
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) return m[1].trim();
  }
  return title.split(' ').slice(0, 2).join(' ');
}
