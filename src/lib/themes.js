// Ten flat party themes. No gradients anywhere: solid shapes, hard edges, a little jiggle.
// draw(ctx, w, h, t, e) paints the whole backdrop. The floor band is yFloor*h .. h.
export const THEME_INFO = {
  neon: { label: 'Neon Club', emoji: '🟣' }, disco: { label: 'Disco Ball', emoji: '🪩' }, fairy: { label: 'Fairy Garden', emoji: '🧚' },
  spooky: { label: 'Spooky Night', emoji: '🎃' }, beach: { label: 'Beach Party', emoji: '🏖️' }, space: { label: 'Space Rave', emoji: '🚀' },
  cyber: { label: 'Cyber City', emoji: '🤖' }, cozy: { label: 'Cozy Room', emoji: '🛋️' }, concert: { label: 'Concert Stage', emoji: '🎤' }, forest: { label: 'Forest Camp', emoji: '🌲' },
};

const INK = '#1b1b2f';
const rect = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const circ = (c, col, x, y, r) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2); c.fill(); };
const tri = (c, col, x1, y1, x2, y2, x3, y3) => { c.fillStyle = col; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.closePath(); c.fill(); };
const rnd = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const stars = (c, w, h, t, n, col, maxY = 0.7) => { for (let i = 0; i < n; i++) { const tw = 0.5 + 0.5 * Math.sin(t * 2 + i * 7); c.globalAlpha = 0.35 + 0.65 * tw; rect(c, col, rnd(i) * w, rnd(i + 99) * h * maxY, 3 + (i % 3), 3 + (i % 3)); } c.globalAlpha = 1; };
const edge = (c, w, y) => rect(c, INK, 0, y - 3, w, 6);
const step = (n, t, speed = 1) => Math.floor(t * speed) % n;

export const FLOOR_Y = 0.52;

