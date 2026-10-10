// Flat particle effects: confetti, disco spots, smoke, sparkles, plus one-shot emote bursts.
const COLORS = ['#ff3ea5', '#ffd23f', '#3ddc97', '#4cc9f0', '#b44dff', '#ff7b54'];
const rand = (a, b) => a + Math.random() * (b - a);

export class Particles {
  constructor() { this.list = []; this.acc = { confetti: 0, smoke: 0, sparkles: 0 }; this.spots = Array.from({ length: 5 }, (_, i) => ({ ph: i * 1.3, col: COLORS[i % COLORS.length] })); }

  /** One-shot burst at (x,y) in pixels. */
  burst(kind, x, y, s = 1) {
    const L = this.list;
    if (kind === 'heart') for (let i = 0; i < 9; i++) L.push({ k: 'glyph', g: '❤', x: x + rand(-30, 30) * s, y, vx: rand(-30, 30), vy: rand(-140, -80), life: 0, max: rand(1.1, 1.7), size: rand(22, 38) * s, col: '#ff3e6c' });
    else if (kind === 'confetti') for (let i = 0; i < 46; i++) L.push({ k: 'conf', x, y, vx: rand(-260, 260), vy: rand(-420, -120), life: 0, max: rand(1.4, 2.4), size: rand(7, 12) * s, col: COLORS[i % COLORS.length], rot: rand(0, 6), vr: rand(-9, 9), g: 520 });
    else if (kind === 'laugh') for (let i = 0; i < 4; i++) L.push({ k: 'glyph', g: i % 2 ? 'HA' : 'HAHA', x: x + rand(-40, 40) * s, y: y - i * 10, vx: rand(-40, 40), vy: rand(-110, -60), life: -i * 0.12, max: 1.3, size: rand(20, 28) * s, col: '#ffd23f', stroke: true, rot: rand(-0.3, 0.3) });
    else if (kind === 'surprised') L.push({ k: 'glyph', g: '!', x, y, vx: 0, vy: -50, life: 0, max: 1.1, size: 56 * s, col: '#ff3e3e', stroke: true });
    else if (kind === 'clap') for (let i = 0; i < 6; i++) L.push({ k: 'star', x, y, vx: rand(-120, 120), vy: rand(-120, -20), life: 0, max: 0.6, size: rand(7, 12) * s, col: '#ffd23f', g: 100 });
    else if (kind === 'wave') L.push({ k: 'glyph', g: '👋', x, y, vx: 0, vy: -50, life: 0, max: 1.1, size: 36 * s, col: '#fff' });
    else if (kind === 'jump') for (let i = 0; i < 8; i++) L.push({ k: 'puff', x: x + rand(-30, 30) * s, y, vx: rand(-90, 90), vy: rand(-30, 0), life: 0, max: 0.6, size: rand(8, 16) * s, col: '#ffffff' });
    else if (kind === 'dance') for (let i = 0; i < 5; i++) L.push({ k: 'glyph', g: i % 2 ? '♪' : '♫', x: x + rand(-40, 40) * s, y, vx: rand(-40, 40), vy: rand(-120, -70), life: 0, max: 1.3, size: rand(22, 34) * s, col: COLORS[i % COLORS.length], stroke: true });
  }

  update(dt, w, h, fx, e = 0) {
    const L = this.list;
    // ambient emitters
    if (fx.confetti) { this.acc.confetti += dt * (14 + e * 26); while (this.acc.confetti >= 1) { this.acc.confetti--; L.push({ k: 'conf', x: rand(0, w), y: -12, vx: rand(-30, 30), vy: rand(60, 150), life: 0, max: 6, size: rand(7, 12), col: COLORS[(Math.random() * 6) | 0], rot: rand(0, 6), vr: rand(-6, 6), g: 20 }); } }
    if (fx.smoke) { this.acc.smoke += dt * 4; while (this.acc.smoke >= 1) { this.acc.smoke--; L.push({ k: 'smoke', x: rand(0, w), y: h * rand(0.88, 1), vx: rand(-14, 14), vy: rand(-26, -10), life: 0, max: 4, size: rand(40, 80), col: '#ffffff' }); } }
    if (fx.sparkles) { this.acc.sparkles += dt * 9; while (this.acc.sparkles >= 1) { this.acc.sparkles--; L.push({ k: 'star', x: rand(0, w), y: rand(0, h * 0.9), vx: 0, vy: rand(-8, 8), life: 0, max: rand(0.8, 1.6), size: rand(6, 13), col: COLORS[(Math.random() * 6) | 0], g: 0 }); } }
    for (const p of L) { p.life += dt; if (p.life < 0) continue; p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) p.vy += p.g * dt; if (p.vr) p.rot += p.vr * dt; }
    this.list = L.filter((p) => p.life < p.max && p.y < h + 40).slice(-500);
  }

  /** Back layer: disco spots on the floor (drawn under the dancers). */
  drawBack(c, w, h, t, fx, e = 0) {
    if (!fx.disco) return;
    c.save();
    for (const s of this.spots) {
      const x = w * (0.5 + 0.42 * Math.sin(t * 0.9 + s.ph)), y = h * (0.7 + 0.18 * Math.sin(t * 1.3 + s.ph * 2));
      c.globalAlpha = 0.22 + 0.2 * e; c.fillStyle = s.col; c.beginPath(); c.ellipse(x, y, w * 0.07 * (1 + e * 0.3), h * 0.045, 0, 0, 7); c.fill();
    }
    c.restore();
  }

  /** Front layer: everything that floats. */
  draw(c) {
    for (const p of this.list) {
      if (p.life < 0) continue;
      const a = p.k === 'smoke' ? 0.16 * (1 - p.life / p.max) : Math.min(1, (p.max - p.life) * 2.5);
      c.save(); c.globalAlpha = Math.max(0, a); c.translate(p.x, p.y);
      if (p.k === 'conf') { c.rotate(p.rot); c.fillStyle = p.col; c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); }
      else if (p.k === 'smoke') { c.fillStyle = p.col; c.beginPath(); c.arc(0, 0, p.size * (0.6 + p.life / p.max * 0.8), 0, 7); c.fill(); }
      else if (p.k === 'puff') { c.fillStyle = p.col; c.beginPath(); c.arc(0, 0, p.size * (1 + p.life), 0, 7); c.fill(); }
      else if (p.k === 'star') { const s = p.size * (0.5 + 0.5 * Math.sin((p.life / p.max) * Math.PI)); c.fillStyle = p.col; c.fillRect(-s / 2, -s / 6, s, s / 3); c.fillRect(-s / 6, -s / 2, s / 3, s); }
      else if (p.k === 'glyph') {
        c.rotate(p.rot || 0); c.font = `900 ${p.size}px Fredoka, Inter, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        if (p.stroke) { c.lineWidth = 5; c.strokeStyle = '#1b1b2f'; c.lineJoin = 'round'; c.strokeText(p.g, 0, 0); }
        c.fillStyle = p.col; c.fillText(p.g, 0, 0);
      }
      c.restore();
    }
  }
}
