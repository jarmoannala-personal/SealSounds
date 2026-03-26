// VU Meters plugin — classic analog amplifier with two needle meters
// Needle movement simulated with layered oscillators + noise

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

  // Simple noise
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float noise(float x) {
    float i = floor(x);
    float f = fract(x);
    return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
  }

  // Simulate audio level — layered oscillators + noise for organic feel
  float audioLevel(float t, float offset) {
    float level = 0.0;
    level += sin(t * 2.1 + offset) * 0.25;
    level += sin(t * 5.7 + offset * 1.3) * 0.15;
    level += sin(t * 0.8 + offset * 0.7) * 0.2;
    level += noise(t * 3.0 + offset) * 0.2;
    level += noise(t * 7.0 + offset * 2.0) * 0.1;
    // Occasional transient spikes
    level += pow(max(sin(t * 1.3 + offset * 0.5), 0.0), 8.0) * 0.3;
    return clamp(level * 0.8 + 0.35, 0.0, 1.0);
  }

  // Draw an arc segment
  float arc(vec2 p, float radius, float width, float startAngle, float endAngle) {
    float angle = atan(p.y, p.x);
    float dist = abs(length(p) - radius);
    float inArc = step(startAngle, angle) * step(angle, endAngle);
    return (1.0 - smoothstep(0.0, width, dist)) * inArc;
  }

  // Draw the meter face for one VU meter
  vec3 drawMeter(vec2 uv, float level) {
    vec3 color = vec3(0.0);

    // Meter background — warm cream
    float meterBg = 1.0 - smoothstep(0.38, 0.4, length(uv - vec2(0.0, -0.15)));
    color += vec3(0.95, 0.92, 0.85) * meterBg * 0.3;

    // Dial arc
    vec2 arcCenter = vec2(0.0, -0.35);
    vec2 ap = uv - arcCenter;

    // Scale markings along the arc
    float arcRadius = 0.35;
    float angle = atan(ap.y, ap.x);
    float dist = length(ap);

    // Arc from 30 to 150 degrees
    float minAngle = PI * 0.2;
    float maxAngle = PI * 0.8;

    // Tick marks
    float ticks = 0.0;
    for (float i = 0.0; i < 11.0; i++) {
      float tickAngle = mix(minAngle, maxAngle, i / 10.0);
      float tickLen = (mod(i, 5.0) == 0.0) ? 0.04 : 0.02;
      vec2 tickDir = vec2(cos(tickAngle), sin(tickAngle));
      float along = dot(ap, tickDir);
      float perp = abs(dot(ap, vec2(-tickDir.y, tickDir.x)));
      float inTick = step(arcRadius - tickLen, along) * step(along, arcRadius) * step(perp, 0.003);
      ticks += inTick;
    }
    color += vec3(0.3, 0.25, 0.2) * ticks;

    // Red zone (last 20% of arc)
    float redZoneStart = mix(minAngle, maxAngle, 0.75);
    float redArc = arc(ap, arcRadius - 0.01, 0.008, redZoneStart, maxAngle);
    color += vec3(0.8, 0.15, 0.1) * redArc;

    // Green zone (first 75%)
    float greenArc = arc(ap, arcRadius - 0.01, 0.006, minAngle, redZoneStart);
    color += vec3(0.15, 0.4, 0.15) * greenArc;

    // Needle
    float needleAngle = mix(minAngle, maxAngle, level);
    vec2 needleDir = vec2(cos(needleAngle), sin(needleAngle));
    float needleLen = arcRadius - 0.02;
    float along = dot(ap, needleDir);
    float perp = abs(dot(ap, vec2(-needleDir.y, needleDir.x)));
    // Tapered needle — thinner at tip
    float taperWidth = 0.003 + (1.0 - along / needleLen) * 0.004;
    float needle = step(0.0, along) * step(along, needleLen) * (1.0 - smoothstep(0.0, taperWidth, perp));
    color += vec3(0.1, 0.1, 0.1) * needle;

    // Needle pivot dot
    float pivot = 1.0 - smoothstep(0.01, 0.015, length(ap));
    color += vec3(0.3, 0.25, 0.2) * pivot;

    // "VU" label
    float labelArea = step(-0.06, uv.x) * step(uv.x, 0.06) * step(-0.05, uv.y) * step(uv.y, 0.0);
    color += vec3(0.4, 0.35, 0.3) * labelArea * 0.3;

    return color;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    uv = (uv - 0.5) * vec2(aspect, 1.0);

    vec3 color = vec3(0.02, 0.02, 0.03); // Dark background

    // Amplifier faceplate — dark brushed metal look
    float plate = smoothstep(0.52, 0.5, abs(uv.x)) * smoothstep(0.42, 0.4, abs(uv.y));
    vec3 metalColor = vec3(0.08, 0.07, 0.06) + noise(uv.y * 200.0 + uv.x * 50.0) * 0.02;
    color = mix(color, metalColor, plate);

    // Subtle brushed metal texture
    float brushed = noise(uv.y * 500.0) * 0.015 * plate;
    color += vec3(brushed);

    // Left meter
    float levelL = audioLevel(u_time, 0.0);
    vec3 meterL = drawMeter((uv - vec2(-0.22, 0.05)) * 2.5, levelL);
    color += meterL;

    // Right meter
    float levelR = audioLevel(u_time, 3.7);
    vec3 meterR = drawMeter((uv - vec2(0.22, 0.05)) * 2.5, levelR);
    color += meterR;

    // Warm amber glow around meters
    float glowL = 0.03 / (0.1 + length(uv - vec2(-0.22, 0.05)));
    float glowR = 0.03 / (0.1 + length(uv - vec2(0.22, 0.05)));
    color += vec3(0.6, 0.4, 0.1) * (glowL + glowR) * 0.15;

    // Panel screws (corners)
    vec2 screwPositions[4];
    screwPositions[0] = vec2(-0.44, 0.34);
    screwPositions[1] = vec2(0.44, 0.34);
    screwPositions[2] = vec2(-0.44, -0.34);
    screwPositions[3] = vec2(0.44, -0.34);
    for (int i = 0; i < 4; i++) {
      float screw = 1.0 - smoothstep(0.012, 0.016, length(uv - screwPositions[i]));
      color += vec3(0.2, 0.18, 0.15) * screw * plate;
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

let canvas = null;
let gl = null;
let program = null;
let animationId = null;
let startTime = 0;
let playTime = 0;      // accumulated time while playing
let lastFrameTime = 0;
let playing = false;
let uniforms = {};
let isActive = false;

export function init() {
  const container = document.getElementById('pluginCanvas');
  if (!container) return false;

  canvas = document.getElementById('vuMetersCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'vuMetersCanvas';
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
    console.error('VU Meters: shader link error', gl.getProgramInfoLog(program));
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
    console.error('VU Meters shader error:', gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const scale = 0.75 * dpr; // Higher res for crisp meter details
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
