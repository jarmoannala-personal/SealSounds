// Highland plugin — 3D raymarched terrain with trees, clouds, and atmospheric fog
// Original shader with adaptive resolution for smooth playback

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

  // --- Noise ---

  float hash(float n) { return fract(sin(n) * 43758.5453123); }
  float hash2(vec2 p) {
    p = 50.0 * fract(p * 0.3183099);
    return fract(p.x * p.y * (p.x + p.y));
  }

  float noise3(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n = p.x + 317.0 * p.y + 157.0 * p.z;
    float a = hash(n), b = hash(n + 1.0), c = hash(n + 317.0), d = hash(n + 318.0);
    float e = hash(n + 157.0), f2 = hash(n + 158.0), g = hash(n + 474.0), h = hash(n + 475.0);
    return -1.0 + 2.0 * (a + (b-a)*f.x + (c-a)*f.y + (e-a)*f.z
           + (a-b-c+d)*f.x*f.y + (a-c-e+g)*f.y*f.z
           + (a-b-e+f2)*f.z*f.x + (-a+b+c-d+e-f2-g+h)*f.x*f.y*f.z);
  }

  float noise2(vec2 x) {
    vec2 p = floor(x);
    vec2 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash2(p), b = hash2(p + vec2(1, 0));
    float c = hash2(p + vec2(0, 1)), d = hash2(p + vec2(1, 1));
    return -1.0 + 2.0 * (a + (b-a)*f.x + (c-a)*f.y + (a-b-c+d)*f.x*f.y);
  }

  // --- FBM ---

  const mat2 m2 = mat2(0.80, 0.60, -0.60, 0.80);

  float fbm4(vec2 p) {
    float a = 0.0, b = 0.5;
    for (int i = 0; i < 4; i++) {
      a += b * noise2(p);
      b *= 0.5;
      p = m2 * p * 1.9;
    }
    return a;
  }

  float fbm6(vec2 p) {
    float a = 0.0, b = 0.5;
    for (int i = 0; i < 6; i++) {
      a += b * noise2(p);
      b *= 0.55;
      p = m2 * p * 1.9;
    }
    return a;
  }

  // --- Terrain height ---

  float terrainH(vec2 p) {
    float h = fbm6(p * 0.003 + vec2(1.0, -2.0));
    h = h * 120.0 + 60.0;
    // Add cliff at mid-height
    h += 18.0 * smoothstep(55.0, 75.0, h);
    return h;
  }

  vec3 terrainNormal(vec2 p) {
    float eps = 0.5;
    float h = terrainH(p);
    float hx = terrainH(p + vec2(eps, 0.0));
    float hz = terrainH(p + vec2(0.0, eps));
    return normalize(vec3(h - hx, eps, h - hz));
  }

  // --- Camera ---

  mat3 setCamera(vec3 ro, vec3 ta, float cr) {
    vec3 cw = normalize(ta - ro);
    vec3 cp = vec3(sin(cr), cos(cr), 0.0);
    vec3 cu = normalize(cross(cw, cp));
    vec3 cv = normalize(cross(cu, cw));
    return mat3(cu, cv, cw);
  }

  // --- Fog ---

  vec3 applyFog(vec3 col, float t) {
    vec3 ext = exp2(-t * 0.0004 * vec3(1.0, 1.5, 4.0));
    return col * ext + (1.0 - ext) * vec3(0.55, 0.58, 0.65);
  }

  // --- Sky ---

  const vec3 sunDir = normalize(vec3(-0.6, 0.47, -0.6));

  vec3 renderSky(vec3 rd) {
    vec3 col = vec3(0.42, 0.62, 1.1) - rd.y * 0.4;

    // Simple clouds in sky
    float t = (800.0) / max(rd.y, 0.01);
    vec2 uv = rd.xz * t * 0.001;
    uv += u_time * 0.003;
    float cl = fbm4(uv * 4.0);
    cl = smoothstep(-0.2, 0.6, cl);
    col = mix(col, vec3(1.0), 0.25 * cl * smoothstep(0.0, 0.3, rd.y));

    // Sun glare
    float sun = clamp(dot(sunDir, rd), 0.0, 1.0);
    col += 0.2 * vec3(1.0, 0.6, 0.3) * pow(sun, 32.0);

    return col;
  }

  // --- Raymarch terrain ---

  float raymarchTerrain(vec3 ro, vec3 rd, float tmin, float tmax) {
    float t = tmin;
    for (int i = 0; i < 80; i++) {
      vec3 pos = ro + t * rd;
      float h = pos.y - terrainH(pos.xz);
      if (h < 0.002 * t) return t;
      t += h * 0.7;
      if (t > tmax) break;
    }
    return -1.0;
  }

  // --- Trees (simple ellipsoid SDF) ---

  float treeSDF(vec3 p) {
    float base = terrainH(p.xz);
    vec2 cell = floor(p.xz / 3.0);
    vec2 f = fract(p.xz / 3.0);

    float d = 100.0;
    for (int j = 0; j <= 1; j++)
    for (int i = 0; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j)) - step(f, vec2(0.5));
      vec2 id = cell + g;
      float rnd = hash2(id);
      if (rnd < 0.4) continue; // sparse trees

      vec2 off = vec2(hash2(id * 1.3 + 7.0), hash2(id * 2.1 + 13.0));
      vec2 r = g - f + off * 0.7;

      float height = 3.0 + rnd * 4.0;
      float width = 0.8 + rnd * 0.6;
      vec3 q = vec3(r.x * 3.0, p.y - base - height * 0.5, r.y * 3.0);

      // Ellipsoid
      float k0 = length(q / vec3(width, height * 0.5, width));
      float k1 = length(q / (vec3(width, height * 0.5, width) * vec3(width, height * 0.5, width)));
      float sd = k0 * (k0 - 1.0) / k1;
      d = min(d, sd);
    }
    return d;
  }

  // --- Main rendering ---

  void main() {
    vec2 p = (2.0 * gl_FragCoord.xy - u_resolution.xy) / u_resolution.y;

    // Slow orbiting camera
    float t = u_time * 0.02;
    vec3 ro = vec3(80.0 * sin(t), 85.0 + 5.0 * sin(t * 0.7), 80.0 * cos(t));
    vec3 ta = vec3(0.0, 65.0, -40.0 + ro.z);

    mat3 ca = setCamera(ro, ta, 0.0);
    vec3 rd = ca * normalize(vec3(p, 1.5));

    // Sky
    vec3 col = renderSky(rd);

    // Raymarch terrain
    float tmax = 600.0;
    float tp = (200.0 - ro.y) / rd.y; // bounding plane
    if (tp > 0.0) tmax = min(tmax, tp);

    float ht = raymarchTerrain(ro, rd, 1.0, tmax);

    if (ht > 0.0) {
      vec3 pos = ro + ht * rd;
      vec3 nor = terrainNormal(pos.xz);

      // Terrain material
      float slope = nor.y;
      vec3 terrCol = vec3(0.18, 0.12, 0.10) * 0.85;
      // Grass on flat areas
      terrCol = mix(terrCol, vec3(0.12, 0.2, 0.05), smoothstep(0.7, 0.9, slope));
      // Snow on high peaks
      terrCol = mix(terrCol, vec3(0.85, 0.88, 0.9), smoothstep(100.0, 130.0, pos.y) * smoothstep(0.5, 0.8, slope));

      // Lighting
      float dif = clamp(dot(nor, sunDir), 0.0, 1.0);
      float bac = clamp(dot(normalize(vec3(-sunDir.x, 0.0, -sunDir.z)), nor), 0.0, 1.0);
      float amb = clamp(0.5 + 0.5 * nor.y, 0.0, 1.0);

      vec3 lin = vec3(0.0);
      lin += 7.0 * vec3(1.0, 0.9, 0.8) * dif;
      lin += 0.3 * vec3(1.1, 1.0, 0.9) * bac;
      lin += 0.4 * vec3(0.5, 0.7, 1.0) * amb;

      col = terrCol * lin;

      // Trees on terrain (only nearby for performance)
      if (ht < 200.0) {
        float td = treeSDF(pos);
        if (td < 0.5) {
          // Tree canopy color
          float brownish = fbm4(pos.xz * 0.015);
          vec3 treeCol = vec3(0.15, 0.25, 0.05);
          treeCol = mix(treeCol, vec3(0.25, 0.16, 0.04), smoothstep(0.1, 0.3, brownish));

          float treeDif = clamp(dot(nor, sunDir) * 0.5 + 0.5, 0.0, 1.0);
          treeCol *= 0.3 + 3.0 * treeDif;

          float blend = smoothstep(0.5, 0.0, td);
          col = mix(col, treeCol, blend);
        }
      }

      // Specular
      vec3 ref = reflect(rd, nor);
      float spe = pow(clamp(dot(ref, sunDir), 0.0, 1.0), 9.0);
      col += 0.3 * spe * dif;

      col = applyFog(col, ht);
    }

    // Low-altitude fog wisps
    if (rd.y < 0.1) {
      float fogT = (70.0 - ro.y) / min(rd.y, -0.001);
      if (fogT > 0.0 && fogT < tmax) {
        vec3 fogPos = ro + fogT * rd;
        float fogDens = fbm4(fogPos.xz * 0.01 + u_time * 0.01);
        fogDens = smoothstep(-0.2, 0.4, fogDens) * 0.3;
        fogDens *= smoothstep(200.0, 50.0, fogT);
        col = mix(col, vec3(0.7, 0.75, 0.8), fogDens);
      }
    }

    // Sun glare (final)
    float sun = clamp(dot(sunDir, rd), 0.0, 1.0);
    col += 0.25 * vec3(0.8, 0.4, 0.2) * pow(sun, 4.0);

    // Tonemap and color grade
    col = pow(clamp(col * 1.1 - 0.02, 0.0, 1.0), vec3(0.4545));
    col = col * col * (3.0 - 2.0 * col); // contrast
    col = pow(col, vec3(1.0, 0.92, 1.0)); // soft green
    col *= vec3(1.02, 0.99, 0.9);
    col.z += 0.05; // slight blue bias

    // Vignette
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    col *= 0.5 + 0.5 * pow(16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y), 0.05);

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

// Adaptive quality
const TARGET_FRAME_MS = 50;
let renderScale = 0.3;
let lastFrameTime = 0;
let frameTimeSmooth = TARGET_FRAME_MS;

export function init() {
  const container = document.getElementById('pluginCanvas');
  if (!container) return false;

  canvas = document.getElementById('highlandCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'highlandCanvas';
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
    console.error('Highland: shader link error', gl.getProgramInfoLog(program));
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
    console.error('Highland shader error:', gl.getShaderInfoLog(shader));
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

  if (frameMs > 0 && frameMs < 500) {
    frameTimeSmooth = frameTimeSmooth * 0.8 + frameMs * 0.2;
  }

  // Adaptive resolution
  if (frameTimeSmooth > TARGET_FRAME_MS * 1.2) {
    renderScale = Math.max(0.15, renderScale - 0.005);
  } else if (frameTimeSmooth < TARGET_FRAME_MS * 0.7) {
    renderScale = Math.min(0.6, renderScale + 0.002);
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
  renderScale = 0.3;
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
