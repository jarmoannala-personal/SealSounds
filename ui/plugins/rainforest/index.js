// Rainforest plugin — layered jungle landscape with fog, god rays, and canopy
// Original shader inspired by tropical rainforest atmospherics

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

  #define PI 3.14159265

  // --- Noise functions ---

  float hash(vec2 p) {
    p = 50.0 * fract(p * 0.3183099);
    return fract(p.x * p.y * (p.x + p.y));
  }

  float hash1(float n) {
    return fract(n * 17.0 * fract(n * 0.3183099));
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return -1.0 + 2.0 * (a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y);
  }

  // FBM with rotation between octaves
  float fbm(vec2 p) {
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    float a = 0.0, b = 0.5;
    for (int i = 0; i < 6; i++) {
      a += b * noise(p);
      b *= 0.5;
      p = rot * p * 1.9;
    }
    return a;
  }

  float fbm3(vec2 p) {
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    float a = 0.0, b = 0.5;
    for (int i = 0; i < 3; i++) {
      a += b * noise(p);
      b *= 0.5;
      p = rot * p * 1.9;
    }
    return a;
  }

  // --- Terrain layers ---

  // Each layer is a mountain/hill silhouette at a given depth
  float terrainHeight(float x, float depth) {
    float h = 0.0;
    h += 0.40 * sin(x * 0.3 + depth * 2.0);
    h += 0.20 * sin(x * 0.7 + depth * 1.3 + 1.0);
    h += 0.10 * sin(x * 1.5 + depth * 0.7 + 2.0);
    h += 0.05 * noise(vec2(x * 3.0, depth * 5.0));
    return h;
  }

  // Tree canopy silhouette on top of terrain
  float canopyHeight(float x, float depth) {
    float base = terrainHeight(x, depth);
    float trees = 0.0;
    trees += 0.08 * abs(noise(vec2(x * 8.0 + depth * 3.0, depth * 2.0)));
    trees += 0.04 * abs(noise(vec2(x * 16.0 + depth * 7.0, depth * 5.0)));
    trees += 0.02 * abs(noise(vec2(x * 32.0, depth * 11.0)));
    return base + trees;
  }

  // --- God rays ---

  float godRays(vec2 uv, float t) {
    float rays = 0.0;
    vec2 sunPos = vec2(0.3, 0.75);
    vec2 delta = uv - sunPos;
    float angle = atan(delta.y, delta.x);

    // Rotating light shafts
    for (float i = 0.0; i < 6.0; i++) {
      float a = angle * (3.0 + i) + t * 0.1 * (i + 1.0) + i * 1.7;
      rays += 0.05 * smoothstep(0.0, 1.0, pow(max(sin(a), 0.0), 12.0));
    }

    // Fade with distance from sun
    float dist = length(delta);
    rays *= exp(-2.0 * dist);

    // Only above horizon
    rays *= smoothstep(0.3, 0.6, uv.y);

    return rays;
  }

  // --- Mist / ground fog ---

  float mist(vec2 uv, float t) {
    vec2 p = uv * vec2(4.0, 2.0);
    p.x += t * 0.05;
    float f = fbm3(p);
    f = smoothstep(-0.3, 0.5, f);
    // Stronger near the bottom
    f *= smoothstep(0.5, 0.1, uv.y);
    return f * 0.5;
  }

  // --- Fireflies / particles ---

  float fireflies(vec2 uv, float t) {
    float glow = 0.0;
    for (float i = 0.0; i < 15.0; i++) {
      float h1 = hash1(i * 7.3);
      float h2 = hash1(i * 13.1);
      float h3 = hash1(i * 23.7);

      vec2 pos = vec2(
        sin(t * 0.3 * h1 + h2 * 6.28) * 0.4 + h3 * 0.5 - 0.1,
        sin(t * 0.2 * h2 + h1 * 6.28) * 0.15 + 0.15 + h3 * 0.2
      );

      float blink = smoothstep(0.3, 0.7, sin(t * (1.0 + h1 * 2.0) + h2 * 6.28));
      float d = length(uv - pos);
      glow += blink * 0.003 / (d * d + 0.001);
    }
    return glow;
  }

  // --- Main ---

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = uv;
    p.x *= aspect;

    float t = u_time;

    // --- Sky gradient ---
    vec3 skyTop = vec3(0.25, 0.45, 0.65);
    vec3 skyBot = vec3(0.55, 0.65, 0.55);
    vec3 col = mix(skyBot, skyTop, uv.y);

    // Sun glow
    vec2 sunPos = vec2(0.3 * aspect, 0.78);
    float sunDist = length(vec2(p.x, uv.y) - sunPos);
    col += vec3(1.0, 0.8, 0.4) * 0.4 * exp(-3.0 * sunDist);
    col += vec3(1.0, 0.6, 0.2) * 0.15 * exp(-8.0 * sunDist);

    // High clouds
    float clouds = fbm3(vec2(p.x * 2.0 + t * 0.02, uv.y * 3.0 + 5.0));
    clouds = smoothstep(-0.2, 0.6, clouds);
    col = mix(col, vec3(0.9, 0.9, 0.85), 0.15 * clouds * smoothstep(0.5, 0.9, uv.y));

    // --- Layered terrain (back to front) ---
    // 6 layers at different depths

    for (float layer = 0.0; layer < 6.0; layer++) {
      float depth = 1.0 - layer / 6.0; // 1.0 = farthest, 0.17 = nearest
      float yOffset = 0.15 + layer * 0.06;

      // Parallax scroll
      float scroll = t * 0.02 * (0.5 + 0.5 * layer / 6.0);

      float x = p.x * (0.8 + layer * 0.3) + scroll;
      float h = canopyHeight(x, layer) * (0.15 + layer * 0.04) + yOffset;

      // Color: far layers are more blue/hazy, near layers are deep green
      vec3 farColor = vec3(0.35, 0.5, 0.55);
      vec3 nearColor = vec3(0.04, 0.12, 0.02);
      vec3 layerColor = mix(farColor, nearColor, layer / 6.0);

      // Variation in green
      float greenVar = noise(vec2(x * 5.0, layer * 3.0));
      layerColor += vec3(-0.02, 0.03, -0.01) * greenVar;

      // Sunlit highlights on far layers
      float sunlight = smoothstep(0.0, 0.3, depth) * 0.15;
      layerColor += vec3(0.1, 0.08, 0.02) * sunlight;

      // Apply layer where terrain covers
      float edge = smoothstep(h + 0.005, h - 0.005, uv.y);
      col = mix(col, layerColor, edge);
    }

    // --- Water / river at the bottom ---
    float waterLine = 0.08 + 0.01 * sin(p.x * 3.0 + t * 0.5);
    if (uv.y < waterLine) {
      float waterDepth = (waterLine - uv.y) / waterLine;
      vec3 waterColor = vec3(0.05, 0.15, 0.12);

      // Reflections (flipped terrain color, darkened)
      float reflY = waterLine + (waterLine - uv.y) * 0.5;
      vec3 reflColor = mix(vec3(0.04, 0.12, 0.02), vec3(0.1, 0.2, 0.1), reflY);

      // Ripples
      float ripple = noise(vec2(p.x * 20.0 + t * 0.3, uv.y * 40.0 + t * 0.5));
      reflColor += 0.03 * ripple;

      waterColor = mix(reflColor * 0.4, waterColor, waterDepth);

      // Specular glints
      float glint = pow(max(noise(vec2(p.x * 30.0 + t * 0.8, uv.y * 50.0)), 0.0), 8.0);
      waterColor += vec3(0.2, 0.25, 0.15) * glint * 0.3;

      col = waterColor;
    }

    // --- God rays through canopy ---
    float rays = godRays(uv, t);
    col += vec3(0.9, 0.85, 0.5) * rays;

    // --- Mist ---
    float m = mist(vec2(p.x, uv.y), t);
    col = mix(col, vec3(0.6, 0.7, 0.6), m);

    // --- Fireflies (near the ground) ---
    float ff = fireflies(vec2(p.x / aspect, uv.y), t);
    col += vec3(0.6, 0.9, 0.3) * ff * smoothstep(0.4, 0.0, uv.y);

    // --- Vignette ---
    float vignette = 1.0 - 0.4 * length(uv - 0.5);
    col *= vignette;

    // Gamma correction
    col = pow(clamp(col, 0.0, 1.0), vec3(0.4545));

    // Slight warm tint
    col *= vec3(1.02, 1.0, 0.95);

    gl_FragColor = vec4(col, 1.0);
  }
`;

let canvas = null;
let gl = null;
let program = null;
let animationId = null;
let startTime = 0;
let uniforms = {};
let isActive = false;

export function init() {
  const container = document.getElementById('pluginCanvas');
  if (!container) return false;

  canvas = document.getElementById('rainforestCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'rainforestCanvas';
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
    console.error('Rainforest: shader link error', gl.getProgramInfoLog(program));
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
    console.error('Rainforest shader error:', gl.getShaderInfoLog(shader));
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
  const time = performance.now() / 1000 - startTime;
  gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
  gl.uniform1f(uniforms.time, time);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  animationId = requestAnimationFrame(render);
}

export function show() {
  if (!gl) return;
  isActive = true;
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

export function destroy() {
  hide();
}
