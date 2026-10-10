// Dependency-free tests for the rigging / binding / retargeting core.
// Run: node tests/core.test.mjs
import assert from 'node:assert/strict';
import { analyzeMask } from '../src/lib/rig.js';
import { buildPieces, bindPixels } from '../src/lib/binding.js';
import { BONE_IDS } from '../src/lib/skeleton.js';
import { restAngles, solve, wrap } from '../src/lib/retarget.js';
import { landmarksToAngles, createPoseState } from '../src/lib/pose.js';

const W = 640, H = 640;
let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message.split('\n')[0]); }
};

// ---------- tiny drawing toolkit ----------
function canvas() { return { m: new Uint8Array(W * H) }; }
function disk(c, x, y, r) {
  for (let yy = Math.floor(y - r); yy <= y + r; yy++)
    for (let xx = Math.floor(x - r); xx <= x + r; xx++)
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && (xx - x) ** 2 + (yy - y) ** 2 <= r * r) c.m[yy * W + xx] = 1;
}
function line(c, pts, r = 3) {
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= n; i++) disk(c, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, r);
  }
}
function ring(c, cx, cy, rad, r = 3) {
  for (let a = 0; a < 360; a += 0.5) disk(c, cx + rad * Math.cos((a * Math.PI) / 180), cy + rad * Math.sin((a * Math.PI) / 180), r);
}
function toRGBA(m) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) if (m[i]) { d[i * 4] = 20; d[i * 4 + 1] = 20; d[i * 4 + 2] = 40; d[i * 4 + 3] = 255; }
  return d;
}
const near = (p, x, y, tol, label) =>
  assert.ok(Math.hypot(p.x - x, p.y - y) <= tol, `${label}: got (${p.x},${p.y}) want (${x},${y}) ±${tol}`);

function decorations(c, hx, hy) {
  line(c, [[hx - 20, hy - 38], [hx - 30, hy - 70]]);          // hair
  line(c, [[hx, hy - 42], [hx, hy - 78]]);                    // hair
  line(c, [[hx + 22, hy - 36], [hx + 36, hy - 66]]);          // hair
  disk(c, hx - 14, hy - 5, 4); disk(c, hx + 14, hy - 5, 4);   // eyes
  line(c, [[hx - 12, hy + 14], [hx, hy + 20], [hx + 12, hy + 14]], 2); // mouth
}

// Figure A: arms down + bent legs
function figA() {
  const c = canvas();
  ring(c, 320, 130, 40); decorations(c, 320, 130);
  line(c, [[320, 170], [320, 360]]);
  line(c, [[320, 200], [262, 290], [235, 370]]);
  line(c, [[320, 200], [378, 290], [405, 370]]);
  line(c, [[320, 360], [280, 460], [250, 560]]);
  line(c, [[320, 360], [360, 460], [390, 560]]);
  return c;
}
// Figure B: arms raised/bent, asymmetric legs with a foot like "__\"
function figB() {
  const c = canvas();
  ring(c, 320, 150, 38); decorations(c, 320, 150);
  line(c, [[320, 188], [320, 360]]);
  line(c, [[320, 215], [250, 190], [240, 120]]);
  line(c, [[320, 215], [390, 245], [440, 190]]);
  line(c, [[320, 360], [250, 435], [215, 520]]);
  line(c, [[320, 360], [350, 470], [340, 540], [410, 540]]);
  return c;
}
// Figure C: arms leave from the neck (Y shape), no shoulder offset
function figC() {
  const c = canvas();
  ring(c, 320, 150, 38);
  line(c, [[320, 188], [320, 380]]);
  line(c, [[320, 210], [230, 215], [190, 150]]);
  line(c, [[320, 210], [410, 215], [450, 150]]);
  line(c, [[320, 380], [270, 470], [260, 570]]);
  line(c, [[320, 380], [370, 470], [380, 570]]);
  return c;
}

console.log('\nRig detection');
const A = figA(), rigA = analyzeMask(A.m, W, H);
const B = figB(), rigB = analyzeMask(B.m, W, H);
const C = figC(), rigC = analyzeMask(C.m, W, H);

