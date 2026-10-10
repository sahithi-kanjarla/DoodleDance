// Ready-made funny characters. Each is a list of pen strokes (same format as the
// drawing canvas) plus exact joints, so they rig perfectly and can be remixed.

const INK = '#1b1b2f';
const line = (pts, color = INK, size = 6) => ({ tool: 'pen', color, size, points: pts.map(([x, y]) => ({ x, y })) });
const arc = (cx, cy, rx, ry, a0, a1, color = INK, size = 6, n = 44) =>
  line(Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; }), color, size);
const ring = (cx, cy, r, color = INK, size = 6) => arc(cx, cy, r, r, 0, Math.PI * 2 + 0.25, color, size);
const dot = (x, y, r, color = INK) => ({ tool: 'pen', color, size: r * 2, points: [{ x, y }] });
const spiral = (cx, cy, r, turns, color = INK, size = 3) =>
  line(Array.from({ length: 50 }, (_, i) => { const t = i / 49, a = t * turns * 2 * Math.PI; return [cx + r * t * Math.cos(a), cy + r * t * Math.sin(a)]; }), color, size);
const heart = (x, y, s, color) => line([[x, y + s * 0.9], [x - s, y - s * 0.1], [x - s * 0.6, y - s * 0.8], [x, y - s * 0.3], [x + s * 0.6, y - s * 0.8], [x + s, y - s * 0.1], [x, y + s * 0.9]], color, 3);

// Standing body. limb spec: [angleFromDown, bend, length1, length2] (left goes left, right goes right)
function body({ cx = 320, headY = 150, headR = 40, torso = 165, sh = 10, lean = 0, size = 7, arms, legs, colors = {} }) {
  const neck = { x: cx, y: headY + headR + size / 2 };
  const pelvis = { x: cx + Math.sin(lean) * torso, y: neck.y + Math.cos(lean) * torso };
  const shMid = { x: cx + Math.sin(lean) * 22, y: neck.y + Math.cos(lean) * 22 };
  const joints = { HEAD: { x: cx, y: headY }, NECK: neck, PELVIS: pelvis };
  const strokes = [line([[neck.x, neck.y], [pelvis.x, pelvis.y]], colors.torso || INK, size)];
  for (const side of ['LEFT', 'RIGHT']) {
    const sg = side === 'LEFT' ? -1 : 1;
    const mk = (base, [phi, bend, l1, l2]) => {
      const d1 = [Math.sin(sg * phi), Math.cos(sg * phi)], d2 = [Math.sin(sg * (phi + bend)), Math.cos(sg * (phi + bend))];
      const mid = { x: base.x + d1[0] * l1, y: base.y + d1[1] * l1 };
      return { mid, end: { x: mid.x + d2[0] * l2, y: mid.y + d2[1] * l2 } };
    };
    const sBase = { x: shMid.x + sg * sh, y: shMid.y }, hBase = { x: pelvis.x + sg * 8, y: pelvis.y };
    const a = mk(sBase, arms[side]), l = mk(hBase, legs[side]);
    Object.assign(joints, {
      [`${side}_SHOULDER`]: sBase, [`${side}_ELBOW`]: a.mid, [`${side}_WRIST`]: a.end,
      [`${side}_HIP`]: hBase, [`${side}_KNEE`]: l.mid, [`${side}_ANKLE`]: l.end,
    });
    strokes.push(line([[sBase.x, sBase.y], [a.mid.x, a.mid.y], [a.end.x, a.end.y]], colors.arms || INK, size));
    strokes.push(line([[hBase.x, hBase.y], [l.mid.x, l.mid.y], [l.end.x, l.end.y]], colors.legs || INK, size));
  }
  return { joints, strokes };
}
const rnd = (v) => Math.round(v * 10) / 10;
const clean = (j) => Object.fromEntries(Object.entries(j).map(([k, p]) => [k, { x: rnd(p.x), y: rnd(p.y) }]));

function build(id, name, tagline, headR, bodyOpts, face) {
  const b = body({ headR, ...bodyOpts });
  const { x, y } = b.joints.HEAD;
  return { id, name, tagline, headRadius: headR + 3, joints: clean(b.joints), strokes: [...b.strokes, ...face(x, y, headR)] };
}

