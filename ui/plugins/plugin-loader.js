// Plugin loader — detects device capabilities and loads appropriate visual plugins

export function detectCapabilities() {
  const caps = {
    webgl: false,
    webgl2: false,
    webgpu: false,
    cores: navigator.hardwareConcurrency || 2,
    memory: navigator.deviceMemory || 4,
    gpu: null,
    tier: 'basic', // basic | mid | high
  };

  // WebGL detection
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      caps.webgl = true;
      caps.webgl2 = !!canvas.getContext('webgl2');
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        caps.gpu = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      }
    }
  } catch (e) {}

  // WebGPU detection
  caps.webgpu = !!navigator.gpu;

  // Determine tier
  if (caps.webgpu && caps.cores >= 8 && caps.memory >= 8) {
    caps.tier = 'high';
  } else if (caps.webgl && caps.cores >= 4) {
    caps.tier = 'mid';
  } else {
    caps.tier = 'basic';
  }

  return caps;
}

const loadedPlugins = {};

export async function loadPlugins(caps) {
  console.log(`Device capabilities: tier=${caps.tier}, cores=${caps.cores}, memory=${caps.memory}GB, gpu=${caps.gpu}`);

  // Load ambient smoke (lightweight — works on any WebGL device)
  if (caps.webgl) {
    try {
      const ambient = await import('./ambient/index.js');
      const success = ambient.init();
      if (success) {
        loadedPlugins.ambient = ambient;
        console.log('Ambient smoke plugin loaded');
      } else {
        console.warn('Ambient smoke plugin init returned false');
      }
    } catch (e) {
      console.warn('Failed to load ambient plugin:', e);
    }
  } else {
    console.log('Skipping ambient plugin: no WebGL');
  }

  // Load Mandelbrot plugin for mid and high tier
  if (caps.webgl) {
    try {
      const mandelbrot = await import('./mandelbrot/index.js');
      const success = mandelbrot.init();
      if (success) {
        loadedPlugins.mandelbrot = mandelbrot;
        console.log('Mandelbrot plugin loaded');
      }
    } catch (e) {
      console.warn('Failed to load Mandelbrot plugin:', e);
    }
  }

  return loadedPlugins;
}

export function getPlugin(name) {
  return loadedPlugins[name] || null;
}

export function getLoadedPlugins() {
  return loadedPlugins;
}
