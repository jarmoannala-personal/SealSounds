// Plugin loader — detects device capabilities and loads appropriate visual plugins

import { registerVisualization } from '../core/viz-manager.js';

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

  // Load ambient smoke (lightweight — works on any WebGL device, search screen only)
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

  // Playback visualizations — loaded in slot order (1, 2, 3, ...)
  const vizPlugins = [
    { name: 'Mandelbrot', path: './mandelbrot/index.js' },
    { name: 'VU Meters',  path: './vu-meters/index.js' },
    { name: 'Spectrum',   path: './spectrum/index.js' },
    { name: 'Starfield',    path: './starfield/index.js' },
    { name: 'Butterflies', path: './butterflies/index.js' },
    { name: 'Aurora City', path: './aurora/index.js' },
    { name: 'Rainforest', path: './rainforest/index.js' },
    { name: 'Clouds',     path: './clouds/index.js' },
    { name: 'Highland',   path: './highland/index.js' },
  ];

  for (const { name, path } of vizPlugins) {
    if (!caps.webgl) break;
    try {
      const mod = await import(path);
      const success = mod.init();
      if (success) {
        loadedPlugins[name.toLowerCase()] = mod;
        registerVisualization(name, mod);
        console.log(`${name} plugin loaded`);
      }
    } catch (e) {
      console.warn(`Failed to load ${name} plugin:`, e);
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
