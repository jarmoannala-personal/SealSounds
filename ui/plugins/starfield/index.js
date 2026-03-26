// Starfield plugin — flying through stars effect

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

  // Hash function for pseudo-random star positions
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

    vec3 color = vec3(0.0);
    float speed = 0.15 + sin(u_time * 0.08) * 0.05;

    // Multiple star layers at different depths
    for (float layer = 0.0; layer < 4.0; layer++) {
      float depth = 1.0 + layer * 0.8;
      float layerSpeed = speed * (4.0 - layer) / 4.0;
      float t = u_time * layerSpeed;

      // Tile the space for stars at this depth
      float scale = 15.0 + layer * 10.0;
      vec2 st = uv * scale;

      // Move forward in z (simulated by scaling outward from center over time)
      st += vec2(sin(t * 0.3) * 0.5, cos(t * 0.4) * 0.3);

      // Wrap the z-motion
      float z = fract(t * 0.5 + layer * 0.25);

      // Grid cell
      vec2 cell = floor(st);
      vec2 f = fract(st) - 0.5;

      // Star in this cell
      float h = hash(cell + layer * 100.0);
      vec2 starPos = vec2(hash(cell * 1.3 + 7.0), hash(cell * 2.1 + 13.0)) - 0.5;

      float dist = length(f - starPos * 0.4);

      // Star size varies with z-depth and per-star randomness
      float size = (0.02 + h * 0.03) * (1.0 + z * 2.0) / depth;
      float brightness = smoothstep(size, size * 0.3, dist);

      // Twinkling
      float twinkle = 0.7 + 0.3 * sin(u_time * (2.0 + h * 5.0) + h * 6.28);
      brightness *= twinkle;

      // Slight blue-white tint, warmer for bright stars
      vec3 starColor = mix(
        vec3(0.7, 0.8, 1.0),  // blue-white
        vec3(1.0, 0.95, 0.8), // warm white
        h * 0.5
      );

      color += starColor * brightness * (0.4 + z * 0.6);
    }

    // Subtle radial gradient (darker at edges)
    float vignette = 1.0 - 0.3 * length(uv);
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
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

  canvas = document.getElementById('starfieldCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'starfieldCanvas';
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
    console.error('Starfield: shader link error', gl.getProgramInfoLog(program));
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
    console.error('Starfield shader error:', gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const scale = 0.5 * dpr;
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
