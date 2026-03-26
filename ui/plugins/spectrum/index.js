// Spectrum analyzer plugin — classic bar-graph frequency display
// Bar heights simulated with per-band oscillators

const VERTEX_SHADER = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;

  #define NUM_BARS 32.0
  #define BAR_GAP 0.3

  // Noise for organic movement
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float noise(float x) {
    float i = floor(x);
    float f = fract(x);
    return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
  }

  // Simulate frequency band level
  float bandLevel(float band, float t) {
    float freq = 1.0 + band * 0.5;
    float phase = hash(band * 13.7) * 6.28;

    // Bass bands (low index) are louder and slower
    float bassWeight = 1.0 - band / NUM_BARS;
    float trebleWeight = band / NUM_BARS;

    float level = 0.0;
    // Main rhythm
    level += sin(t * freq * 0.8 + phase) * 0.3;
    level += sin(t * freq * 1.7 + phase * 1.5) * 0.2;
    // Sub-bass pulse
    level += sin(t * 1.2 + phase * 0.3) * 0.25 * bassWeight;
    // High-frequency shimmer
    level += noise(t * freq * 2.0 + band) * 0.2 * trebleWeight;
    // Overall energy
    level += noise(t * 0.5) * 0.15;
    // Transients
    level += pow(max(sin(t * 2.5 + phase), 0.0), 12.0) * 0.3;

    // Shape: bass heavier, treble lighter
    level = level * (0.6 + bassWeight * 0.5);

    return clamp(level * 0.7 + 0.15, 0.05, 0.95);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;

    // Bars region: centered horizontally with some padding
    float barRegionLeft = 0.05;
    float barRegionRight = 0.95;
    float barRegionBottom = 0.08;
    float barRegionTop = 0.88;

    float barX = (uv.x - barRegionLeft) / (barRegionRight - barRegionLeft);
    float barY = (uv.y - barRegionBottom) / (barRegionTop - barRegionBottom);

    vec3 color = vec3(0.02, 0.02, 0.04); // Dark background

    if (barX >= 0.0 && barX <= 1.0 && barY >= 0.0) {
      // Which bar are we in?
      float barIndex = floor(barX * NUM_BARS);
      float barFract = fract(barX * NUM_BARS);

      // Gap between bars
      float inBar = step(BAR_GAP * 0.5, barFract) * step(barFract, 1.0 - BAR_GAP * 0.5);

      if (inBar > 0.0 && barIndex < NUM_BARS) {
        float level = bandLevel(barIndex, u_time);

        // Bar fill
        float filled = step(barY, level);

        // Segment lines (horizontal gaps in bar for LED look)
        float segmentSize = 1.0 / 40.0;
        float segment = step(0.15, fract(barY / segmentSize));

        // Color gradient: green -> yellow -> red
        vec3 barColor;
        if (barY < 0.5) {
          barColor = mix(vec3(0.1, 0.8, 0.2), vec3(0.5, 0.8, 0.1), barY * 2.0);
        } else if (barY < 0.75) {
          barColor = mix(vec3(0.5, 0.8, 0.1), vec3(0.9, 0.7, 0.0), (barY - 0.5) * 4.0);
        } else {
          barColor = mix(vec3(0.9, 0.7, 0.0), vec3(1.0, 0.15, 0.1), (barY - 0.75) * 4.0);
        }

        // Dim unfilled segments slightly (ghost bars)
        float brightness = mix(0.04, 1.0, filled);
        color = barColor * brightness * segment;

        // Peak hold dot (stays near the top briefly)
        float peakLevel = level + 0.02;
        float peak = (1.0 - smoothstep(0.0, 0.015, abs(barY - peakLevel))) * step(barY, 1.0);
        vec3 peakColor = barY > 0.75 ? vec3(1.0, 0.2, 0.1) : vec3(1.0, 1.0, 0.9);
        color += peakColor * peak * 0.8;

        // Glow at the top of each active bar
        float glow = exp(-8.0 * abs(barY - level)) * filled * 0.15;
        color += barColor * glow;
      }
    }

    // Reflection on the bottom (subtle)
    if (uv.y < barRegionBottom) {
      float refY = barRegionBottom + (barRegionBottom - uv.y) * 0.5;
      float refBarX = (uv.x - barRegionLeft) / (barRegionRight - barRegionLeft);
      if (refBarX >= 0.0 && refBarX <= 1.0) {
        float barIndex = floor(refBarX * NUM_BARS);
        float barFract = fract(refBarX * NUM_BARS);
        float inBar = step(BAR_GAP * 0.5, barFract) * step(barFract, 1.0 - BAR_GAP * 0.5);
        if (inBar > 0.0 && barIndex < NUM_BARS) {
          float level = bandLevel(barIndex, u_time);
          float refBarY = (refY - barRegionBottom) / (barRegionTop - barRegionBottom);
          float filled = step(refBarY, level);
          float fade = (barRegionBottom - uv.y) / barRegionBottom;
          color += vec3(0.1, 0.4, 0.15) * filled * (1.0 - fade) * 0.1;
        }
      }
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

let canvas = null;
let gl = null;
let program = null;
let animationId = null;
let startTime = 0;
let playTime = 0;
let lastFrameTime = 0;
let playing = false;
let uniforms = {};
let isActive = false;

export function init() {
  const container = document.getElementById('pluginCanvas');
  if (!container) return false;

  canvas = document.getElementById('spectrumCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'spectrumCanvas';
    canvas.style.cssText = 'width:100%;height:100%;position:absolute;top:0;left:0;display:none;';
    container.appendChild(canvas);
  }

  gl = canvas.getContext('webgl', { alpha: false, antialias: false });
  if (!gl) return false;

  const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vs || !fs) return false;

  program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Spectrum: shader link error', gl.getProgramInfoLog(program));
    return false;
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);

  const posAttr = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posAttr);
  gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

  uniforms = {
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    time: gl.getUniformLocation(program, 'u_time'),
  };

  gl.useProgram(program);
  startTime = performance.now() / 1000;
  return true;
}

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Spectrum shader error:', gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const scale = 0.6 * dpr;
  canvas.width = canvas.clientWidth * scale;
  canvas.height = canvas.clientHeight * scale;
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function render() {
  if (!gl || !program || !isActive) return;
  resize();
  const now = performance.now() / 1000;
  if (playing) playTime += now - lastFrameTime;
  lastFrameTime = now;
  gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
  gl.uniform1f(uniforms.time, playTime);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  animationId = requestAnimationFrame(render);
}

export function show() {
  if (!gl) return;
  isActive = true;
  lastFrameTime = performance.now() / 1000;
  canvas.style.display = '';
  if (!animationId) render();
}

export function hide() {
  isActive = false;
  canvas.style.display = 'none';
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

export function toggle() {
  if (isActive) hide(); else show();
}

export function setPlaying(state) {
  playing = state;
}

export function destroy() {
  hide();
}
