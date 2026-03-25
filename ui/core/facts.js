let currentFacts = [];
let currentFactIndex = 0;
let factTimer = null;

// Decode HTML entities like &#91; &amp; etc.
const _decoder = document.createElement('textarea');
function decodeEntities(str) {
  _decoder.innerHTML = str;
  return _decoder.value;
}

export function getFactCount() {
  return currentFacts.length;
}

export async function fetchWikipediaFacts(artist) {
  try {
    // Use MediaWiki API with origin=* for CORS support
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(artist)}&prop=extracts&exintro=true&explaintext=true&format=json&origin=*`;
    const resp = await fetch(url);
    const data = await resp.json();

    let facts = [];

    // Extract intro text from the API response
    const pages = data.query && data.query.pages;
    if (pages) {
      const page = Object.values(pages)[0];
      if (page && page.extract) {
        const extract = decodeEntities(page.extract);
        const sentences = extract.match(/[^.!?]+[.!?]+/g) || [extract];
        facts = sentences
          .map(s => s.trim())
          .filter(s => s.length > 30 && s.length < 300);
      }
    }

    // Also try to get the full article for more facts (using MediaWiki API with CORS)
    try {
      const parseUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(artist)}&prop=text&format=json&origin=*`;
      const parseResp = await fetch(parseUrl);
      const parseData = await parseResp.json();

      if (parseData.parse && parseData.parse.text) {
        const html = parseData.parse.text['*'] || '';
        // Extract text from paragraphs only (skip tables, lists, etc.)
        const paragraphs = html.match(/<p[^>]*>(.*?)<\/p>/gs) || [];
        for (const p of paragraphs) {
          const text = decodeEntities(p.replace(/<[^>]+>/g, ''))
            .replace(/\[\d+\]/g, '')  // remove [1] [2] etc.
            .replace(/\s+/g, ' ')
            .trim();
          const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
          const interesting = sentences
            .map(s => s.trim())
            .filter(s => s.length > 40 && s.length < 280 && !s.includes('citation'));
          facts.push(...interesting.slice(0, 2));
        }
      }
    } catch (e) {
      console.log('Could not fetch full article:', e);
    }

    if (facts.length === 0) {
      facts = [`${artist} — enjoy the music.`];
    }

    currentFacts = facts;
    currentFactIndex = 0;
    showNextFact();
    startFactRotation();
  } catch (err) {
    console.error('Wikipedia fetch failed:', err);
    currentFacts = [`Now playing: ${artist}`];
    showNextFact();
  }
}

export function showNextFact() {
  if (currentFacts.length === 0) return;
  const fact = currentFacts[currentFactIndex % currentFacts.length];
  const el = document.getElementById('factText');
  el.style.opacity = 0;
  setTimeout(() => {
    el.textContent = fact;
    el.style.opacity = 1;
  }, 500);
  currentFactIndex++;
}

function startFactRotation() {
  clearInterval(factTimer);
  factTimer = setInterval(showNextFact, 12000);
}
