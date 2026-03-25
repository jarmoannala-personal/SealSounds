export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
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
