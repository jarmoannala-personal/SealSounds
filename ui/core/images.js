let currentImages = [];
let currentImageIndex = 0;
let imageTimer = null;
let activeBg = 1;

const transitionEffects = [
  { start: 'scale(1)', end: 'scale(1.15)', filter: 'none' },
  { start: 'scale(1.2)', end: 'scale(1)', filter: 'none' },
  { start: 'scale(1.15) translateX(-5%)', end: 'scale(1.15) translateX(5%)', filter: 'none' },
  { start: 'scale(1.15) translateX(5%)', end: 'scale(1.15) translateX(-5%)', filter: 'none' },
  { start: 'scale(1) rotate(0deg)', end: 'scale(1.12) rotate(1.5deg)', filter: 'none' },
  { start: 'scale(1)', end: 'scale(1.1)', filter: 'sepia(0.3) saturate(1.3)' },
  { start: 'scale(1.15) translateY(3%)', end: 'scale(1.15) translateY(-3%)', filter: 'saturate(0.8) brightness(1.1)' },
  { start: 'scale(1.05)', end: 'scale(1.18)', filter: 'contrast(1.15) brightness(1.05)' },
  { start: 'scale(1.1) translate(-3%, 2%)', end: 'scale(1.1) translate(3%, -2%)', filter: 'saturate(0.7)' },
  { start: 'scale(1)', end: 'scale(1.08)', filter: 'brightness(1.15) blur(1px)' },
];

export function getImageCount() {
  return currentImages.length;
}

export async function fetchWikimediaImages(artist) {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(artist + ' band')}&gsrlimit=15&prop=imageinfo&iiprop=url|mime&iiurlwidth=1920&format=json&origin=*`;
    const resp = await fetch(url);
    const data = await resp.json();

    const images = extractImages(data);

    if (images.length === 0) {
      return fetchWikimediaImagesFallback(artist);
    }

    setImages(images);
  } catch (err) {
    console.error('Wikimedia fetch failed:', err);
  }
}

async function fetchWikimediaImagesFallback(artist) {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(artist)}&gsrlimit=10&prop=imageinfo&iiprop=url|mime&iiurlwidth=1920&format=json&origin=*`;
    const resp = await fetch(url);
    const data = await resp.json();

    const images = extractImages(data);
    if (images.length > 0) {
      setImages(images);
    }
  } catch (err) {
    console.error('Fallback image fetch failed:', err);
  }
}

function extractImages(data) {
  const images = [];
  if (data.query && data.query.pages) {
    for (const page of Object.values(data.query.pages)) {
      if (page.imageinfo && page.imageinfo[0]) {
        const info = page.imageinfo[0];
        if (info.mime && info.mime.startsWith('image/') && info.mime !== 'image/svg+xml') {
          images.push(info.thumburl || info.url);
        }
      }
    }
  }
  return images;
}

function setImages(images) {
  currentImages = images;
  currentImageIndex = 0;
  showNextImage();
  startImageRotation();
}

export function showNextImage() {
  if (currentImages.length === 0) return;

  const nextIndex = currentImageIndex % currentImages.length;
  const imageUrl = currentImages[nextIndex];
  const effect = transitionEffects[Math.floor(Math.random() * transitionEffects.length)];

  const img = new Image();
  img.onload = () => {
    const nextBg = activeBg === 1 ? 2 : 1;
    const nextEl = document.getElementById('bg' + nextBg);
    const currEl = document.getElementById('bg' + activeBg);

    nextEl.style.transition = 'none';
    nextEl.style.transform = effect.start;
    nextEl.style.filter = effect.filter;
    nextEl.style.backgroundImage = `url(${imageUrl})`;

    nextEl.offsetHeight; // force reflow

    nextEl.style.transition = 'opacity 2s ease-in-out, transform 20s ease-in-out, filter 2s ease-in-out';
    nextEl.style.transform = effect.end;
    nextEl.classList.add('active');
    currEl.classList.remove('active');

    activeBg = nextBg;
  };
  img.src = imageUrl;

  currentImageIndex++;
}

function startImageRotation() {
  clearInterval(imageTimer);
  imageTimer = setInterval(showNextImage, 20000);
}
