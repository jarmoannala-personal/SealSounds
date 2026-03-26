// Aurora City plugin — raymarched cityscape with starfield and flowing light ribbons
// Adapted from Zuvuya visualizer by Orblivius, inspired by Shadertoy shaders

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

  #define PI 3.1415926
  #define SCROLL 2.8
  #define SPEED 3.4

  // --- Utility functions ---

  float rand(vec2 st) {
    return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453);
  }

  float noise(float x) {
    float i = floor(x);
    float f = fract(x);
    return mix(rand(vec2(i, 0.0)), rand(vec2(i + 1.0, 0.0)), f * f * (3.0 - 2.0 * f));
  }

  float mypow(float src, float x) {
    return src - (src - src * src) * (-x);
  }

  vec2 rotate(vec2 st, float angle) {
    float ca = cos(angle), sa = sin(angle);
    return vec2(st.x * ca - st.y * sa, st.x * sa + st.y * ca);
  }

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  // --- Stars ---

  float star(vec2 uv, float flare) {
    float d = length(uv);
    float m = 0.05 / d;
    m += m * flare;
    m *= smoothstep(0.85, 0.2, d);
    return m;
  }

  float starLayer(vec2 uv, float grid) {
    vec2 gv = fract(uv * grid) - 0.5;
    vec2 id = floor(uv * grid);
    float col = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y));
        float n = rand(id + offset);
        float size = fract(n * 345.32);
        float stars = star(gv - offset - vec2(n, fract(n * 34.0)) + 0.5,
                           smoothstep(0.9, 1.0, size) * 6.0);
        stars *= sin(u_time * 2.0 + n * 13.256) * 0.5 + 0.5;
        col += stars * size;
      }
    }
    return col;
  }

  float shootstar(vec2 uv, float grid, vec2 uvorig) {
    vec2 gv = fract(uv * grid) - 0.5;
    vec2 id = floor(uv * grid);
    float n = rand(id);
    float size = fract(n * 345.32);
    vec2 uvs = gv - vec2(n, fract(n * 34.0)) + 0.5;
    uvs = rotate(uvs, -uvorig.x);
    float flare = smoothstep(0.9, 1.0, size) * 6.0;
    float d = length(vec2(uvs.x, uvs.y - (1.0 / uvorig.x / 2.0 +
              (mypow(uvorig.y, 8.0) / 4.0)) * (uvs.x / 8.0) * 48.0));
    float m = smoothstep(0.07, 0.06, d);
    float tail = flare > 5.0 ? m + m * flare : 0.0;
    return tail * size;
  }

  // --- Raymarched city ---

  float sdBox(vec3 p, vec3 b, vec3 c) {
    vec3 q = abs(p - c) - b;
    return length(max(q, 0.0)) + min(max(q.y, max(q.x, q.z)), 0.0);
  }

  float sdBoxinf(vec2 p) {
    vec2 q = abs(p);
    float da = max(q.x + 0.5, q.y);
    return da - 1.0;
  }

  float map(vec3 p) {
    vec3 q1 = p;
    q1.xz = mod(q1.xz, 1.0) - 0.5;
    float rtime = rand(floor(p.xz));
    float height = abs(rand(floor(p.xz) + rtime));
    float id = floor(mypow(abs(p.x * 0.1), -1.0));
    vec3 size = vec3(0.15, 1.7 * height + id, 0.15);
    float sd1 = sdBox(q1, size, vec3(0.0));
    float sd2 = sdBoxinf(p.xy);
    return min(sd2, sd1);
  }

  vec3 cityScene(vec2 uv) {
    vec3 camPos = vec3(0.0, 1.5, 1.0 - u_time);
    vec3 camDir = normalize(vec3(0.0, 0.0, -1.0));
    vec3 camUp = normalize(vec3(0.0, 1.0, 0.0));
    vec3 camSide = cross(camDir, camUp);
    float fov = 1.8;

    vec3 dir = normalize(camSide * uv.x + camUp * uv.y + camDir * fov);
    vec3 ray = camPos;
    float d = 0.0;
    float rLen = 0.0;
    float total_d = 0.0;
    int march = 0;

    for (int i = 0; i < 64; i++) {
      d = map(ray);
      march = i;
      total_d += d;
      if (d < 0.001) break;
      if (total_d > 80.0) {
        total_d = 80.0;
        march = 63;
        break;
      }
      rLen += min(min(min(
        (step(0.0, dir.x) - fract(ray.x)) / dir.x,
        (step(0.0, dir.y) - fract(ray.y)) / dir.y) + 0.01,
        (step(0.0, dir.z) - fract(ray.z)) / dir.z) + 0.01, d);
      ray = camPos + dir * rLen;
    }

    float fog = min(1.0, (1.0 / 64.0) * float(march));
    vec3 fog2 = vec3(1.0) * total_d * 0.01;
    return vec3(0.05, 0.5, 2.0) * fog + fog2 * vec3(0.0, 0.5, 0.1);
  }

  // --- Stars composited ---

  vec3 starsScene(vec2 uv) {
    vec3 col = vec3(0.0);
    float grid = 1.0;
    for (float i = 0.0; i <= 1.0; i += 0.25) {
      float depth = fract(i + u_time * 0.2);
      float scale = mix(20.0, 0.5, depth);
      float fade = depth * smoothstep(1.0, 0.9, depth);
      col += vec3(starLayer(uv * scale + i * 432.0, grid) * fade);
      fade = depth * smoothstep(0.85, 0.6, depth);
      col += vec3(shootstar(uv * scale + i * 321.0, grid, uv) * fade);
    }
    col *= abs(uv.y * 0.5) * vec3(0.5, 0.5, 1.0);
    return col;
  }

  // --- Aurora curtain (simulated audio with noise) ---

  float simWave(float freq, float t) {
    // Simulate audio frequency band with layered oscillators
    float wave = 0.0;
    wave += sin(t * 1.7 + freq * 5.0) * 0.3;
    wave += sin(t * 3.1 + freq * 11.0) * 0.2;
    wave += noise(t * 2.0 + freq * 20.0) * 0.3;
    wave += sin(t * 0.7 + freq * 3.0) * 0.15;
    return clamp(wave * 0.5 + 0.5, 0.0, 1.0);
  }

  vec3 auroraCurtain(vec2 s, float t) {
    // Tilt
    float tiltAngle = radians(-45.0);
    float ct = cos(tiltAngle), st2 = sin(tiltAngle);
    s = vec2(s.x * ct - s.y * st2, s.x * st2 + s.y * ct);

    // Second tilt pass
    s = vec2(s.x * ct - s.y * st2, s.x * st2 + s.y * ct);

    // Horizontal mirror fold
    vec2 sv = s;
    float angle = atan(sv.y, sv.x);
    s = sv;

    float per = 2.0 / abs(s.y + 0.001);
    vec3 col = vec3(0.0);

    for (float z = 0.0; z < 1.0; z += 0.05) {
      float d = 1.0 + z;
      vec2 p = vec2(s.x * d, s.y + d) * per;
      p.y += SCROLL * t;

      // Simulated audio wave for this frequency band
      float waveMem = simWave(z, t);

      // Lateral displacement
      float shift = cos(z / 0.06);
      float side = sin(p.y * PI * 3.0);
      p.x += shift + waveMem * side * z * 2.0;
      p.y += waveMem * 2.0 * z;

      float w = p.x;
      float l = sin(p.y * 0.5 + z / 0.08 + SPEED * t);

      // Heat coloring from wave intensity
      float heat = clamp((waveMem - 0.5) * 2.0, 0.0, 1.0);
      float thickness = mix(0.3, 0.05, heat);
      float intensity = exp(min(l, -l / thickness / (1.0 + 4.0 * w * w)));

      float hue = mix(0.62, 0.0, heat);
      float sat = mix(0.6, 1.0, heat);
      float val = mix(0.5, 1.4, heat);
      vec3 tint = hsv2rgb(vec3(hue, sat, val));
      tint += vec3(0.15, 0.0, 0.25) * smoothstep(0.3, 0.7, sin(z * 30.0 + t * 0.7)) * (1.0 - heat);

      col += intensity * tint / (abs(w) + 0.01 * per) * per;
    }

    return clamp(col / 40.0, 0.0, 1.0);
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    vec2 s = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
    float t = u_time;

    // Layered scene
    vec3 city = cityScene(uv);
    vec3 stars = starsScene(uv);
    vec3 fog2 = vec3(1.0) * length(city) * 0.3;
    vec3 background = mix(city, stars, clamp(fog2 * 1.5, 0.0, 1.0));

    // Aurora curtain overlay
    vec3 aurora = auroraCurtain(s, t);

    // Composite
    vec3 col = aurora * aurora + background;

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

  canvas = document.getElementById('auroraCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'auroraCanvas';
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
    console.error('Aurora: shader link error', gl.getProgramInfoLog(program));
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
    console.error('Aurora shader error:', gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const scale = 0.4 * dpr; // Lower res — raymarching is heavy
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