export const THEMES = {
  neon: { floor: '#2a1450', sky: '#140a2e', draw(c, w, h, t, e) {
    const fy = h * FLOOR_Y; rect(c, this.sky, 0, 0, w, fy); rect(c, this.floor, 0, fy, w, h - fy); edge(c, w, fy);
    const cols = ['#ff3ea5', '#2ee6ff', '#b4ff39'];
    for (let i = 0; i < 6; i++) { const x = w * (0.1 + i * 0.16), bh = h * (0.12 + 0.1 * (0.5 + 0.5 * Math.sin(t * 3 + i)) * (0.4 + e)); rect(c, cols[i % 3], x, fy - bh - 10, w * 0.05, bh); }
    c.strokeStyle = '#ff3ea5'; c.lineWidth = 3; for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(w / 2 + i * w * 0.02, fy); c.lineTo(w / 2 + i * w * 0.2, h); c.stroke(); }
    c.strokeStyle = '#2ee6ff'; for (let i = 0; i < 5; i++) { const y = fy + (h - fy) * ((i + (t * 0.3) % 1) / 5) ** 1.6; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    rect(c, '#ff3ea5', w * 0.5 - 90, h * 0.07, 180, 10); rect(c, '#2ee6ff', w * 0.5 - 60, h * 0.07 + 18, 120, 6);
  } },
  disco: { floor: '#3b1c6e', sky: '#1d0f3d', draw(c, w, h, t, e) {
    const fy = h * FLOOR_Y; rect(c, this.sky, 0, 0, w, fy); edge(c, w, fy);
    const cols = ['#ff4d6d', '#ffd23f', '#3ddc97', '#4cc9f0'], tile = 56, rows = Math.ceil((h - fy) / tile * 1.2);
    for (let r = 0; r < rows; r++) for (let q = 0; q * tile < w; q++) rect(c, cols[(q + r + step(4, t, 2.5)) % 4], q * tile + 1, fy + r * tile * 0.8 + 1, tile - 2, tile * 0.8 - 2);
    rect(c, INK, w / 2 - 2, 0, 4, h * 0.14); const br = h * 0.1 * (1 + e * 0.06); circ(c, '#e8e8f5', w / 2, h * 0.14 + br, br); circ(c, INK, w / 2, h * 0.14 + br, br + 0, 0);
    c.fillStyle = '#b9b9d6'; for (let i = 0; i < 28; i++) { const a = i * 2.4 + t * 0.8, rr = br * 0.85 * (((i * 37) % 10) / 10 + 0.1); if (Math.cos(a) > -0.2) rect(c, i % 3 ? '#b9b9d6' : '#ffffff', w / 2 + Math.sin(a) * rr - 6, h * 0.14 + br + Math.cos(i * 1.7) * rr - 6, 12, 12); }
    stars(c, w, h, t, 16, '#ffd23f', 0.5);
  } },
  fairy: { floor: '#9be29b', sky: '#ffe3f1', draw(c, w, h, t) {
    const fy = h * FLOOR_Y; rect(c, this.sky, 0, 0, w, fy); circ(c, '#fff6a8', w * 0.82, h * 0.13, h * 0.07); rect(c, this.floor, 0, fy, w, h - fy); edge(c, w, fy);
    [[0.12, 1], [0.35, 0.7], [0.7, 0.85], [0.9, 0.6]].forEach(([x, k], i) => { const px = w * x, base = fy + 6, s = h * 0.16 * k; rect(c, '#fff', px - s * 0.09, base - s * 0.5, s * 0.18, s * 0.5); circ(c, i % 2 ? '#ff7eb6' : '#b28dff', px, base - s * 0.5, s * 0.34); c.fillStyle = '#fff'; [-0.15, 0.12, 0].forEach((o, j) => { c.beginPath(); c.arc(px + o * s, base - s * (0.5 + (j - 1) * 0.07), s * 0.06, 0, 7); c.fill(); }); });
    for (let i = 0; i < 14; i++) { const x = (rnd(i) * w + Math.sin(t + i) * 30), y = h * 0.1 + rnd(i + 5) * fy * 0.8 + Math.cos(t * 1.3 + i) * 14; c.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3 + i); rect(c, '#ffb703', x, y, 7, 7); rect(c, '#ffb703', x + 2, y - 3, 3, 13); rect(c, '#ffb703', x - 3, y + 2, 13, 3); } c.globalAlpha = 1;
  } },
  spooky: { floor: '#2d2438', sky: '#171126', draw(c, w, h, t) {
    const fy = h * FLOOR_Y; rect(c, this.sky, 0, 0, w, fy); circ(c, '#ffb347', w * 0.78, h * 0.15, h * 0.1); circ(c, '#ffd28a', w * 0.78 - 12, h * 0.15 - 8, h * 0.02);
    rect(c, this.floor, 0, fy, w, h - fy); edge(c, w, fy);
    for (let i = 0; i < 5; i++) { const x = w * (0.08 + i * 0.2) + (i % 2) * 12, s = h * 0.1 * (0.8 + (i % 3) * 0.2); rect(c, '#6e6a85', x, fy - s, s * 0.7, s); circ(c, '#6e6a85', x + s * 0.35, fy - s, s * 0.35); rect(c, '#4a4660', x + s * 0.3, fy - s * 0.8, s * 0.1, s * 0.4); rect(c, '#4a4660', x + s * 0.15, fy - s * 0.65, s * 0.4, s * 0.09); }
    for (let i = 0; i < 4; i++) { const x = ((t * 60 + i * w / 4) % (w + 80)) - 40, y = h * 0.12 + i * 38 + Math.sin(t * 5 + i) * 14, f = Math.sin(t * 14 + i) * 7; tri(c, '#0b0813', x - 24, y - f, x, y + 8, x - 8, y + 4); tri(c, '#0b0813', x + 24, y - f, x, y + 8, x + 8, y + 4); circ(c, '#0b0813', x, y + 4, 7); }
    stars(c, w, h, t, 14, '#fff3c4', 0.35);
  } },
  beach: { floor: '#f6d58e', sky: '#8fdcff', draw(c, w, h, t) {
    const fy = h * FLOOR_Y, sea = fy - h * 0.12; rect(c, this.sky, 0, 0, w, sea); circ(c, '#fff176', w * 0.2, h * 0.14, h * 0.08);
    rect(c, '#2ca6e0', 0, sea, w, fy - sea); for (let x = -40; x < w + 40; x += 80) rect(c, '#e9faff', x + ((t * 30) % 80), sea + 10 + ((x / 80) % 2) * 14, 44, 5);
    rect(c, this.floor, 0, fy, w, h - fy); edge(c, w, fy); rect(c, '#ffffff', 0, fy + 6, w, 5);
    const px = w * 0.88; rect(c, '#9a6b3a', px, fy - h * 0.34, 16, h * 0.34); for (let i = 0; i < 5; i++) { const a = -2.6 + i * 0.55 + Math.sin(t * 1.5) * 0.05; c.strokeStyle = '#2e9e4f'; c.lineWidth = 12; c.lineCap = 'round'; c.beginPath(); c.moveTo(px + 8, fy - h * 0.34); c.lineTo(px + 8 + Math.cos(a) * 90, fy - h * 0.34 + Math.sin(a) * 50 + 40); c.stroke(); }
    const ux = w * 0.1; rect(c, INK, ux, fy - h * 0.2, 5, h * 0.2); tri(c, '#ff5d73', ux - 70, fy - h * 0.2, ux + 75, fy - h * 0.2, ux + 2, fy - h * 0.3); tri(c, '#fff', ux - 22, fy - h * 0.2, ux + 28, fy - h * 0.2, ux + 2, fy - h * 0.3);
  } },
  space: { floor: '#2b2f6b', sky: '#0b0d24', draw(c, w, h, t, e) {
    const fy = h * FLOOR_Y; rect(c, this.sky, 0, 0, w, fy); stars(c, w, h, t, 50, '#fff', 0.52);
    circ(c, '#ff7b54', w * 0.2, h * 0.2, h * 0.11); rect(c, '#ffb26b', w * 0.2 - h * 0.1, h * 0.2 - 6, h * 0.2, 10); circ(c, '#8d99ff', w * 0.8, h * 0.12, h * 0.05 * (1 + e * 0.1)); c.strokeStyle = '#d6dbff'; c.lineWidth = 4; c.beginPath(); c.ellipse(w * 0.8, h * 0.12, h * 0.09, h * 0.02, -0.3, 0, 7); c.stroke();
    const sx = ((t * 40) % (w + 200)) - 100; rect(c, '#e8e8f5', sx, h * 0.3, 40, 12); tri(c, '#ff4d6d', sx + 40, h * 0.3, sx + 40, h * 0.3 + 12, sx + 58, h * 0.3 + 6);
    rect(c, this.floor, 0, fy, w, h - fy); edge(c, w, fy); c.strokeStyle = '#7d86ff'; c.lineWidth = 3; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(w * i / 7, fy); c.lineTo(w * (i / 7 - 0.5) * 1.6 + w * 0.5, h); c.stroke(); }
  } },
  cyber: { floor: '#0f2a20', sky: '#06130f', draw(c, w, h, t, e) {
    const fy = h * FLOOR_Y; rect(c, this.sky, 0, 0, w, fy);
    for (let i = 0; i < 9; i++) { const bw = w * (0.07 + rnd(i) * 0.05), bh = h * (0.15 + rnd(i + 3) * 0.28), x = w * i * 0.115 + 6; rect(c, '#0e3a2c', x, fy - bh, bw, bh); for (let r = 0; r < bh / 22; r++) for (let q = 0; q < bw / 20; q++) if (rnd(i * 100 + r * 10 + q + step(30, t, 1.3)) > 0.55) rect(c, '#3dff9a', x + 6 + q * 18, fy - bh + 8 + r * 20, 8, 10); }
    rect(c, '#3dff9a', 0, fy - 4, w, 4); rect(c, this.floor, 0, fy, w, h - fy); edge(c, w, fy);
    c.strokeStyle = '#1fa86a'; c.lineWidth = 2; for (let i = 0; i < 12; i++) { c.beginPath(); c.moveTo(w * i / 11, fy); c.lineTo(w * (i / 11 - 0.5) * 2.4 + w * 0.5, h); c.stroke(); } for (let i = 0; i < 5; i++) { const y = fy + (h - fy) * ((i + (t * 0.25) % 1) / 5) ** 1.7; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    rect(c, '#ff3ea5', w * 0.05, h * 0.06, w * 0.2 * (0.8 + e * 0.3), 8);
  } },
  cozy: { floor: '#b9794a', sky: '#f4d9b5', draw(c, w, h, t) {
    const fy = h * FLOOR_Y; rect(c, this.sky, 0, 0, w, fy); rect(c, '#e8c394', 0, fy - 14, w, 14);
    rect(c, INK, w * 0.1 - 5, h * 0.08 - 5, w * 0.2 + 10, h * 0.22 + 10); rect(c, '#8fd3ff', w * 0.1, h * 0.08, w * 0.2, h * 0.22); rect(c, INK, w * 0.2 - 2, h * 0.08, 4, h * 0.22); rect(c, INK, w * 0.1, h * 0.19 - 2, w * 0.2, 4); circ(c, '#fff', w * 0.14 + ((t * 8) % 60), h * 0.13, 12);
    rect(c, '#ff7b7b', w * 0.45, h * 0.1, 70, 90); rect(c, '#ffd23f', w * 0.45 + 8, h * 0.1 + 8, 54, 74); rect(c, INK, w * 0.45, h * 0.1, 70, 4);
    const lx = w * 0.84; rect(c, INK, lx, fy - h * 0.27, 6, h * 0.27); tri(c, '#ffd23f', lx - 38, fy - h * 0.27, lx + 44, fy - h * 0.27, lx + 3, fy - h * 0.37); c.globalAlpha = 0.18; circ(c, '#fff3a8', lx + 3, fy - h * 0.27, 90); c.globalAlpha = 1;
    rect(c, this.floor, 0, fy, w, h - fy); edge(c, w, fy); for (let i = 0; i < 8; i++) rect(c, '#a2653b', 0, fy + (h - fy) * i / 8 + 4, w, 3);
    c.fillStyle = '#e9577a'; c.beginPath(); c.ellipse(w / 2, h * 0.78, w * 0.3, h * 0.11, 0, 0, 7); c.fill(); c.fillStyle = '#ffe3ea'; c.beginPath(); c.ellipse(w / 2, h * 0.78, w * 0.23, h * 0.075, 0, 0, 7); c.fill();
  } },
  concert: { floor: '#262033', sky: '#0e0b16', draw(c, w, h, t, e) {
    const fy = h * FLOOR_Y; rect(c, this.sky, 0, 0, w, fy); rect(c, '#3a3350', 0, h * 0.06, w, 14); for (let i = 0; i < 14; i++) rect(c, INK, w * i / 13, h * 0.06, 4, 30);
    ['#ff3ea5', '#ffd23f', '#2ee6ff', '#b4ff39', '#ff7b54'].forEach((col, i) => { const x = w * (0.12 + i * 0.19); circ(c, col, x, h * 0.06 + 40, 12); });
    for (const x of [0.05, 0.83]) { rect(c, INK, w * x, fy - h * 0.34, w * 0.12, h * 0.34); circ(c, '#4b4560', w * x + w * 0.06, fy - h * 0.12, w * 0.04 * (1 + e * 0.12)); circ(c, '#2a2540', w * x + w * 0.06, fy - h * 0.12, w * 0.02); circ(c, '#4b4560', w * x + w * 0.06, fy - h * 0.26, w * 0.025 * (1 + e * 0.1)); }
    rect(c, this.floor, 0, fy, w, h - fy); edge(c, w, fy); rect(c, '#ff3ea5', 0, fy + 5, w, 6);
    for (let i = 0; i < 20; i++) { const x = w * (i + 0.5) / 20, bob = Math.sin(t * 4 + i) * 6 * (0.3 + e); circ(c, '#0a0810', x, h * 0.97 + bob, 26); if (i % 4 === 0) rect(c, '#0a0810', x + 14, h * 0.97 - 50 + bob, 5, 36); }
  } },
  forest: { floor: '#4f9d4a', sky: '#bfe8ff', draw(c, w, h, t) {
    const fy = h * FLOOR_Y; rect(c, this.sky, 0, 0, w, fy); circ(c, '#fff', w * 0.3 + (t * 6) % 40, h * 0.14, 26); circ(c, '#fff', w * 0.3 + 34 + (t * 6) % 40, h * 0.15, 20);
    for (let i = 0; i < 9; i++) { const x = w * (i * 0.12 - 0.02), s = h * (0.24 + rnd(i) * 0.14); rect(c, '#6b4423', x + s * 0.18, fy - s * 0.3, s * 0.16, s * 0.3); tri(c, i % 2 ? '#1f7a3d' : '#2e9e4f', x - s * 0.1, fy - s * 0.2, x + s * 0.44, fy - s * 0.2, x + s * 0.17, fy - s); tri(c, i % 2 ? '#1f7a3d' : '#2e9e4f', x - s * 0.04, fy - s * 0.45, x + s * 0.38, fy - s * 0.45, x + s * 0.17, fy - s * 0.95); }
    rect(c, this.floor, 0, fy, w, h - fy); edge(c, w, fy); for (let i = 0; i < 16; i++) { const x = rnd(i) * w, y = fy + 12 + rnd(i + 8) * (h - fy - 24); rect(c, '#3d8a39', x, y, 5, 10); rect(c, '#3d8a39', x + 8, y + 3, 5, 7); }
    const fx = w * 0.5, fyy = h * 0.69; rect(c, '#6b4423', fx - 34, fyy + 14, 68, 10); rect(c, '#6b4423', fx - 28, fyy + 4, 56, 9); const fl = Math.sin(t * 12) * 4; tri(c, '#ff7b54', fx - 20, fyy + 6, fx + 20, fyy + 6, fx, fyy - 40 + fl); tri(c, '#ffd23f', fx - 10, fyy + 6, fx + 10, fyy + 6, fx, fyy - 20 + fl);
  } },
};