test('A: head found as closed loop at the right place', () => {
  assert.equal(rigA.headMethod, 'loop');
  near(rigA.joints.HEAD, 320, 130, 8, 'head');
  assert.ok(Math.abs(rigA.headRadius - 40) < 8, 'radius ' + rigA.headRadius);
});
test('A: method is skeleton (not template) and no warnings', () => {
  assert.equal(rigA.method, 'skeleton');
  assert.deepEqual(rigA.warnings, []);
});
test('A: hands and feet land on the drawn limb ends', () => {
  near(rigA.joints.LEFT_WRIST, 235, 370, 18, 'LEFT_WRIST');
  near(rigA.joints.RIGHT_WRIST, 405, 370, 18, 'RIGHT_WRIST');
  near(rigA.joints.LEFT_ANKLE, 250, 560, 18, 'LEFT_ANKLE');
  near(rigA.joints.RIGHT_ANKLE, 390, 560, 18, 'RIGHT_ANKLE');
});
test('A: elbows and knees sit near the drawn bends', () => {
  near(rigA.joints.LEFT_ELBOW, 262, 290, 30, 'LEFT_ELBOW');
  near(rigA.joints.RIGHT_ELBOW, 378, 290, 30, 'RIGHT_ELBOW');
  near(rigA.joints.LEFT_KNEE, 280, 460, 30, 'LEFT_KNEE');
  near(rigA.joints.RIGHT_KNEE, 360, 460, 30, 'RIGHT_KNEE');
});
test('A: pelvis at leg junction, neck under head', () => {
  near(rigA.joints.PELVIS, 320, 360, 20, 'PELVIS');
  assert.ok(rigA.joints.NECK.y > 130 + 40 && rigA.joints.NECK.y < 230, 'neck y ' + rigA.joints.NECK.y);
});
for (const [name, r] of [['A', rigA], ['B', rigB], ['C', rigC]]) {
  test(`${name}: LEFT joints are screen-left of RIGHT joints on every limb`, () => {
    const j = r.joints;
    for (const p of ['SHOULDER', 'ELBOW', 'WRIST', 'HIP', 'KNEE', 'ANKLE']) {
      // wrists/ankles can legitimately cross, but tips must be ordered here
      if (p === 'SHOULDER' || p === 'HIP') continue;
      assert.ok(j['LEFT_' + p].x < j['RIGHT_' + p].x, `${p}: ${j['LEFT_' + p].x} !< ${j['RIGHT_' + p].x}`);
    }
  });
}
test('B: raised arms detected as arms (wrists above shoulders), legs below pelvis', () => {
  const j = rigB.joints;
  near(j.LEFT_WRIST, 240, 120, 20, 'LEFT_WRIST');
  near(j.RIGHT_WRIST, 440, 190, 20, 'RIGHT_WRIST');
  near(j.LEFT_ANKLE, 215, 520, 20, 'LEFT_ANKLE');
  near(j.RIGHT_ANKLE, 410, 540, 20, 'RIGHT_ANKLE');
  assert.equal(rigB.warnings.length, 0, rigB.warnings.join('; '));
});
test('C: arms from the neck still pair as arms; legs as legs', () => {
  const j = rigC.joints;
  near(j.LEFT_WRIST, 190, 150, 20, 'LEFT_WRIST');
  near(j.RIGHT_WRIST, 450, 150, 20, 'RIGHT_WRIST');
  near(j.LEFT_ANKLE, 260, 570, 20, 'LEFT_ANKLE');
  near(j.RIGHT_ANKLE, 380, 570, 20, 'RIGHT_ANKLE');
});
test('empty canvas is reported, not crashed', () => {
  const r = analyzeMask(new Uint8Array(W * H), W, H);
  assert.ok(r.empty);
});

