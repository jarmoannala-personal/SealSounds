// Mandelbrot zoom plugin — renders a slow-zooming fractal as a fullscreen background
// Only loaded on devices with sufficient GPU capability (mid tier or above)

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
  uniform float u_opacity;

  // Cosine palette — vivid colors
  vec3 palette(float t) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 0.7, 0.4);
    vec3 d = vec3(0.0, 0.15, 0.2);
    return a + b * cos(6.28318 * (c * t + d));
  }

  // Interesting Mandelbrot locations to cycle through
  vec2 getCenter(int idx) {
    if (idx == 0) return vec2(-0.7463, 0.1102);     // Seahorse Valley
    if (idx == 1) return vec2(-0.16070135, 1.0375665); // Spiral arm
    if (idx == 2) return vec2(-1.25066, 0.02012);    // Elephant Valley
    if (idx == 3) return vec2(-0.748, 0.1);          // Double spiral
    if (idx == 4) return vec2(0.28693, 0.01428);     // Mini Mandelbrot
    if (idx == 5) return vec2(-0.235125, 0.827215);  // Julia-like cusp
    return vec2(-0.7463, 0.1102);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;

    float aspect = u_resolution.x / u_resolution.y;
    vec2 coord = (uv - 0.5) * vec2(aspect, 1.0);

    // Cycle duration per location (seconds), then reset zoom and move to next
    float cycleDuration = 90.0;
    float cycleTime = mod(u_time, cycleDuration);
    int locIndex = int(mod(floor(u_time / cycleDuration), 6.0));

    vec2 center = getCenter(locIndex);

    // Zoom resets each cycle, with smooth fade at transitions
    float zoom = 1.5 * exp(cycleTime * 0.05);

    // Smooth crossfade near cycle boundary (last 2 seconds)
    float fadeOut = smoothstep(cycleDuration, cycleDuration - 2.0, cycleTime);
    float fadeIn = smoothstep(0.0, 2.0, cycleTime);
    float fade = fadeIn * fadeOut;

    coord = center + coord / zoom;

    // Mandelbrot iteration
    vec2 z = vec2(0.0);
    float iter = 0.0;
    const float maxIter = 200.0;

    for (float i = 0.0; i < 200.0; i++) {
      if (dot(z, z) > 4.0) break;
      z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + coord;
      iter = i;
    }

    // Smooth iteration count (removes banding)
    float smoothIter = iter - log2(log2(dot(z, z))) + 4.0;

    // Color
    vec3 color;
    if (iter >= maxIter - 1.0) {
      color = vec3(0.0);
    } else {
      float t = smoothIter / maxIter;
      t = fract(t * 4.0 + u_time * 0.01);
      color = palette(t);
    }

    color *= fade;

    gl_FragColor = vec4(color, u_opacity);
  }
`;

let canvas = null;
let gl = null;
let program = null;
let animationId = null;
let startTime = 0;
let opacity = 0.0;
let targetOpacity = 0.0;
let uniforms = {};
let isActive = false;

export function init() {
  const container = document.getElementById('pluginCanvas');
  if (!container) return false;

  canvas = document.getElementById('mandelbrotCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'mandelbrotCanvas';
    canvas.style.cssText = 'width:100%;height:100%;position:absolute;top:0;left:0;';
    container.appendChild(canvas);
  }

  gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
  });

  if (!gl) {
    console.warn('Mandelbrot plugin: WebGL not available');
    return false;
  }

  // Compile shaders
  const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vs || !fs) return false;

  program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Mandelbrot plugin: shader link error', gl.getProgramInfoLog(program));
    return false;
  }

  // Full-screen quad
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);

  const posAttr = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posAttr);
  gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

  // Get uniform locations
  uniforms = {
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    time: gl.getUniformLocation(program, 'u_time'),
    opacity: gl.getUniformLocation(program, 'u_opacity'),
  };

  gl.useProgram(program);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  startTime = performance.now() / 1000;

  console.log('Mandelbrot plugin initialized');
  return true;
}

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Mandelbrot shader error:', gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  // Render at half resolution for performance
  const scale = 0.5 * dpr;
  canvas.width = canvas.clientWidth * scale;
  canvas.height = canvas.clientHeight * scale;
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function render() {
  if (!gl || !program) return;

  // Smooth opacity transition
  opacity += (targetOpacity - opacity) * 0.02;

  if (opacity < 0.001) {
    // Skip rendering when fully transparent
    animationId = requestAnimationFrame(render);
    return;
  }

  resize();

  const time = performance.now() / 1000 - startTime;

  gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
  gl.uniform1f(uniforms.time, time);
  gl.uniform1f(uniforms.opacity, opacity);

  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  animationId = requestAnimationFrame(render);
}

export function show(fadeDuration = 3.0) {
  if (!gl) return;
  isActive = true;
  targetOpacity = 0.85;
  if (!animationId) {
    render();
  }
}

export function hide() {
  isActive = false;
  targetOpacity = 0.0;
}

export function toggle() {
  if (isActive) {
    hide();
  } else {
    show();
  }
}

export function destroy() {
  hide();
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}
