// Bone-based retargeting. Pose = absolute bone angles (character-agnostic, so
// they are also what we will send over the network). The character's drawn
// pose is its rest pose; each bone's artwork rotates by (target - rest) about
// its own joint, with joint positions found by forward kinematics so the
// character's own limb lengths and proportions are preserved.

import { ANGLE_KEYS } from './skeleton.js';

export const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const rot = (v, a) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

export function restAngles(rig) {
  const J = rig.joints;
  return {
    torso: ang(J.PELVIS, J.NECK),
    head: 0,
    uaL: ang(J.LEFT_SHOULDER, J.LEFT_ELBOW),   laL: ang(J.LEFT_ELBOW, J.LEFT_WRIST),
    uaR: ang(J.RIGHT_SHOULDER, J.RIGHT_ELBOW), laR: ang(J.RIGHT_ELBOW, J.RIGHT_WRIST),
    ulL: ang(J.LEFT_HIP, J.LEFT_KNEE),         llL: ang(J.LEFT_KNEE, J.LEFT_ANKLE),
    ulR: ang(J.RIGHT_HIP, J.RIGHT_KNEE),       llR: ang(J.RIGHT_KNEE, J.RIGHT_ANKLE),
  };
}

export function torsoLength(rig) {
  const J = rig.joints;
  return Math.max(10, Math.hypot(J.NECK.x - J.PELVIS.x, J.NECK.y - J.PELVIS.y));
}

/**
 * Returns a transform per bone: {pivot (rest), cur (posed), rot}. A bone's
 * artwork is drawn with translate(cur) rotate(rot) translate(-pivot).
 * Missing (null/undefined) angles keep that bone at rest relative to its parent.
 */
export function solve(rig, rest, angles) {
  const J = rig.joints;
  const a = angles || {};
  const has = (k) => a[k] !== null && a[k] !== undefined && Number.isFinite(a[k]);
  const P = J.PELVIS;

  const tD = has('torso') ? wrap(a.torso - rest.torso) : 0;
  const neckCur = add(P, rot(sub(J.NECK, P), tD));
  const hD = has('head') ? wrap(a.head - rest.head) : tD;
  const headCur = add(neckCur, rot(sub(J.HEAD, J.NECK), hD));

  const T = {
    torso: { pivot: P, cur: P, rot: tD },
    head: { pivot: J.NECK, cur: neckCur, rot: hD },
  };

  for (const s of ['L', 'R']) {
    const S = s === 'L' ? 'LEFT' : 'RIGHT';
    // arms hang off the (rotated) torso
    const shRest = J[`${S}_SHOULDER`], elRest = J[`${S}_ELBOW`], wrRest = J[`${S}_WRIST`];
    const shCur = add(P, rot(sub(shRest, P), tD));
    const dU = has(`ua${s}`) ? wrap(a[`ua${s}`] - rest[`ua${s}`]) : tD;
    const elCur = add(shCur, rot(sub(elRest, shRest), dU));
    const dL = has(`la${s}`) ? wrap(a[`la${s}`] - rest[`la${s}`]) : dU;
    const wrCur = add(elCur, rot(sub(wrRest, elRest), dL));
    T[`ua${s}`] = { pivot: shRest, cur: shCur, rot: dU };
    T[`la${s}`] = { pivot: elRest, cur: elCur, rot: dL };
    T[`wrist${s}`] = wrCur;

    // legs hang off the pelvis (translation only)
    const hipRest = J[`${S}_HIP`], knRest = J[`${S}_KNEE`], anRest = J[`${S}_ANKLE`];
    const dUL = has(`ul${s}`) ? wrap(a[`ul${s}`] - rest[`ul${s}`]) : 0;
    const knCur = add(hipRest, rot(sub(knRest, hipRest), dUL));
    const dLL = has(`ll${s}`) ? wrap(a[`ll${s}`] - rest[`ll${s}`]) : dUL;
    T[`ul${s}`] = { pivot: hipRest, cur: hipRest, rot: dUL };
    T[`ll${s}`] = { pivot: knRest, cur: knCur, rot: dLL };
    T[`ankle${s}`] = add(knCur, rot(sub(anRest, knRest), dLL));
  }
  T.headCur = headCur;
  T.headRot = hD;
  return T;
}

/** How far each bone is from rest, in radians (for the activity meters). */
export function activity(rest, angles) {
  const out = {};
  for (const k of ANGLE_KEYS) {
    const v = angles?.[k];
    out[k] = v === null || v === undefined ? 0 : Math.abs(wrap(v - rest[k]));
  }
  return out;
}
