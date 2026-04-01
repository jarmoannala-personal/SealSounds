// Clouds plugin — volumetric raymarched clouds
// Adapted from Shadertoy clouds shader with procedural noise (no textures)

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

  // --- Procedural noise (replaces texture lookups) ---

  float hash(float n) { return fract(sin(n) * 43758.5453123); }

  float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);

    float n = p.x + 317.0 * p.y + 157.0 * p.z;

    float a = hash(n + 0.0);
    float b = hash(n + 1.0);
    float c = hash(n + 317.0);
    float d = hash(n + 318.0);
    float e = hash(n + 157.0);
    float f2 = hash(n + 158.0);
    float g = hash(n + 474.0);
    float h = hash(n + 475.0);

    float k0 = a;
    float k1 = b - a;
    float k2 = c - a;
    float k3 = e - a;
    float k4 = a - b - c + d;
    float k5 = a - c - e + g;
    float k6 = a - b - e + f2;
    float k7 = -a + b + c - d + e - f2 - g + h;

    return -1.0 + 2.0 * (k0 + k1*f.x + k2*f.y + k3*f.z
           + k4*f.x*f.y + k5*f.y*f.z + k6*f.z*f.x + k7*f.x*f.y*f.z);
  }

  // --- Camera ---

  mat3 setCamera(vec3 ro, vec3 ta, float cr) {
    vec3 cw = normalize(ta - ro);
    vec3 cp = vec3(sin(cr), cos(cr), 0.0);
    vec3 cu = normalize(cross(cw, cp));
    vec3 cv = normalize(cross(cu, cw));
    return mat3(cu, cv, cw);
  }

  // --- Cloud density at different LOD levels ---

  float map5(vec3 p) {
    vec3 q = p - vec3(0.0, 0.1, 1.0) * u_time;
    float f;
    float a = 0.5;
    f  = a * noise(q); q = q * 2.02; a *= 0.5;
    f += a * noise(q); q = q * 2.03; a *= 0.5;
    f += a * noise(q); q = q * 2.01; a *= 0.5;
    f += a * noise(q); q = q * 2.02; a *= 0.5;
    f += a * noise(q);
    return clamp(1.5 - p.y - 2.0 + 1.75 * f, 0.0, 1.0);
  }

  float map4(vec3 p) {
    vec3 q = p - vec3(0.0, 0.1, 1.0) * u_time;
    float f;
    float a = 0.5;
    f  = a * noise(q); q = q * 2.02; a *= 0.5;
    f += a * noise(q); q = q * 2.03; a *= 0.5;
    f += a * noise(q); q = q * 2.01; a *= 0.5;
    f += a * noise(q);
    return clamp(1.5 - p.y - 2.0 + 1.75 * f, 0.0, 1.0);
  }

  float map3(vec3 p) {
    vec3 q = p - vec3(0.0, 0.1, 1.0) * u_time;
    float f;
    float a = 0.5;
    f  = a * noise(q); q = q * 2.02; a *= 0.5;
    f += a * noise(q); q = q * 2.03; a *= 0.5;
    f += a * noise(q);
    return clamp(1.5 - p.y - 2.0 + 1.75 * f, 0.0, 1.0);
  }

  float map2(vec3 p) {
    vec3 q = p - vec3(0.0, 0.1, 1.0) * u_time;
    float f;
    float a = 0.5;
    f  = a * noise(q); q = q * 2.02; a *= 0.5;
    f += a * noise(q);
    return clamp(1.5 - p.y - 2.0 + 1.75 * f, 0.0, 1.0);
  }

  // --- Raymarching ---

  const vec3 sundir = vec3(-0.7071, 0.0, -0.7071);

  vec4 raymarch(vec3 ro, vec3 rd, vec3 bgcol) {
    vec4 sum = vec4(0.0);
    // Dither start with procedural hash
    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float t = 0.05 * dither;

    // LOD 5: highest detail, closest
    for (int i = 0; i < 40; i++) {
      vec3 pos = ro + t * rd;
      if (pos.y < -3.0 || pos.y > 2.0 || sum.a > 0.99) break;
      float den = map5(pos);
      if (den > 0.01) {
        float dif = clamp((den - map5(pos + 0.3 * sundir)) / 0.6, 0.0, 1.0);
        vec3 lin = vec3(1.0, 0.6, 0.3) * dif + vec3(0.91, 0.98, 1.05);
        vec4 col = vec4(mix(vec3(1.0, 0.95, 0.8), vec3(0.25, 0.3, 0.35), den), den);
        col.xyz *= lin;
        col.xyz = mix(col.xyz, bgcol, 1.0 - exp(-0.003 * t * t));
        col.w *= 0.4;
        col.rgb *= col.a;
        sum += col * (1.0 - sum.a);
      }
      t += max(0.06, 0.05 * t);
    }

    // LOD 4
    for (int i = 0; i < 40; i++) {
      vec3 pos = ro + t * rd;
      if (pos.y < -3.0 || pos.y > 2.0 || sum.a > 0.99) break;
      float den = map4(pos);
      if (den > 0.01) {
        float dif = clamp((den - map4(pos + 0.3 * sundir)) / 0.6, 0.0, 1.0);
        vec3 lin = vec3(1.0, 0.6, 0.3) * dif + vec3(0.91, 0.98, 1.05);
        vec4 col = vec4(mix(vec3(1.0, 0.95, 0.8), vec3(0.25, 0.3, 0.35), den), den);
        col.xyz *= lin;
        col.xyz = mix(col.xyz, bgcol, 1.0 - exp(-0.003 * t * t));
        col.w *= 0.4;
        col.rgb *= col.a;
        sum += col * (1.0 - sum.a);
      }
      t += max(0.06, 0.05 * t);
    }

    // LOD 3
    for (int i = 0; i < 30; i++) {
      vec3 pos = ro + t * rd;
      if (pos.y < -3.0 || pos.y > 2.0 || sum.a > 0.99) break;
      float den = map3(pos);
      if (den > 0.01) {
        float dif = clamp((den - map3(pos + 0.3 * sundir)) / 0.6, 0.0, 1.0);
        vec3 lin = vec3(1.0, 0.6, 0.3) * dif + vec3(0.91, 0.98, 1.05);
        vec4 col = vec4(mix(vec3(1.0, 0.95, 0.8), vec3(0.25, 0.3, 0.35), den), den);
        col.xyz *= lin;
        col.xyz = mix(col.xyz, bgcol, 1.0 - exp(-0.003 * t * t));
        col.w *= 0.4;
        col.rgb *= col.a;
        sum += col * (1.0 - sum.a);
      }
      t += max(0.06, 0.05 * t);
    }

    // LOD 2: lowest detail, farthest
    for (int i = 0; i < 30; i++) {
      vec3 pos = ro + t * rd;
      if (pos.y < -3.0 || pos.y > 2.0 || sum.a > 0.99) break;
      float den = map2(pos);
      if (den > 0.01) {
        float dif = clamp((den - map2(pos + 0.3 * sundir)) / 0.6, 0.0, 1.0);
        vec3 lin = vec3(1.0, 0.6, 0.3) * dif + vec3(0.91, 0.98, 1.05);
        vec4 col = vec4(mix(vec3(1.0, 0.95, 0.8), vec3(0.25, 0.3, 0.35), den), den);
        col.xyz *= lin;
        col.xyz = mix(col.xyz, bgcol, 1.0 - exp(-0.003 * t * t));
        col.w *= 0.4;
        col.rgb *= col.a;
        sum += col * (1.0 - sum.a);
      }
      t += max(0.06, 0.05 * t);
    }

    return clamp(sum, 0.0, 1.0);
  }

  void main() {
    vec2 p = (2.0 * gl_FragCoord.xy - u_resolution.xy) / u_resolution.y;

    // Slow orbiting camera (replaces mouse control)
    float camAngle = u_time * 0.03;
    vec3 ro = 4.0 * normalize(vec3(sin(camAngle), 0.4 + 0.1 * sin(u_time * 0.05), cos(camAngle))) - vec3(0.0, 0.1, 0.0);
    vec3 ta = vec3(0.0, -1.0, 0.0);
    mat3 ca = setCamera(ro, ta, 0.07 * cos(0.25 * u_time));

    vec3 rd = ca * normalize(vec3(p.xy, 1.5));

    // Background sky
    float sun = clamp(dot(sundir, rd), 0.0, 1.0);
    vec3 col = vec3(0.6, 0.71, 0.75) - rd.y * 0.2 * vec3(1.0, 0.5, 1.0) + 0.15 * 0.5;
    col += 0.2 * vec3(1.0, 0.6, 0.1) * pow(sun, 8.0);

    // Clouds
    vec4 res = raymarch(ro, rd, col);
    col = col * (1.0 - res.w) + res.xyz;

    // Sun glare
    col += vec3(0.2, 0.08, 0.04) * pow(sun, 3.0);

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

// Adaptive quality: target ~20 FPS (50ms per frame)
const TARGET_FRAME_MS = 50;
let renderScale = 0.35; // start conservative
let lastFrameTime = 0;
let frameTimeSmooth = TARGET_FRAME_MS;

export function init() {
  const container = document.getElementById('pluginCanvas');
  if (!container) return false;

  canvas = document.getElementById('cloudsCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'cloudsCanvas';
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
    console.error('Clouds: shader link error', gl.getProgramInfoLog(program));
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
    console.error('Clouds shader error:', gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function resize() {
  const w = Math.floor(canvas.clientWidth * renderScale);
  const h = Math.floor(canvas.clientHeight * renderScale);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
}

function render() {
  if (!gl || !program || !isActive) return;

  const now = performance.now();
  const frameMs = now - lastFrameTime;
  lastFrameTime = now;

  // Smooth frame time measurement (exponential moving average)
  if (frameMs > 0 && frameMs < 500) {
    frameTimeSmooth = frameTimeSmooth * 0.8 + frameMs * 0.2;
  }

  // Adjust render scale toward target FPS
  if (frameTimeSmooth > TARGET_FRAME_MS * 1.2) {
    // Too slow — reduce resolution
    renderScale = Math.max(0.15, renderScale - 0.005);
  } else if (frameTimeSmooth < TARGET_FRAME_MS * 0.7) {
    // Room to spare — increase resolution
    renderScale = Math.min(0.7, renderScale + 0.002);
  }

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
  renderScale = 0.35; // reset to conservative on show
  lastFrameTime = performance.now();
  frameTimeSmooth = TARGET_FRAME_MS;
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
