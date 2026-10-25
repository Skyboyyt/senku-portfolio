// 3D tile scenes for the hero and contact sections, drawn with hand-written WebGL2 (no library).
// A floor of rounded tiles ripples under the pointer, tiles flip to reveal the two accent colors and cream, and a real
// 3D starburst spins above it. In the hero the floor crumbles away as you scroll; at the contact scene it
// assembles as you arrive. Phones get a smaller floor. Without WebGL2 the flat design stays as it is, and with
// reduced motion turned on a single still frame is drawn.
(() => {
'use strict';
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

// ---- small matrix helpers (column-major, like WebGL) ----
const m4 = {
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s } return o },
  persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o },
  look(e, c, up) {
    const z = norm(sub(e, c)), x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
  },
  inv(m) {
    const a = m, o = new Float32Array(16);
    const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
    const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
    let d = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!d) return o; d = 1 / d;
    o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * d; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * d; o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * d; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * d;
    o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * d; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * d; o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * d; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * d;
    o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * d; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * d; o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * d; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * d;
    o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * d; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * d; o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * d; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * d;
    return o;
  },
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = t => 1 - Math.pow(1 - t, 3);
const back = t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2) };
const hex = h => { h = h.trim(); if (h.startsWith('rgb')) { const v = h.match(/[\d.]+/g).map(Number); return [v[0] / 255, v[1] / 255, v[2] / 255] } h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255] };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Writes a model matrix (T * Rz * Ry * Rx * S) into out at offset o.
function trs(out, o, x, y, z, rx, ry, rz, sx, sy, sz) {
  const cx = Math.cos(rx), sx_ = Math.sin(rx), cy = Math.cos(ry), sy_ = Math.sin(ry), cz = Math.cos(rz), sz_ = Math.sin(rz);
  const m00 = cz * cy, m01 = cz * sy_ * sx_ - sz_ * cx, m02 = cz * sy_ * cx + sz_ * sx_;
  const m10 = sz_ * cy, m11 = sz_ * sy_ * sx_ + cz * cx, m12 = sz_ * sy_ * cx - cz * sx_;
  const m20 = -sy_, m21 = cy * sx_, m22 = cy * cx;
  out[o] = m00 * sx; out[o + 1] = m10 * sx; out[o + 2] = m20 * sx; out[o + 3] = 0;
  out[o + 4] = m01 * sy; out[o + 5] = m11 * sy; out[o + 6] = m21 * sy; out[o + 7] = 0;
  out[o + 8] = m02 * sz; out[o + 9] = m12 * sz; out[o + 10] = m22 * sz; out[o + 11] = 0;
  out[o + 12] = x; out[o + 13] = y; out[o + 14] = z; out[o + 15] = 1;
}

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor;
layout(location=2) in vec4 iM0; layout(location=3) in vec4 iM1; layout(location=4) in vec4 iM2; layout(location=5) in vec4 iM3;
layout(location=6) in vec4 iCol; layout(location=7) in vec4 iSize;
uniform mat4 uVP;
out vec3 vN; out vec3 vW; out vec3 vL; out vec4 vC; out vec3 vS;
void main(){
  mat4 M = mat4(iM0,iM1,iM2,iM3);
  vec4 w = M*vec4(aPos,1.);
  vN = mat3(M)*(aNor/(iSize.xyz*iSize.xyz)); vW = w.xyz; vL = aPos; vC = iCol; vS = iSize.xyz;
  gl_Position = uVP*w;
}`;
const FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec3 vL; in vec4 vC; in vec3 vS;
uniform vec3 uCam; uniform vec3 uBg; uniform vec3 uEdge; uniform vec3 uGlow; uniform vec2 uFog; uniform float uDark;
out vec4 o;
void main(){
  vec3 n = normalize(vN);
  vec3 e = (0.5 - abs(vL)) * vS;                       // distance to each pair of faces, in world units
  float a = min(e.x, e.y), b = max(e.x, e.y);
  float edgeD = max(a, min(b, e.z));                  // second-smallest: distance to the nearest edge
  float edge = 1.0 - smoothstep(0.0, 0.03, edgeD);
  vec3 L = normalize(vec3(-0.45, 0.85, 0.35));
  vec3 V = normalize(uCam - vW);
  float diff = max(dot(n, L), 0.0);
  float hemi = n.y * 0.5 + 0.5;
  float spec = pow(max(dot(reflect(-L, n), V), 0.0), 36.0);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 base = vC.rgb;
  vec3 col = base * (0.42 + 0.38 * hemi + 0.45 * diff);
  col += spec * mix(0.12, 0.35, uDark) + fres * mix(0.03, 0.08, uDark);
  col = mix(col, uEdge, edge * 0.85);
  col += uGlow * vC.a;
  float d = distance(vW, uCam);
  col = mix(col, uBg, smoothstep(uFog.x, uFog.y, d));
  o = vec4(col, 1.0);
}`;