export const EXAMPLES = [
  build('gooby', 'Gooby', 'Googly eyes, tongue out, zero regrets', 42,
    { arms: { LEFT: [2.5, 0.5, 70, 60], RIGHT: [2.2, -0.5, 70, 60] }, legs: { LEFT: [0.35, 0.3, 85, 80], RIGHT: [0.4, -0.4, 85, 80] }, colors: { arms: '#f4a261', legs: '#2a9d8f' } },
    (x, y, r) => [
      ring(x, y, r),
      ...[-1, 1].flatMap((s) => [ring(x + s * 16, y - 8, 12, INK, 4), dot(x + s * 16 + s * 4, y - 3, 5)]),
      arc(x, y + 14, 22, 15, 0.15, Math.PI - 0.15, INK, 5), dot(x + 6, y + 36, 7, '#ff6fb5'),
      line([[x - 30, y - r + 2], [x - 40, y - r - 22]], '#f4a261', 6), line([[x - 8, y - r], [x - 10, y - r - 28]], '#f4a261', 6),
      line([[x + 14, y - r], [x + 24, y - r - 26]], '#f4a261', 6), line([[x + 32, y - r + 8], [x + 48, y - r - 14]], '#f4a261', 6),
    ]),
  build('zigzag', 'Zigzag', 'Hair did a thing. Brain did too.', 40,
    { arms: { LEFT: [0.5, -0.9, 66, 62], RIGHT: [2.4, 0.4, 70, 62] }, legs: { LEFT: [0.2, 0.1, 85, 85], RIGHT: [0.7, -0.5, 85, 80] }, colors: { arms: '#7b2cbf' } },
    (x, y, r) => [
      ring(x, y, r),
      spiral(x, y - r - 16, 22, 2.4, '#7b2cbf', 4),
      ring(x - 15, y - 8, 11, INK, 4), dot(x - 15, y - 8, 4), ring(x + 16, y - 6, 6, INK, 4), dot(x + 16, y - 6, 3),
      line([[x - 22, y + 18], [x - 11, y + 8], [x, y + 20], [x + 11, y + 8], [x + 22, y + 18]], INK, 4),
      dot(x - 28, y + 6, 5, '#ff9aa2'), dot(x + 28, y + 6, 5, '#ff9aa2'),
    ]),
  build('bob', 'Cyclops Bob', 'One eye. Two teeth. Big feelings.', 44,
    { arms: { LEFT: [0.9, 0.3, 70, 62], RIGHT: [0.9, -0.3, 70, 62] }, legs: { LEFT: [0.45, 0.0, 88, 82], RIGHT: [0.45, 0.0, 88, 82] }, colors: { torso: '#2a9d8f', arms: '#2a9d8f', legs: '#2a9d8f' } },
    (x, y, r) => [
      ring(x, y, r, '#2a9d8f', 7),
      ring(x, y - 6, 17, INK, 5), dot(x + 5, y - 4, 7),
      line([[x - 20, y + 20], [x + 20, y + 20]], INK, 4),
      line([[x - 8, y + 20], [x - 8, y + 34], [x - 1, y + 34], [x - 1, y + 20]], INK, 3),
      line([[x + 1, y + 20], [x + 1, y + 34], [x + 8, y + 34], [x + 8, y + 20]], INK, 3),
      line([[x - 22, y - r], [x - 30, y - r - 18]], '#2a9d8f', 6), line([[x + 22, y - r], [x + 30, y - r - 18]], '#2a9d8f', 6),
    ]),
  build('dizzy', 'Dizzy', 'Has been spinning since Tuesday', 40,
    { lean: 0.12, arms: { LEFT: [1.6, 0.2, 68, 62], RIGHT: [1.1, -0.9, 66, 60] }, legs: { LEFT: [0.3, 0.5, 85, 80], RIGHT: [0.55, -0.3, 85, 80] }, colors: { arms: '#3a86ff', legs: '#3a86ff' } },
    (x, y, r) => [
      ring(x, y, r),
      spiral(x - 15, y - 6, 11, 2.2, INK, 3), spiral(x + 15, y - 6, 11, 2.2, INK, 3),
      line([[x - 22, y + 20], [x - 11, y + 14], [x, y + 22], [x + 11, y + 14], [x + 22, y + 20]], INK, 4),
      line([[x - 24, y - r + 6], [x, y - r - 40], [x + 24, y - r + 6]], '#e63946', 5), dot(x, y - r - 44, 7, '#f2c200'),
    ]),
  build('mustachio', 'Mustachio', 'Fancy. Suspicious. Very fancy.', 40,
    { arms: { LEFT: [0.35, 0.5, 68, 62], RIGHT: [1.5, -0.7, 66, 62] }, legs: { LEFT: [0.2, 0.0, 88, 82], RIGHT: [0.25, 0.0, 88, 82] }, colors: { arms: '#e63946' } },
    (x, y, r) => [
      ring(x, y, r),
      dot(x - 14, y - 8, 4), ring(x + 15, y - 8, 11, '#f2c200', 4), dot(x + 15, y - 8, 4),
      line([[x - 10, y - 26], [x - 20, y - 30]], INK, 4), line([[x + 10, y - 26], [x + 22, y - 32]], INK, 4),
      line([[x - 30, y + 16], [x - 20, y + 24], [x - 6, y + 14], [x, y + 18], [x + 6, y + 14], [x + 20, y + 24], [x + 30, y + 16]], '#8d6e63', 7),
      line([[x - r - 12, y - r + 8], [x + r + 12, y - r + 8]], INK, 6),
      line([[x - 24, y - r + 8], [x - 24, y - r - 34], [x + 24, y - r - 34], [x + 24, y - r + 8]], INK, 6),
    ]),
  build('screamo', 'Screamo', 'AAAAAAAAAAAAA', 40,
    { arms: { LEFT: [2.8, -0.2, 70, 64], RIGHT: [2.8, 0.2, 70, 64] }, legs: { LEFT: [0.5, 0.0, 88, 82], RIGHT: [0.5, 0.0, 88, 82] }, colors: { arms: '#f4a261', legs: '#f4a261' } },
    (x, y, r) => [
      ring(x, y, r),
      dot(x - 14, y - 10, 6), dot(x + 14, y - 10, 6),
      line([[x - 24, y - 24], [x - 8, y - 20]], INK, 4), line([[x + 24, y - 24], [x + 8, y - 20]], INK, 4),
      ring(x, y + 18, 13, INK, 4), dot(x, y + 18, 9, '#e63946'),
      ...[-1, 1].map((s) => line([[x + s * 14, y - r], [x + s * 18, y - r - 34]], '#f4a261', 6)),
      line([[x, y - r], [x, y - r - 40]], '#f4a261', 6),
      line([[x + r + 6, y - 20], [x + r + 6, y - 12]], '#3a86ff', 5),
    ]),
  build('kiki', 'Kiki', 'Falls in love with everything', 38,
    { arms: { LEFT: [0.6, -1.2, 62, 58], RIGHT: [0.6, 1.2, 62, 58] }, legs: { LEFT: [0.5, -0.9, 80, 76], RIGHT: [0.5, 0.9, 80, 76] }, colors: { torso: '#ff6fb5', arms: '#ff6fb5', legs: '#ff6fb5' } },
    (x, y, r) => [
      ring(x, y, r),
      heart(x - 14, y - 6, 9, '#e63946'), heart(x + 14, y - 6, 9, '#e63946'),
      arc(x, y + 8, 12, 9, 0.2, Math.PI - 0.2, INK, 4),
      dot(x - 26, y + 10, 5, '#ff9aa2'), dot(x + 26, y + 10, 5, '#ff9aa2'),
      line([[x + 8, y - r - 2], [x + 34, y - r - 18], [x + 34, y - r + 8], [x + 8, y - r - 2]], '#ff6fb5', 5),
      line([[x - 10, y - r], [x - 14, y - r - 20]], INK, 5),
    ]),
  build('zed', 'Robo Zed', 'Beep. Boop. Vibes: 87%', 40,
    { arms: { LEFT: [1.3, 0.9, 66, 60], RIGHT: [1.3, -0.9, 66, 60] }, legs: { LEFT: [0.25, 0.0, 88, 82], RIGHT: [0.25, 0.0, 88, 82] }, colors: { torso: '#5c6b7a', arms: '#5c6b7a', legs: '#5c6b7a' } },
    (x, y, r) => [
      line([[x - 36, y - 36], [x + 36, y - 36], [x + 36, y + 36], [x - 36, y + 36], [x - 36, y - 36], [x - 30, y - 30]], '#5c6b7a', 7),
      line([[x - 20, y - 14], [x - 8, y - 14], [x - 8, y - 4], [x - 20, y - 4], [x - 20, y - 14]], '#2a9d8f', 4),
      line([[x + 8, y - 14], [x + 20, y - 14], [x + 20, y - 4], [x + 8, y - 4], [x + 8, y - 14]], '#2a9d8f', 4),
      line([[x - 20, y + 18], [x - 10, y + 12], [x, y + 18], [x + 10, y + 12], [x + 20, y + 18]], INK, 4),
      line([[x, y - 36], [x, y - 62]], '#5c6b7a', 5), dot(x, y - 66, 7, '#e63946'),
    ]),
];
