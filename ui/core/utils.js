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

const NAMED_ENTITIES = {
  quot: '"', amp: '&', lt: '<', gt: '>', apos: "'",
  nbsp: ' ', copy: '©', reg: '®', trade: '™',
  hellip: '…', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

export function decodeEntities(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      if (!Number.isFinite(code)) return match;
      try { return String.fromCodePoint(code); } catch (e) { return match; }
    }
    const decoded = NAMED_ENTITIES[entity.toLowerCase()];
    return decoded !== undefined ? decoded : match;
  });
}

// Parse a YouTube URL string and return { kind, id, videoId? } or null.
// Recognises standard watch URLs, youtu.be short URLs, and /playlist URLs.
// Bare 11-char video IDs and PL-prefixed playlist IDs are also accepted.
export function parseYouTubeUrl(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const idLike = /^[A-Za-z0-9_-]+$/;

  // Bare video ID (11 chars) or playlist ID (starts with PL/UU/LL/RD/FL/OL etc.)
  if (idLike.test(trimmed)) {
    if (/^(PL|UU|LL|RD|FL|OL|TL)[A-Za-z0-9_-]{10,}$/.test(trimmed)) {
      return { kind: 'playlist', id: trimmed };
    }
    if (trimmed.length === 11) return { kind: 'video', id: trimmed };
    return null;
  }

  let url;
  try { url = new URL(trimmed); } catch (e) { return null; }
  if (!/(^|\.)youtube\.com$|^youtu\.be$/i.test(url.hostname)) return null;

  const list = url.searchParams.get('list');
  let v = url.searchParams.get('v');
  if (!v && url.hostname.toLowerCase() === 'youtu.be') {
    v = url.pathname.replace(/^\//, '').split('/')[0];
  }

  if (list && idLike.test(list)) {
    return v && idLike.test(v)
      ? { kind: 'playlist', id: list, videoId: v }
      : { kind: 'playlist', id: list };
  }
  if (v && idLike.test(v)) return { kind: 'video', id: v };
  return null;
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
