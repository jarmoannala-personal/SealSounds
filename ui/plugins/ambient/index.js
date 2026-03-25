// Ambient smoke/wisp effect — subtle organic background for the search screen
// Uses WebGL with a noise-based fragment shader

const VERTEX_SHADER = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// Simplex-style noise + fbm for organic smoke wisps
const FRAGMENT_SHADER = `
  precision mediump float;

  uniform vec2 u_resolution;
  uniform float u_time;

  // Hash functions for noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  // 2D simplex noise
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Fractal Brownian Motion — layered noise for organic smoke
  float fbm(vec2 p) {
    float f = 0.0;
    float w = 0.5;
    for (int i = 0; i < 5; i++) {
      f += w * snoise(p);
      p *= 2.1;
      w *= 0.48;
    }
    return f;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;

    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float t = u_time * 0.08;

    // Two layers of warped noise for smoke effect
    float n1 = fbm(p * 2.0 + vec2(t * 0.7, t * 0.3));
    float n2 = fbm(p * 3.0 + vec2(-t * 0.5, t * 0.6) + n1 * 0.5);
    float n3 = fbm(p * 1.5 + vec2(t * 0.2, -t * 0.4) + n2 * 0.3);

    // Combine into smoke wisps
    float smoke = n1 * 0.3 + n2 * 0.4 + n3 * 0.3;
    smoke = smoothstep(-0.3, 0.6, smoke);

    // Warm ember tones — boosted for visibility
    vec3 color1 = vec3(0.6, 0.12, 0.05);  // warm red
    vec3 color2 = vec3(0.15, 0.08, 0.35); // purple
    vec3 color3 = vec3(0.5, 0.3, 0.06);   // amber

    float blend = snoise(p * 1.0 + t * 0.1);
    vec3 smokeColor = mix(color1, color2, smoothstep(-0.3, 0.3, blend));
    smokeColor = mix(smokeColor, color3, smoothstep(0.0, 0.6, n3));

    // Soft vignette — wide center area stays bright
    float vignette = 1.0 - smoothstep(0.5, 1.5, length(p));

    vec3 finalColor = smokeColor * smoke * vignette * 1.5;

    // Bright flickers (like distant embers)
    float flicker = snoise(p * 8.0 + t * 2.0);
    flicker = pow(max(flicker, 0.0), 5.0) * 0.5;
    finalColor += vec3(0.6, 0.2, 0.04) * flicker * vignette;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

let canvas = null;
let gl = null;
let program = null;
let animationId = null;
let startTime = 0;
let uniforms = {};
let isRunning = false;

export function init() {
  canvas = document.getElementById('ambientCanvas');
  if (!canvas) return false;

  gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
  if (!gl) {
    console.warn('Ambient plugin: WebGL not available');
    return false;
  }

  const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vs || !fs) return false;

  program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Ambient plugin: shader link error', gl.getProgramInfoLog(program));
    return false;
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
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

  console.log('Ambient smoke plugin initialized');
  return true;
}

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Ambient shader error:', gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const scale = 0.4 * dpr; // Low resolution for performance — it's a subtle background
  canvas.width = canvas.clientWidth * scale;
  canvas.height = canvas.clientHeight * scale;
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function render() {
  if (!gl || !program || !isRunning) return;

  resize();

  const time = performance.now() / 1000 - startTime;
  gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
  gl.uniform1f(uniforms.time, time);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
  animationId = requestAnimationFrame(render);
}

export function show() {
  if (!gl) return;
  isRunning = true;
  canvas.classList.add('active');
  if (!animationId) render();
}

export function hide() {
  isRunning = false;
  canvas.classList.remove('active');
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}
