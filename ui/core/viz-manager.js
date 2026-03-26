// Visualization manager — handles switching between exclusive playback visualizations

const registry = []; // { slot, name, plugin }
let activeSlot = 0;  // 0 = slideshow mode (background images)
let labelTimeout = null;

export function registerVisualization(name, plugin) {
  const slot = registry.length + 1;
  registry.push({ slot, name, plugin });
}

export function activate(slot) {
  const entry = registry.find(r => r.slot === slot);
  if (!entry) return;

  // Toggle off if already active
  if (activeSlot === slot) {
    deactivate();
    return;
  }

  // Hide current visualization
  if (activeSlot > 0) {
    const current = registry.find(r => r.slot === activeSlot);
    if (current) current.plugin.hide();
  }

  // Hide background images
  document.getElementById('bg1').style.display = 'none';
  document.getElementById('bg2').style.display = 'none';

  entry.plugin.show();
  activeSlot = slot;
  showLabel(entry.name);
}

export function deactivate() {
  if (activeSlot > 0) {
    const current = registry.find(r => r.slot === activeSlot);
    if (current) current.plugin.hide();
  }

  // Restore background images
  document.getElementById('bg1').style.display = '';
  document.getElementById('bg2').style.display = '';

  activeSlot = 0;
  showLabel('Slideshow');
}

export function cycleNext() {
  const nextSlot = activeSlot + 1;
  if (nextSlot > registry.length) {
    deactivate();
  } else {
    activate(nextSlot);
  }
}

export function getActiveSlot() {
  return activeSlot;
}

export function getRegistry() {
  return registry;
}

function showLabel(name) {
  const el = document.getElementById('vizLabel');
  if (!el) return;
  el.textContent = name;
  el.classList.add('visible');
  clearTimeout(labelTimeout);
  labelTimeout = setTimeout(() => {
    el.classList.remove('visible');
  }, 1500);
}