console.log('\nPixel binding (hair/eyes/accessories vs limbs)');
const rgbaA = toRGBA(A.m);
const idx = (id) => BONE_IDS.indexOf(id);
const boneAt = (assign, x, y) => BONE_IDS[assign[y * W + x]];
const assignA = bindPixels(rgbaA, W, H, rigA);
test('hair, eyes and mouth bind to the head', () => {
  for (const [x, y] of [[290, 75], [320, 60], [349, 85], [306, 125], [334, 125], [320, 150]])
    if (A.m[y * W + x]) assert.equal(boneAt(assignA, x, y), 'head', `(${x},${y})`);
  assert.equal(boneAt(assignA, 320, 52), 'head'); // hair tip
});
test('left arm pixels bind to left arm bones only; right to right only', () => {
  const left = new Set(), right = new Set();
  for (let y = 250; y < 372; y++) for (let x = 0; x < 320; x++) if (A.m[y * W + x]) left.add(boneAt(assignA, x, y));
  for (let y = 250; y < 372; y++) for (let x = 330; x < W; x++) if (A.m[y * W + x]) right.add(boneAt(assignA, x, y));
  assert.ok(left.has('laL'), 'left arm should use laL: ' + [...left]);
  assert.ok(!left.has('laR') && !left.has('uaR'), 'left side leaked into right arm: ' + [...left]);
  assert.ok(right.has('laR'), 'right arm should use laR: ' + [...right]);
  assert.ok(!right.has('laL') && !right.has('uaL'), 'right side leaked into left arm: ' + [...right]);
});
test('left leg pixels never bind to right leg and vice versa', () => {
  const l = new Set(), r = new Set();
  for (let y = 420; y < 565; y++) {
    for (let x = 0; x < 318; x++) if (A.m[y * W + x]) l.add(boneAt(assignA, x, y));
    for (let x = 322; x < W; x++) if (A.m[y * W + x]) r.add(boneAt(assignA, x, y));
  }
  assert.ok(![...l].some((b) => b.endsWith('R')), 'left leg leaked: ' + [...l]);
  assert.ok(![...r].some((b) => b.endsWith('L')), 'right leg leaked: ' + [...r]);
});
test('every ink pixel is bound; pieces cover all ink and keep colours', () => {
  const { pieces } = buildPieces(rgbaA, W, H, rigA);
  let total = 0;
  for (const id of BONE_IDS) assert.ok(pieces[id], 'missing piece ' + id);
  for (let i = 0; i < W * H; i++) if (A.m[i]) total++;
  const own = BONE_IDS.reduce((s, id) => s + pieces[id].pixels, 0);
  assert.ok(own >= total, `pieces ${own} < ink ${total}`);
  const p = pieces.head, k = [...p.data].findIndex((v, i) => i % 4 === 3 && v === 255);
  assert.equal(p.data[k - 3], 20); // original colour preserved
});

console.log('\nRetargeting (explicit skeleton, left/right independence)');
const rest = restAngles(rigA);
const sameT = (a, b) => Math.abs(a.rot - b.rot) < 1e-9 && Math.hypot(a.cur.x - b.cur.x, a.cur.y - b.cur.y) < 1e-6;
const changed = (base, next) => Object.keys(base).filter((k) => base[k]?.rot !== undefined && !sameT(base[k], next[k]));
test('rest pose in -> identity transforms out', () => {
  const T = solve(rigA, rest, { ...rest });
  for (const id of BONE_IDS) {
    assert.ok(Math.abs(T[id].rot) < 1e-9, id + ' rot ' + T[id].rot);
    near(T[id].cur, T[id].pivot.x, T[id].pivot.y, 1e-6, id);
  }
});
const base = solve(rigA, rest, { ...rest });
for (const [driver, expected] of [
  ['uaL', ['uaL', 'laL']], ['laL', ['laL']],
  ['uaR', ['uaR', 'laR']], ['laR', ['laR']],
  ['ulL', ['ulL', 'llL']], ['llL', ['llL']],
  ['ulR', ['ulR', 'llR']], ['llR', ['llR']],
]) {
  test(`moving ONLY ${driver} moves only ${expected.join('+')}`, () => {
    const T = solve(rigA, rest, { ...rest, [driver]: rest[driver] + 1.0 });
    assert.deepEqual(changed(base, T).sort(), expected.sort());
  });
}
test('moving the torso carries head and arms but not legs', () => {
  const T = solve(rigA, rest, { ...rest, torso: rest.torso + 0.4 });
  const ch = changed(base, T);
  for (const b of ['torso', 'head', 'uaL', 'uaR']) assert.ok(ch.includes(b), b);
  for (const b of ['ulL', 'ulR', 'llL', 'llR']) assert.ok(!ch.includes(b), b);
});
test('missing (null) angles leave that limb at rest', () => {
  const T = solve(rigA, rest, { torso: null, head: null, uaL: null, laL: null });
  for (const id of BONE_IDS) assert.ok(Math.abs(T[id].rot) < 1e-9, id);
});
test('bone lengths are preserved when a limb rotates', () => {
  const T = solve(rigA, rest, { ...rest, uaL: rest.uaL + 1.2, laL: rest.laL - 0.7 });
  const j = rigA.joints;
  const restLen = Math.hypot(j.LEFT_WRIST.x - j.LEFT_ELBOW.x, j.LEFT_WRIST.y - j.LEFT_ELBOW.y);
  const curLen = Math.hypot(T.wristL.x - T.laL.cur.x, T.wristL.y - T.laL.cur.y);
  assert.ok(Math.abs(restLen - curLen) < 1e-6);
});
test('retarget works on a very different rest pose (figure B)', () => {
  const rb = restAngles(rigB);
  const T = solve(rigB, rb, { ...rb, uaR: rb.uaR + 0.8 });
  const ch = changed(solve(rigB, rb, { ...rb }), T).sort();
  assert.deepEqual(ch, ['laR', 'uaR']);
});

