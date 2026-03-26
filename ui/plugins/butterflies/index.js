// Butterflies plugin — 3D raymarched butterflies with flapping wings
// Adapted from Shadertoy SDF butterfly shader with procedural background

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
  #define OBJECTS 25
  #define CACHED 5
  #define STEPS 50
  #define OBJECT_SIZE 0.5

  // --- Rotation matrices ---
  mat3 rotx(float a) {
    float c = cos(a), s = sin(a);
    return mat3(1,0,0, 0,c,-s, 0,s,c);
  }
  mat3 roty(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c,0,s, 0,1,0, -s,0,c);
  }
  mat3 rotz(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c,-s,0, s,c,0, 0,0,1);
  }

  // --- Hash / noise ---
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  vec3 hashPos(int i) {
    float fi = float(i);
    return vec3(
      hash(fi * 13.37) - 0.5,
      hash(fi * 27.13) - 0.5,
      hash(fi * 41.71) - 0.5
    );
  }

  float noise2d(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash2(i);
    float b = hash2(i + vec2(1, 0));
    float c = hash2(i + vec2(0, 1));
    float d = hash2(i + vec2(1, 1));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float a = 0.0, b = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 5; i++) {
      a += b * noise2d(p);
      b *= 0.5;
      p = rot * p * 2.0;
    }
    return a;
  }

  // --- Distance functions ---
  float udBox(vec3 p, vec3 b) {
    return length(max(abs(p) - b, 0.0));
  }

  float sdHexPrism(vec3 p, vec2 h) {
    vec3 q = abs(p);
    return max(q.z - h.y, max((q.x * 0.866025 + q.y * 0.5), q.y) - h.x);
  }

  // --- Butterfly model ---
  vec2 getModel(vec3 pos, int index) {
    float phase = float(index);
    float l = length(pos);

    float bl = (sin(pos.z * 12.0 - 5.0) * 0.5 + 0.5) + 0.3;
    float body = sdHexPrism(pos, vec2(OBJECT_SIZE * 0.04 * bl, OBJECT_SIZE * 0.2));

    float wx = max(abs(l * 6.0 + 0.2) - 0.4, 0.0);
    float sl = 1.5 * abs(sin(wx)) + 0.05;

    vec3 wing = vec3(OBJECT_SIZE * 0.5, OBJECT_SIZE * 0.01, OBJECT_SIZE * 0.25 * sl);

    float flapSpeed = 22.0 + hash(phase * 3.7) * 8.0;
    float w1 = udBox(rotz(sin(u_time * flapSpeed + phase)) * pos - vec3(OBJECT_SIZE * 0.5, 0.0, 0.0), wing);
    float w2 = udBox(rotz(-sin(u_time * flapSpeed + phase)) * pos + vec3(OBJECT_SIZE * 0.5, 0.0, 0.0), wing);

    float id = 0.0; // body
    if (w1 < body || w2 < body) id = 1.0; // wing

    return vec2(min(min(body, w1), w2), id);
  }

  // --- Butterfly positions and cache ---
  // Stored as globals for the raymarcher
  vec3 objPos[OBJECTS];
  int objIndex[OBJECTS];

  vec3 cachePos[CACHED];
  int cacheIdx[CACHED];
  int maxCache;

  float prestep(vec3 ro, vec3 rp, vec3 rd) {
    maxCache = -1;
    float m = 99999.0;

    vec3 tmp = normalize(cross(rd, vec3(0.0, 1.0, 0.0)));
    vec3 up = normalize(cross(rd, tmp));
    vec3 right = cross(rd, up);

    for (int i = 0; i < OBJECTS; i++) {
      vec3 sp = -ro + objPos[i];
      float distY = abs(dot(up, sp));
      float distX = abs(dot(right, sp));
      float distToPlanes = max(distY, distX) - OBJECT_SIZE;

      vec2 mat = getModel(rp - objPos[i] * (1.0 + distToPlanes), i);
      m = min(m, mat.x);

      if (distToPlanes <= 0.0) {
        maxCache++;
        if (maxCache == 0) { cachePos[0] = objPos[i]; cacheIdx[0] = i; }
        else if (maxCache == 1) { cachePos[1] = objPos[i]; cacheIdx[1] = i; }
        else if (maxCache == 2) { cachePos[2] = objPos[i]; cacheIdx[2] = i; }
        else if (maxCache == 3) { cachePos[3] = objPos[i]; cacheIdx[3] = i; }
        else if (maxCache == 4) { cachePos[4] = objPos[i]; cacheIdx[4] = i; }
        if (maxCache >= CACHED - 1) return m;
      }
    }
    return m;
  }

  vec2 mapCached(vec3 rp, out vec3 localPos, out int hitIdx) {
    float m = 9999.0;
    vec2 ret = vec2(m, 0.0);
    for (int i = 0; i < CACHED; i++) {
      if (i > maxCache) break;
      vec3 lp = rp - cachePos[i];
      vec2 mat = getModel(lp, cacheIdx[i]);
      if (mat.x < m) {
        m = mat.x;
        ret = mat;
        localPos = lp;
        hitIdx = cacheIdx[i];
      }
    }
    return ret;
  }

  vec4 trace(vec3 rp, vec3 rd) {
    vec3 ro = rp;
    float travel = prestep(ro, rp, rd);
    rp += travel * rd;

    vec3 local = vec3(0.0);
    int hitindex = 0;

    for (int i = 0; i < STEPS; i++) {
      vec2 mat = mapCached(rp, local, hitindex);
      if (mat.x <= 0.0) {
        float indx = float(hitindex);
        float c1 = sin(indx * 0.1) * 0.5 + 0.5;
        float c2 = abs(cos(abs(local.z * 15.0)) + sin(abs(local.x) * 15.0));
        float c3 = cos(indx * 0.4);
        vec4 col = vec4(mat.y, c2 * mat.y, c1 * mat.y, 1.0) * abs(sin(indx * 0.1));
        // Add color variety per butterfly
        col.rgb += vec3(
          0.3 * sin(indx * 1.7),
          0.2 * cos(indx * 2.3),
          0.4 * sin(indx * 0.9 + 1.0)
        ) * mat.y;
        col.a = 1.0;
        return col;
      }
      float dst = max(0.01, mat.x);
      travel += dst;
      rp += rd * dst;
      if (travel > 30.0) break;
    }
    return vec4(0.0);
  }

  // --- Procedural meadow/garden background ---
  vec3 background(vec3 rd) {
    // Sky
    float skyGrad = rd.y * 0.5 + 0.5;
    vec3 sky = mix(vec3(0.55, 0.7, 0.5), vec3(0.3, 0.55, 0.85), skyGrad);

    // Sun
    vec3 sunDir = normalize(vec3(0.4, 0.6, -0.5));
    float sun = pow(max(dot(rd, sunDir), 0.0), 64.0);
    sky += vec3(1.0, 0.8, 0.4) * sun * 0.5;
    float sunGlow = pow(max(dot(rd, sunDir), 0.0), 8.0);
    sky += vec3(0.4, 0.3, 0.1) * sunGlow * 0.3;

    // Clouds
    if (rd.y > 0.0) {
      vec2 cloudUV = rd.xz / (rd.y + 0.1) * 2.0;
      cloudUV += u_time * 0.02;
      float clouds = fbm(cloudUV);
      clouds = smoothstep(0.0, 0.5, clouds);
      sky = mix(sky, vec3(0.95, 0.95, 0.9), clouds * 0.4 * smoothstep(0.0, 0.3, rd.y));
    }

    // Ground / meadow
    if (rd.y < 0.05) {
      float groundMix = smoothstep(0.05, -0.1, rd.y);
      vec2 groundUV = rd.xz / (abs(rd.y) + 0.01) * 0.5;

      // Grass color with variation
      float grassNoise = fbm(groundUV * 3.0);
      vec3 grass = mix(
        vec3(0.15, 0.35, 0.05),
        vec3(0.25, 0.45, 0.1),
        grassNoise
      );

      // Flowers
      float flowerNoise = noise2d(groundUV * 20.0);
      if (flowerNoise > 0.85) {
        float flowerType = noise2d(groundUV * 7.0);
        vec3 flowerCol = flowerType > 0.5
          ? vec3(0.9, 0.3, 0.5) // pink
          : vec3(0.9, 0.8, 0.2); // yellow
        grass = mix(grass, flowerCol, (flowerNoise - 0.85) * 6.0);
      }

      // Distance fog on ground
      float dist = 1.0 / (abs(rd.y) + 0.01);
      float fog = 1.0 - exp(-dist * 0.003);
      grass = mix(grass, vec3(0.4, 0.5, 0.4), fog);

      sky = mix(sky, grass, groundMix);
    }

    // Distant tree line
    float treeLine = smoothstep(0.02, 0.08, rd.y);
    float treeShape = fbm(vec2(rd.x * 15.0, 0.0));
    float trees = smoothstep(0.04 + treeShape * 0.03, 0.03 + treeShape * 0.03, rd.y);
    vec3 treeColor = mix(vec3(0.08, 0.2, 0.05), vec3(0.12, 0.25, 0.08), treeShape);
    sky = mix(sky, treeColor, trees * 0.7);

    return sky;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    uv -= 0.5;
    uv.y /= u_resolution.x / u_resolution.y;

    // Initialize butterfly positions
    for (int i = 0; i < OBJECTS; i++) {
      vec3 p = hashPos(i);

      // Orbit and drift
      p *= roty(u_time * 2.0);
      p.z += (sin(u_time + float(i) * 0.3) * 0.5 + 0.5) * 1.0;
      p.x *= 1.0 + (sin(u_time * 0.1 + float(i)) * 0.5 + 0.5) * 0.25;
      p.y *= 1.0 + (cos(u_time * 0.1 + float(i) * 0.7) * 0.5 + 0.5) * 0.25;

      objPos[i] = p * 10.0;
      objIndex[i] = i;
    }

    vec3 rp = vec3(0.0, 0.0, 1.0);
    vec3 rd = normalize(vec3(uv, 0.3));

    // Gentle camera sway
    rd *= rotx(sin(u_time * 0.15) * 0.1);
    rd *= roty(sin(u_time * 0.1) * 0.15);

    vec4 butterfly = trace(rp, rd);

    // Background
    vec3 bg = background(rd);

    // Composite butterflies over background
    vec3 col = mix(bg, butterfly.rgb, butterfly.a);

    // Atmospheric tint
    float luma = dot(col, vec3(0.33));
    col -= luma * vec3(0.9, 0.5, 0.0) * clamp(rd.y - 0.05, 0.0, 1.0) * 0.3;
    col += vec3(0.15, 0.3, 0.0) * abs(clamp(rd.y, -1.0, 0.0)) * 0.5;

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

  canvas = document.getElementById('butterfliesCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'butterfliesCanvas';
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
    console.error('Butterflies: shader link error', gl.getProgramInfoLog(program));
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
    console.error('Butterflies shader error:', gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  // High resolution for crisp 4K rendering
  const scale = Math.min(1.0, dpr);
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