function cube() {
  const p = [], n = [], idx = [];
  const faces = [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]];
  faces.forEach(f => {
    const u = f[1] ? [1, 0, 0] : [0, 1, 0], v = cross(f, u), base = p.length / 3;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([s, t]) => { p.push(.5 * (f[0] + s * u[0] + t * v[0]), .5 * (f[1] + s * u[1] + t * v[1]), .5 * (f[2] + s * u[2] + t * v[2])); n.push(...f) });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return { p: new Float32Array(p), n: new Float32Array(n), i: new Uint16Array(idx) };
}

function createScene(scene, opts) {
  const canvas = document.createElement('canvas');
  canvas.className = 'gl';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s };
  const prog = gl.createProgram();
  try { gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog)) } catch (e) { return null }
  const U = n => gl.getUniformLocation(prog, n);
  const u = { vp: U('uVP'), cam: U('uCam'), bg: U('uBg'), edge: U('uEdge'), glow: U('uGlow'), fog: U('uFog'), dark: U('uDark') };

  const small = innerWidth < 720;
  const cols = small ? 13 : 30, rows = small ? 16 : 18, STAR = 10;
  const count = cols * rows + STAR, STRIDE = 24;
  const data = new Float32Array(count * STRIDE);
  const geo = cube();
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = (arr, loc, size) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0) };
  vb(geo.p, 0, 3); vb(geo.n, 1, 3);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.i, gl.STATIC_DRAW);
  const inst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, inst); gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  for (let k = 0; k < 6; k++) { const loc = 2 + k; gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, STRIDE * 4, k * 16); gl.vertexAttribDivisor(loc, 1) }
  gl.bindVertexArray(null);

  // Tiles: one entry per grid cell with its own random seed.
  const tiles = []; let freeTiles = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (c - (cols - 1) / 2) * 1.0, z = 3.2 - r * 1.0;
    tiles.push({ x, z, seed: Math.random(), seed2: Math.random(), dist: Math.hypot(x, z + 4), pop: -1e9, popCol: null, row: r, free: false });
  }
  // Accent colors come from the CSS tokens, so the floor follows the visitor's chosen accent pair.
  const palette = { orange: hex('#ff6a3d'), lime: hex('#c8f04e'), cream: hex('#f3efe4') };
  let colors = {};
  const readTheme = () => {
    const cs = getComputedStyle(scene), css = (name, fallback) => hex(cs.getPropertyValue(name).trim() || fallback);
    const bg = css('--bg', '#0e0f12'), dark = (bg[0] + bg[1] + bg[2]) / 3 < .5;
    palette.orange = css('--accent', '#ff6a3d'); palette.lime = css('--accent-2', '#c8f04e');
    // The warm glow under the pointer is a darker, more saturated version of the main accent.
    const glow = k => palette.orange.map(v => Math.pow(v, 1.4) * k);
    colors = dark
      ? { bg, tile: mix(bg, [1, 1, 1], .055), edge: mix(bg, [1, 1, 1], .17), glow: glow(.55), dark: 1, star: opts.star === 'lime' ? palette.lime : palette.orange }
      : { bg, tile: mix(bg, [0, 0, 0], .045), edge: mix(bg, [0, 0, 0], .16), glow: glow(.45), dark: 0, star: opts.star === 'lime' ? css('--accent-2-deep', '#94bd18') : css('--accent-deep', '#e8531f') };
  };
  readTheme();

  // Camera and pointer state.
  let W = 1, H = 1, vp, ivp, eye, fov = small ? 48 : 34;
  const target = [0, 0, -3.2];
  const ptr = { x: 0, y: 0, nx: 0, ny: 0, wx: 0, wz: 0, s: 0, ts: 0 };
  let anchor = { x: .78, y: .22, h: .16 };
  const camera = () => {
    eye = small ? [0, 9.4, 9.8] : [0, 7.4, 10.4];
    const proj = m4.persp(fov * Math.PI / 180, W / H, .1, 80);
    vp = m4.mul(proj, m4.look(eye, target, [0, 1, 0])); ivp = m4.inv(vp);
  };
  const unproject = (nx, ny) => {
    const p = (z) => { const v = [nx, ny, z, 1], o = [0, 0, 0, 0]; for (let r = 0; r < 4; r++) o[r] = ivp[r] * v[0] + ivp[4 + r] * v[1] + ivp[8 + r] * v[2] + ivp[12 + r]; return [o[0] / o[3], o[1] / o[3], o[2] / o[3]] };
    return [p(-1), p(1)];
  };
  const floorPoint = (nx, ny) => { const [a, b] = unproject(nx, ny), d = sub(b, a), t = -a[1] / (d[1] || -1e-6); return t > 0 ? [a[0] + d[0] * t, a[2] + d[2] * t] : null };
  const resize = () => {
    const r = scene.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, small ? 1.5 : 1.6);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    camera();
    // Centre from the anchor's box; size from its layout width, so its own spin-in animation doesn't shrink it.
    if (opts.anchor) { const a = opts.anchor.getBoundingClientRect(), size = parseFloat(getComputedStyle(opts.anchor).width) || a.width; anchor = { x: (a.left + a.width / 2 - r.left) / W, y: (a.top + a.height / 2 - r.top) / H, h: size / H } }
    computeFree();
    if (!running) draw(performance.now());
  };
  // Tiles may only flip where they don't land behind text: project each tile to the screen and test it
  // against the boxes of the scene's text blocks.
  function computeFree() {
    const sr = scene.getBoundingClientRect(), pad = 18;
    // Boxes for buttons and pills; for text, the boxes of the actual lines (so empty space beside a heading stays free).
    const rectsOf = el => { if (el.matches('.button,.announce,.cta-bar,.contact-links a,.starburst,.copy-email')) return [el.getBoundingClientRect()]; const rg = document.createRange(); rg.selectNodeContents(el); return [...rg.getClientRects()] };
    const boxes = (opts.avoid || []).flatMap(sel => [...scene.querySelectorAll(sel)]).flatMap(rectsOf).filter(b => b.width > 0 && b.height > 0).map(b => [b.left - sr.left - pad, b.top - sr.top - pad, b.right - sr.left + pad, b.bottom - sr.top + pad]);
    const toScreen = (x, y, z) => { const c = [0, 0, 0, 0]; for (let k = 0; k < 4; k++) c[k] = vp[k] * x + vp[4 + k] * y + vp[8 + k] * z + vp[12 + k]; return [(c[0] / c[3] * .5 + .5) * W, (1 - (c[1] / c[3] * .5 + .5)) * H] };
    tiles.forEach(tl => {
      const pts = []; for (const dy of [0, 1]) for (const dx of [-.5, .5]) for (const dz of [-.5, .5]) pts.push(toScreen(tl.x + dx, dy, tl.z + dz));
      const [cx, cy] = toScreen(tl.x, .5, tl.z);
      tl.free = tl.row > 0 && cx > 0 && cx < W && cy > 0 && cy < H && pts.every(([sx, sy]) => !boxes.some(b => sx > b[0] && sx < b[2] && sy > b[1] && sy < b[3]));
    });
    freeTiles = tiles.filter(tl => tl.free); canvas.dataset.free = freeTiles.length;
  }

  scene.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const r = scene.getBoundingClientRect();
    ptr.nx = ((e.clientX - r.left) / W) * 2 - 1; ptr.ny = 1 - ((e.clientY - r.top) / H) * 2; ptr.ts = 1;
  });
  scene.addEventListener('pointerleave', () => { ptr.ts = 0 });

  // Scroll progress for crumble (hero) or assemble (contact).
  const progress = () => {
    const r = scene.getBoundingClientRect();
    return opts.mode === 'assemble' ? clamp((innerHeight - r.top) / (innerHeight * .95)) : clamp(-r.top / (r.height * .85));
  };

  let start = null, running = false, raf = 0, lastPop = 0, introAt = null;
  function draw(now) {
    if (start === null) start = now;
    const t = (now - start) / 1000, still = reduced.matches;
    const p = still ? (opts.mode === 'assemble' ? 1 : 0) : progress();
    // pointer: ease toward the floor point under the cursor
    ptr.s += ((still ? 0 : ptr.ts) - ptr.s) * .08;
    if (ptr.ts) { const fp = floorPoint(ptr.nx, ptr.ny); if (fp) { ptr.wx += (fp[0] - ptr.wx) * .18; ptr.wz += (fp[1] - ptr.wz) * .18 } }
    ptr.x += (ptr.nx * ptr.ts - ptr.x) * .06; ptr.y += (ptr.ny * ptr.ts - ptr.y) * .06;

    // occasional tile flips on the open side of the floor
    if (!still && opts.pops && freeTiles.length && now - lastPop > (small ? 520 : 300)) {
      lastPop = now;
      const cand = freeTiles[(Math.random() * freeTiles.length) | 0];
      if (now - cand.pop > 4200) { cand.pop = now; cand.popCol = ['orange', 'orange', 'cream', 'lime'][(Math.random() * 4) | 0] }
    }
    const intro = still ? 1 : introAt === null ? 0 : (now - introAt) / 1000;
    let o = 0;
    for (let i = 0; i < tiles.length; i++, o += STRIDE) {
      const tl = tiles[i];
      let y = -.2, rx = 0, ry = 0, rz = 0, sy = .4, col = colors.tile, glow = 0, x = tl.x, z = tl.z;
      if (!still) y += .13 * Math.sin(tl.x * .55 + t * 1.1) * Math.cos(tl.z * .45 + t * .8);
      // pointer ripple: tiles near the cursor lift and warm up
      const dx = tl.x - ptr.wx, dz = tl.z - ptr.wz, d2 = dx * dx + dz * dz;
      const bump = Math.exp(-d2 / 4.2) * ptr.s;
      const ring = Math.exp(-Math.pow(Math.sqrt(d2) - ((t * 4) % 9), 2) / 1.2) * ptr.s * .25;
      y += bump * 1.05 + ring; glow += bump * .55;
      // flips
      const pe = (now - tl.pop) / 1000;
      if (pe >= 0 && pe < 3.6) {
        const f = pe < .8 ? ease(pe / .8) : pe < 2.6 ? 1 : 1 - ease((pe - 2.6) / 1);
        rx = f * Math.PI; y += Math.sin(f * Math.PI) * .7;
        if (f > .5) { col = palette[tl.popCol]; glow += colors.dark ? .05 : 0 }
      }
      // intro: tiles rise from below, centre first
      const it = clamp((intro - tl.dist * .045 - tl.seed * .15) / .9);
      if (it < 1) { y -= (1 - back(it)) * 5; rz += (1 - it) * (tl.seed - .5) * 1.2 }
      // scroll: crumble away (hero) or assemble into place (contact)
      if (opts.mode === 'assemble') {
        const k = clamp((1 - p) * 1.5 - tl.seed * .4 - (rows - tl.row) / rows * .3);
        if (k > 0) { const e = k * k; y += e * (6 + tl.seed2 * 8); rx += e * (tl.seed - .5) * 6; rz += e * (tl.seed2 - .5) * 6; x += e * (tl.seed - .5) * 6 }
      } else {
        const order = (rows - tl.row) / rows * .55 + tl.seed * .35;
        const k = clamp((p * 1.7 - order) / .55);
        if (k > 0) { const e = k * k; y -= e * (7 + tl.seed2 * 9); rx += e * (tl.seed - .5) * 7; rz += e * (tl.seed2 - .5) * 5; z += e * 1.5 }
      }
      trs(data, o, x, y, z, rx, ry, rz, .9, sy, .9);
      data[o + 16] = col[0]; data[o + 17] = col[1]; data[o + 18] = col[2]; data[o + 19] = glow;
      data[o + 20] = .9; data[o + 21] = sy; data[o + 22] = .9; data[o + 23] = 0;
    }
    // starburst: ten bars in a plane facing the camera, spinning and leaning toward the pointer
    const [na, nb] = unproject(anchor.x * 2 - 1, 1 - anchor.y * 2), dir = norm(sub(nb, na)), D = small ? 9 : 11;
    const cx = eye[0] + dir[0] * D, cy = eye[1] + dir[1] * D, cz = eye[2] + dir[2] * D;
    const worldH = 2 * D * Math.tan(fov * Math.PI / 360) * anchor.h, R = worldH / 2;
    const fwd = norm(sub(eye, [cx, cy, cz])), right = norm(cross([0, 1, 0], fwd)), up = cross(fwd, right);
    const spin = (still ? .3 : t * .55) + p * 5 * (opts.mode === 'assemble' ? -1 : 1);
    const lean = [ptr.x * .55, -ptr.y * .45];
    const sIn = opts.mode === 'assemble' ? clamp(p * 1.6 - .5) : clamp(intro * 1.4 - .3);
    const scaleIn = still ? 1 : back(clamp(sIn)) * (opts.mode === 'assemble' ? 1 : 1 + p * 1.6);
    for (let j = 0; j < STAR; j++, o += STRIDE) {
      const a = j / STAR * Math.PI * 2 + spin, len = .5 * R * 2 * .48, thick = R * .16;
      // bar centre in the star plane (local x,y), then lean in 3D
      let lx = Math.sin(a) * R * .74, ly = Math.cos(a) * R * .74, lz = 0;
      const cyl = Math.cos(lean[0]), syl = Math.sin(lean[0]), cxl = Math.cos(lean[1]), sxl = Math.sin(lean[1]);
      let tx = lx * cyl + lz * syl, tz = -lx * syl + lz * cyl; lx = tx; lz = tz;
      let ty = ly * cxl - lz * sxl; tz = ly * sxl + lz * cxl; ly = ty; lz = tz;
      const wx = cx + (right[0] * lx + up[0] * ly + fwd[0] * lz) * scaleIn, wy = cy + (right[1] * lx + up[1] * ly + fwd[1] * lz) * scaleIn, wz = cz + (right[2] * lx + up[2] * ly + fwd[2] * lz) * scaleIn;
      // orientation: build the bar's basis (along the spoke, across, and depth) in world space
      const along = [Math.sin(a), Math.cos(a), 0], across = [Math.cos(a), -Math.sin(a), 0];
      const rot = v => { let [x1, y1, z1] = v; let x2 = x1 * cyl + z1 * syl, z2 = -x1 * syl + z1 * cyl; let y2 = y1 * cxl - z2 * sxl, z3 = y1 * sxl + z2 * cxl; return [right[0] * x2 + up[0] * y2 + fwd[0] * z3, right[1] * x2 + up[1] * y2 + fwd[1] * z3, right[2] * x2 + up[2] * y2 + fwd[2] * z3] };
      const A = rot(along), B = rot(across), C = rot([0, 0, 1]);
      const s1 = thick * scaleIn, s2 = len * scaleIn, s3 = thick * 1.1 * scaleIn;
      data.set([B[0] * s1, B[1] * s1, B[2] * s1, 0, A[0] * s2, A[1] * s2, A[2] * s2, 0, C[0] * s3, C[1] * s3, C[2] * s3, 0, wx, wy, wz, 1], o);
      const sc = colors.star;
      data[o + 16] = sc[0]; data[o + 17] = sc[1]; data[o + 18] = sc[2]; data[o + 19] = colors.dark ? .18 : .1;
      data[o + 20] = s1 || .001; data[o + 21] = s2 || .001; data[o + 22] = s3 || .001; data[o + 23] = 0;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(colors.bg[0], colors.bg[1], colors.bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(u.vp, false, vp); gl.uniform3fv(u.cam, eye); gl.uniform3fv(u.bg, colors.bg); gl.uniform3fv(u.edge, colors.edge);
    gl.uniform3fv(u.glow, colors.glow); gl.uniform2f(u.fog, small ? 12 : 13, small ? 25 : 27); gl.uniform1f(u.dark, colors.dark);
    gl.bindBuffer(gl.ARRAY_BUFFER, inst); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.bindVertexArray(vao); gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, count); gl.bindVertexArray(null);
  }
  const loop = now => { draw(now); raf = running ? requestAnimationFrame(loop) : 0 };
  const play = () => { if (running || reduced.matches || document.hidden) return; running = true; raf = requestAnimationFrame(loop) };
  const pause = () => { running = false; cancelAnimationFrame(raf); raf = 0 };

  scene.prepend(canvas);
  scene.classList.add('gl-on');
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(scene); else addEventListener('resize', resize);
  let visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? play() : pause() }, { rootMargin: '80px 0px' }).observe(scene);
  document.addEventListener('visibilitychange', () => document.hidden ? pause() : visible && play());
  reduced.addEventListener('change', () => { if (reduced.matches) { pause(); draw(performance.now()) } else if (visible) play() });
  addEventListener('scroll', () => { if (!running && visible) draw(performance.now()) }, { passive: true });
  new MutationObserver(() => { readTheme(); if (!running) draw(performance.now()) }).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readTheme(); if (!running) draw(performance.now()) });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); pause(); canvas.remove(); scene.classList.remove('gl-on') });

  const begin = () => { if (introAt === null) introAt = performance.now() };
  if (opts.mode === 'assemble' || root.classList.contains('hero-in')) begin();
  else new MutationObserver((_, ob) => { if (root.classList.contains('hero-in')) { begin(); ob.disconnect() } }).observe(root, { attributes: true, attributeFilter: ['class'] });
  // Text positions settle after the web fonts load and the entrance animations finish: measure again then.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(computeFree);
  setTimeout(computeFree, 2200); setTimeout(computeFree, 4500);
  draw(performance.now());
  return { canvas };
}

const init = () => {
  try {
    const probe = document.createElement('canvas').getContext('webgl2');
    if (!probe) return;
  } catch (e) { return }
  const hero = document.querySelector('.hero'), contact = document.querySelector('.contact');
  if (hero) createScene(hero, { mode: 'crumble', star: 'orange', anchor: hero.querySelector('.starburst'), pops: true, avoid: ['.hero-title', '.hero-tag', '.hero-intro', '.hero-copy .button', '.announce', '.availability', '.starburst'] });
  if (contact) createScene(contact, { mode: 'assemble', star: 'lime', anchor: contact.querySelector('.starburst'), pops: true, avoid: ['.label', '.contact-head .title', '.contact-intro', '.cta-bar', '.copy-email', '.sign', '.contact-links a', '.starburst'] });
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
