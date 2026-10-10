// Procedural "messy human" stick figures with ground-truth joints.
// Mimics how people really draw: wobbly strokes, limbs that don't quite touch
// the body, unclosed head circles, overshooting lines, hair, hats, bags, capes,
// filled heads, wide stances, bent/raised limbs, arms starting at the neck.

export const W = 640, H = 640;

export function rng(seed) {
  // mulberry32: well mixed even for consecutive small seeds
  let s = (seed * 2654435761) >>> 0;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + (b - a) * r();
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

function canvas() { return new Uint8Array(W * H); }
function disk(m, x, y, r) {
  const r2 = r * r;
  for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(H - 1, Math.ceil(y + r)); yy++)
    for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(W - 1, Math.ceil(x + r)); xx++)
      if ((xx - x) ** 2 + (yy - y) ** 2 <= r2) m[yy * W + xx] = 1;
}
function stroke(m, pts, r, rnd, wob) {
  // resample to short steps, add smooth low-frequency wobble perpendicular to the path
  const out = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L / 2));
    for (let i = 0; i < n; i++) out.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
  }
  out.push(pts[pts.length - 1]);
  const f1 = rnd.range(0.02, 0.06), f2 = rnd.range(0.08, 0.15), p1 = rnd.range(0, 6.3), p2 = rnd.range(0, 6.3);
  out.forEach((p, i) => {
    const o = wob * (Math.sin(i * f1 + p1) * 0.8 + Math.sin(i * f2 + p2) * 0.35);
    const q = out[Math.min(out.length - 1, i + 1)], b = out[Math.max(0, i - 1)];
    const dx = q[0] - b[0], dy = q[1] - b[1], l = Math.hypot(dx, dy) || 1;
    disk(m, p[0] + (-dy / l) * o, p[1] + (dx / l) * o, r);
  });
}
function arcPts(cx, cy, rx, ry, a0, a1, steps = 60) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
const dirDown = (phi) => [Math.sin(phi), Math.cos(phi)]; // phi=0 straight down, +phi toward +x