console.log('\nWebcam landmarks -> angles (mirror view)');
function standing() {
  const l = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  const set = (i, x, y) => { l[i] = { x, y, visibility: 1 }; };
  // raw (unmirrored) image: the person's LEFT side is on the image RIGHT
  set(0, 0.5, 0.15); set(7, 0.55, 0.15); set(8, 0.45, 0.15);
  set(11, 0.6, 0.3); set(12, 0.4, 0.3);
  set(13, 0.65, 0.42); set(14, 0.35, 0.42); set(15, 0.66, 0.54); set(16, 0.34, 0.54);
  set(23, 0.57, 0.55); set(24, 0.43, 0.55);
  set(25, 0.58, 0.72); set(26, 0.42, 0.72); set(27, 0.58, 0.9); set(28, 0.42, 0.9);
  return l;
}
const ang = (lms) => landmarksToAngles(lms, 640, 480, 1000, createPoseState());
const baseA = ang(standing());
const diffKeys = (a, b) => ['torso', 'head', 'uaL', 'laL', 'uaR', 'laR', 'ulL', 'llL', 'ulR', 'llR']
  .filter((k) => Math.abs(wrap(a[k] - b[k])) > 1e-6);
test('standing: arms and legs hang down (~ +90°)', () => {
  for (const k of ['laL', 'laR', 'llL', 'llR']) assert.ok(Math.abs(baseA[k] - Math.PI / 2) < 0.2, k + ' ' + baseA[k]);
  assert.ok(Math.abs(baseA.torso + Math.PI / 2) < 0.1, 'torso points up');
});
test("raising the user's LEFT wrist changes ONLY laL", () => {
  const l = standing(); l[15] = { x: 0.66, y: 0.2, visibility: 1 };
  const a = ang(l);
  assert.deepEqual(diffKeys(baseA, a), ['laL']);
  assert.ok(Math.abs(a.laL + Math.PI / 2) < 0.2, 'wrist should point up: ' + a.laL);
});
test("raising the user's RIGHT wrist changes ONLY laR", () => {
  const l = standing(); l[16] = { x: 0.34, y: 0.2, visibility: 1 };
  assert.deepEqual(diffKeys(baseA, ang(l)), ['laR']);
});
test("kicking the user's LEFT leg changes ONLY llL (and ulL if knee moves)", () => {
  const l = standing(); l[27] = { x: 0.8, y: 0.75, visibility: 1 };
  assert.deepEqual(diffKeys(baseA, ang(l)), ['llL']);
});
test("user's LEFT arm lands on the character's screen-LEFT limb (mirror)", () => {
  // outstretched left arm: raw x grows to the image right => mirrored screen-left (dx < 0)
  const l = standing(); l[13] = { x: 0.8, y: 0.3, visibility: 1 };
  const a = ang(l);
  assert.ok(Math.abs(Math.abs(a.uaL) - Math.PI) < 0.15, 'uaL should point to screen-left: ' + a.uaL);
  assert.deepEqual(diffKeys(baseA, a).filter((k) => k.endsWith('R')), []);
});
test('occluded limb holds its last angle instead of snapping', () => {
  const st = createPoseState();
  const first = landmarksToAngles(standing(), 640, 480, 1000, st);
  const l = standing(); l[15] = { x: 0.1, y: 0.1, visibility: 0.05 };
  const second = landmarksToAngles(l, 640, 480, 1033, st);
  assert.ok(Math.abs(wrap(second.laL - first.laL)) < 1e-9);
});
test('stepping closer to the camera scales the character up', () => {
  const st = createPoseState();
  landmarksToAngles(standing(), 640, 480, 1000, st); // auto-calibrates
  const big = standing().map((p) => ({ ...p, x: 0.5 + (p.x - 0.5) * 1.5, y: 0.5 + (p.y - 0.5) * 1.5 }));
  let a; for (let i = 1; i <= 40; i++) a = landmarksToAngles(big, 640, 480, 1000 + i * 33, st);
  assert.ok(a.scale > 1.3, 'scale ' + a.scale);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