/** Flat stage lights: translucent beams from the ceiling + a colour wash. e = music energy 0..1. */
export function drawLighting(c, w, h, t, mode, e = 0) {
  if (mode === 'off') return;
  const hue = { purple: '#b44dff', blue: '#3da8ff', warm: '#ffb347' };
  const cols = mode === 'rainbow' ? ['#ff3ea5', '#ffd23f', '#3ddc97', '#4cc9f0', '#b44dff'] : [hue[mode]];
  c.save();
  c.globalAlpha = 0.07 + 0.05 * e; c.fillStyle = cols[step(cols.length, t, 1.5)]; c.fillRect(0, 0, w, h);
  const n = 5;
  for (let i = 0; i < n; i++) {
    const col = cols[i % cols.length], x = w * (i + 0.5) / n, sway = Math.sin(t * 1.4 + i * 1.7) * w * 0.14, tx = x + sway, spread = w * 0.05;
    c.globalAlpha = 0.12 + 0.12 * e; c.fillStyle = col;
    c.beginPath(); c.moveTo(x - 8, 0); c.lineTo(x + 8, 0); c.lineTo(tx + spread, h * 0.9); c.lineTo(tx - spread, h * 0.9); c.closePath(); c.fill();
    c.globalAlpha = 0.28 + 0.2 * e; c.beginPath(); c.ellipse(tx, h * 0.9, spread, h * 0.025, 0, 0, 7); c.fill();
  }
  c.restore();
}