/** Build one random figure. opts can pin attributes for targeted categories. */
export function makeFigure(seed, opts = {}) {
  const rnd = rng(seed);
  const m = canvas();
  const tags = [];
  const sw = opts.stroke ?? rnd.pick([3, 4, 5, 6, 8, 10]);
  const wob = opts.wobble ?? rnd.pick([0, 1.2, 2.5, 4]);
  const r = sw / 2;

  const scale = rnd.range(0.7, 1.05);
  const headR = (opts.headR ?? rnd.range(26, 46)) * scale;
  const cx = rnd.range(290, 350);
  const headY = rnd.range(120, 170);
  const head = { x: cx, y: headY };
  const neck = { x: cx, y: headY + headR + sw / 2 };
  const torsoLen = rnd.range(120, 190) * scale;
  const lean = rnd.range(-0.25, 0.25);
  const pelvis = { x: neck.x + Math.sin(lean) * torsoLen, y: neck.y + Math.cos(lean) * torsoLen };

  const sh = opts.shoulder ?? rnd.pick([0, 0, 8, 14, 22]);
  const shY = neck.y + rnd.range(8, 24);
  const along = (t) => ({ x: neck.x + (pelvis.x - neck.x) * t, y: neck.y + (pelvis.y - neck.y) * t });
  const shMid = along((shY - neck.y) / torsoLen);
  const hipW = rnd.pick([0, 0, 6, 12]);

  const J = { HEAD: head, NECK: neck, PELVIS: pelvis };
  const L1 = rnd.range(55, 85) * scale, L2 = rnd.range(55, 85) * scale;
  const G1 = rnd.range(70, 105) * scale, G2 = rnd.range(70, 105) * scale;

  const limb = (side, base, l1, l2, phi, bend) => {
    const sgn = side === 'LEFT' ? -1 : 1;
    const d1 = dirDown(sgn * phi);
    const mid = { x: base.x + d1[0] * l1, y: base.y + d1[1] * l1 };
    const d2 = dirDown(sgn * (phi + bend));
    const end = { x: mid.x + d2[0] * l2, y: mid.y + d2[1] * l2 };
    return { mid, end };
  };

  const armMode = opts.armMode ?? rnd.pick(['down', 'wide', 'up', 'mixed', 'bent', 'wave']);
  const armAng = () => {
    switch (armMode) {
      case 'down': return [rnd.range(0.15, 0.7), rnd.range(-0.3, 0.5)];
      case 'wide': return [rnd.range(1.2, 1.7), rnd.range(-0.3, 0.3)];
      case 'up': return [rnd.range(2.2, 3.0), rnd.range(-0.4, 0.4)];
      case 'bent': return [rnd.range(0.4, 1.2), rnd.range(-1.5, -0.7)];
      case 'wave': return [rnd.range(1.6, 2.4), rnd.range(0.5, 1.2)];
      default: return [rnd.range(0.2, 2.9), rnd.range(-0.9, 0.9)];
    }
  };
  tags.push('arms:' + armMode);

  const legMode = opts.legMode ?? rnd.pick(['stand', 'stand', 'wide', 'kick', 'bent', 'step']);
  const legAng = () => {
    switch (legMode) {
      case 'stand': return [rnd.range(0.05, 0.3), rnd.range(-0.15, 0.15)];
      case 'wide': return [rnd.range(0.4, 0.8), rnd.range(-0.1, 0.1)];
      case 'kick': return [rnd.range(1.0, 1.6), rnd.range(-0.2, 0.3)];
      case 'bent': return [rnd.range(0.3, 0.8), rnd.range(-0.9, -0.4)];
      default: return [rnd.range(0.05, 0.9), rnd.range(-0.5, 0.5)];
    }
  };
  tags.push('legs:' + legMode);

  const segD = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  const parts = [];
  for (const side of ['LEFT', 'RIGHT']) {
    const sg = side === 'LEFT' ? -1 : 1;
    const sBase = { x: shMid.x + sg * sh, y: shMid.y };
    const hBase = { x: pelvis.x + sg * hipW, y: pelvis.y };
    let a1, b1, arm;
    for (let tries = 0; tries < 40; tries++) {
      [a1, b1] = armAng();
      arm = limb(side, sBase, L1, L2, a1, b1);
      const clear = Math.min(segD(head, sBase, arm.mid), segD(head, arm.mid, arm.end)) >= headR + sw + 8;
      const sameSide = sg * (arm.mid.x - shMid.x) >= -6 && sg * (arm.end.x - shMid.x) >= -6;
      if (clear && sameSide) break;
      if (tries === 39) { a1 = 1.4; b1 = 0.2; arm = limb(side, sBase, L1, L2, a1, b1); }
    }
    let g1, h1, leg;
    for (let tries = 0; tries < 40; tries++) {
      [g1, h1] = legAng();
      if (legMode === 'kick' && side === 'RIGHT') [g1, h1] = [rnd.range(0.05, 0.3), 0];
      leg = limb(side, hBase, G1, G2, g1, h1);
      if (sg * (leg.mid.x - pelvis.x) >= -6 && sg * (leg.end.x - pelvis.x) >= -6) break;
    }
    J[`${side}_SHOULDER`] = sBase; J[`${side}_ELBOW`] = arm.mid; J[`${side}_WRIST`] = arm.end;
    J[`${side}_HIP`] = hBase; J[`${side}_KNEE`] = leg.mid; J[`${side}_ANKLE`] = leg.end;
    parts.push({ kind: 'arm', side, pts: [sBase, arm.mid, arm.end], bendDeg: Math.abs(b1) * 57.3 });
    parts.push({ kind: 'leg', side, pts: [hBase, leg.mid, leg.end], bendDeg: Math.abs(h1) * 57.3 });
  }

  // ----- draw -----
  const gapMax = opts.gap ?? rnd.pick([0, 0, 3, 6, 9]);
  if (gapMax > 0) tags.push('gaps');
  const sep = () => (gapMax ? rnd.range(0, gapMax) : 0);

  // head
  const headStyle = opts.headStyle ?? rnd.pick(['loop', 'loop', 'loop', 'open', 'oval', 'filled', 'scribble']);
  tags.push('head:' + headStyle);
  const rx = headStyle === 'oval' ? headR * rnd.range(0.8, 0.95) : headR;
  const ry = headStyle === 'oval' ? headR * rnd.range(1.05, 1.25) : headR;
  if (headStyle === 'filled') {
    disk(m, head.x, head.y, headR);
  } else if (headStyle === 'scribble') {
    for (let k = 0; k < 4; k++) stroke(m, arcPts(head.x + rnd.range(-3, 3), head.y + rnd.range(-3, 3), headR * rnd.range(0.55, 1), headR * rnd.range(0.55, 1), rnd.range(0, 6), rnd.range(0, 6) + 6.8, 50), r, rnd, 1.5);
  } else if (headStyle === 'open') {
    const gap = rnd.range(0.18, 0.5);
    const start = rnd.range(0, 6.28);
    stroke(m, arcPts(head.x, head.y, rx, ry, start, start + 6.28 - gap, 80), r, rnd, wob * 0.6);
  } else {
    stroke(m, arcPts(head.x, head.y, rx, ry, 0, 6.5, 80), r, rnd, wob * 0.6); // slight overshoot
  }
  const face = opts.face ?? rnd.chance(0.8);
  if (face) {
    const eye = rnd.pick(['dots', 'dots', 'big', 'x', 'dash']);
    const ey = head.y - headR * 0.18, ex = headR * 0.38;
    if (eye === 'dots') { disk(m, head.x - ex, ey, Math.max(2, sw * 0.7)); disk(m, head.x + ex, ey, Math.max(2, sw * 0.7)); }
    else if (eye === 'big') { stroke(m, arcPts(head.x - ex, ey, 7, 7, 0, 6.4, 20), 1.5, rnd, 0); stroke(m, arcPts(head.x + ex, ey, 7, 7, 0, 6.4, 20), 1.5, rnd, 0); disk(m, head.x - ex + 2, ey, 2.5); disk(m, head.x + ex - 2, ey, 2.5); }
    else if (eye === 'x') { for (const s of [-1, 1]) { stroke(m, [[head.x + s * ex - 5, ey - 5], [head.x + s * ex + 5, ey + 5]], 1.5, rnd, 0); stroke(m, [[head.x + s * ex + 5, ey - 5], [head.x + s * ex - 5, ey + 5]], 1.5, rnd, 0); } }
    else { stroke(m, [[head.x - ex - 5, ey], [head.x - ex + 5, ey]], 1.8, rnd, 0); stroke(m, [[head.x + ex - 5, ey], [head.x + ex + 5, ey]], 1.8, rnd, 0); }
    const mouth = rnd.pick(['smile', 'o', 'line', 'zig', 'tongue']);
    const my = head.y + headR * 0.42;
    if (mouth === 'smile') stroke(m, arcPts(head.x, my - 6, headR * 0.4, 10, 0.2, 2.9, 14), 1.8, rnd, 0);
    else if (mouth === 'o') stroke(m, arcPts(head.x, my, 6, 8, 0, 6.4, 18), 1.8, rnd, 0);
    else if (mouth === 'line') stroke(m, [[head.x - 10, my], [head.x + 10, my]], 1.8, rnd, 0);
    else if (mouth === 'zig') stroke(m, [[head.x - 14, my], [head.x - 7, my - 5], [head.x, my + 3], [head.x + 7, my - 5], [head.x + 14, my]], 1.8, rnd, 0);
    else { stroke(m, arcPts(head.x, my - 6, headR * 0.4, 10, 0.2, 2.9, 14), 1.8, rnd, 0); disk(m, head.x + 4, my + 6, 4); }
    tags.push('face');
  }

  // hair / hats / accessories on the head
  const hair = opts.hair ?? rnd.pick(['none', 'spikes', 'spikes', 'curl', 'long', 'antenna', 'bow']);
  tags.push('hair:' + hair);
  const topY = head.y - ry;
  if (hair === 'spikes') {
    const n = rnd.pick([3, 5, 7]);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + ((k - (n - 1) / 2) * 0.32);
      const bx = head.x + Math.cos(a) * rx, by = head.y + Math.sin(a) * ry;
      stroke(m, [[bx, by], [bx + Math.cos(a) * rnd.range(18, 34), by + Math.sin(a) * rnd.range(18, 34)]], r, rnd, 0);
    }
  } else if (hair === 'curl') {
    stroke(m, arcPts(head.x, topY - 12, 14, 14, 0, 5.5, 24), r, rnd, 0);
  } else if (hair === 'long') {
    for (const s of [-1, 1]) stroke(m, [[head.x + s * rx * 0.9, head.y - ry * 0.2], [head.x + s * (rx + 8), head.y + ry + 25], [head.x + s * (rx - 2), head.y + ry + 55]], r, rnd, 1);
  } else if (hair === 'antenna') {
    stroke(m, [[head.x, topY], [head.x + 6, topY - 30]], r, rnd, 0); disk(m, head.x + 6, topY - 34, 6);
  } else if (hair === 'bow') {
    stroke(m, [[head.x + rx * 0.6, topY + 6], [head.x + rx * 0.6 + 22, topY - 8], [head.x + rx * 0.6 + 22, topY + 18], [head.x + rx * 0.6, topY + 6]], r, rnd, 0);
  }
  const hat = opts.hat ?? rnd.pick(['none', 'none', 'brim', 'top', 'cap']);
  tags.push('hat:' + hat);
  if (hat === 'brim') stroke(m, [[head.x - rx - 22, topY + 4], [head.x + rx + 22, topY + 4]], r, rnd, 0);
  else if (hat === 'top') { stroke(m, [[head.x - rx - 8, topY + 2], [head.x + rx + 8, topY + 2]], r, rnd, 0); stroke(m, [[head.x - rx * 0.6, topY + 2], [head.x - rx * 0.6, topY - 36], [head.x + rx * 0.6, topY - 36], [head.x + rx * 0.6, topY + 2]], r, rnd, 0); }
  else if (hat === 'cap') { stroke(m, arcPts(head.x, head.y, rx * 1.04, ry * 1.04, 3.4, 6.0, 20), r, rnd, 0); stroke(m, [[head.x + rx * 0.3, topY + 8], [head.x + rx + 24, topY + 14]], r, rnd, 0); }

  // torso: drawn from neck gap to pelvis, optional overshoot below
  const neckGap = rnd.chance(0.5) ? sep() * 0.6 : 0;
  const torsoTop = { x: neck.x + (pelvis.x - neck.x) * (neckGap / torsoLen), y: neck.y + (pelvis.y - neck.y) * (neckGap / torsoLen) };
  const over = rnd.chance(0.3) ? rnd.range(2, 8) : 0;
  stroke(m, [[torsoTop.x, torsoTop.y], [pelvis.x + (pelvis.x - neck.x) * (over / torsoLen), pelvis.y + (pelvis.y - neck.y) * (over / torsoLen)]], r, rnd, wob);
  if (rnd.chance(0.3)) tags.push('torso-overshoot');

  // limbs
  for (const p of parts) {
    const [a, b, c] = p.pts;
    let start = a;
    const g = sep();
    if (g > 0) {
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
      start = { x: a.x + (dx / l) * g, y: a.y + (dy / l) * g };
    }
    if (rnd.chance(0.25) && p.kind === 'arm') { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy); start = { x: a.x - (dx / l) * rnd.range(2, 8), y: a.y - (dy / l) * rnd.range(2, 8) }; }
    stroke(m, [[start.x, start.y], [b.x, b.y], [c.x, c.y]], r, rnd, wob);
  }
  // shoulder/hip bars when offsets exist
  if (sh > 0 && rnd.chance(0.5)) stroke(m, [[J.LEFT_SHOULDER.x, J.LEFT_SHOULDER.y], [J.RIGHT_SHOULDER.x, J.RIGHT_SHOULDER.y]], r, rnd, 0);
  if (hipW > 0 && rnd.chance(0.5)) stroke(m, [[J.LEFT_HIP.x, J.LEFT_HIP.y], [J.RIGHT_HIP.x, J.RIGHT_HIP.y]], r, rnd, 0);

  // hands / feet blobs
  for (const s of ['LEFT', 'RIGHT']) {
    if (opts.hands ?? rnd.chance(0.25)) disk(m, J[`${s}_WRIST`].x, J[`${s}_WRIST`].y, r + 3);
  }
  // feet: short stroke forward at the ankle
  const feet = opts.feet ?? rnd.chance(0.3);
  if (feet) {
    tags.push('feet');
    for (const s of ['LEFT', 'RIGHT']) {
      const a = J[`${s}_ANKLE`], d = s === 'LEFT' ? -1 : 1;
      stroke(m, [[a.x, a.y], [a.x + d * rnd.range(12, 22), a.y + rnd.range(-1, 3)]], r, rnd, 0);
    }
  }

  // body accessories (must NOT become limbs)
  const acc = opts.acc ?? rnd.pick(['none', 'none', 'none', 'cape', 'bag', 'tail', 'belt', 'tie']);
  tags.push('acc:' + acc);
  if (acc === 'belt') stroke(m, [[pelvis.x - 14, pelvis.y - 12], [pelvis.x + 14, pelvis.y - 12]], r, rnd, 0);
  else if (acc === 'tie') stroke(m, [[neck.x, neck.y + 14], [neck.x - 5, neck.y + 32], [neck.x, neck.y + 50], [neck.x + 5, neck.y + 32], [neck.x, neck.y + 14]], 2, rnd, 0);
  else if (acc === 'tail') stroke(m, [[pelvis.x, pelvis.y - 6], [pelvis.x + 40, pelvis.y + 10], [pelvis.x + 60, pelvis.y - 24]], r, rnd, 1);
  else if (acc === 'bag') { stroke(m, [[J.LEFT_SHOULDER.x - 2, J.LEFT_SHOULDER.y], [pelvis.x - 40, pelvis.y - 10]], 2, rnd, 0); stroke(m, [[pelvis.x - 62, pelvis.y - 10], [pelvis.x - 22, pelvis.y - 10], [pelvis.x - 22, pelvis.y + 24], [pelvis.x - 62, pelvis.y + 24], [pelvis.x - 62, pelvis.y - 10]], r, rnd, 0); }
  else if (acc === 'cape') { stroke(m, [[neck.x - 6, neck.y + 6], [neck.x - 45, pelvis.y - 10]], 2, rnd, 0); stroke(m, [[neck.x + 6, neck.y + 6], [neck.x + 45, pelvis.y - 10]], 2, rnd, 0); stroke(m, [[neck.x - 45, pelvis.y - 10], [neck.x + 45, pelvis.y - 10]], 2, rnd, 0); }
  else if (acc === 'sword') { const w = J.RIGHT_WRIST; stroke(m, [[w.x, w.y], [w.x + 6, w.y - 70]], 3, rnd, 0); stroke(m, [[w.x - 12, w.y - 8], [w.x + 14, w.y - 8]], 2, rnd, 0); }

  if (wob >= 2.5) tags.push('wobbly');
  if (sw >= 8) tags.push('thick');
  if (sw <= 3) tags.push('thin');
  return { m, truth: J, headR, tags, bboxH: 0 };
}
