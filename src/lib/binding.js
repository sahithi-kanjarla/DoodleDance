// Binds every artwork pixel to exactly ONE bone of the explicit skeleton.
// Binding is against the character's own bones (never against webcam
// landmarks), so left/right limbs can never share artwork.

import { BONES, BONE_IDS } from './skeleton.js';

function segDist(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - a.x) * dx + (py - a.y) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

/** @returns Uint8Array of bone indices (255 = transparent pixel) */
export function bindPixels(rgba, w, h, rig) {
  const J = rig.joints;
  const hc = J.HEAD, hr = rig.headRadius;
  const segs = BONES.map((b) => (b.a ? { a: J[b.a], b: J[b.b] } : null));
  const headIdx = BONE_IDS.indexOf('head');
  const out = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (rgba[i * 4 + 3] === 0) continue;
      // Head owns its disc plus a halo; hair/hats/eyes just outside still
      // prefer the head via a bias, so they never turn into limbs.
      let best = Math.max(0, Math.hypot(x - hc.x, y - hc.y) - 1.25 * hr) * 0.5;
      let bi = headIdx;
      for (let k = 0; k < segs.length; k++) {
        if (!segs[k]) continue;
        const d = segDist(x, y, segs[k].a, segs[k].b);
        if (d < best) { best = d; bi = k; }
      }
      out[i] = bi;
    }
  }
  return out;
}

/**
 * Cuts the artwork into one RGBA piece per bone (cropped to its bounding box).
 * Each child bone also receives a small copy of its parent's pixels around the
 * shared joint, which hides cracks when the joint bends.
 */
export function buildPieces(rgba, w, h, rig) {
  const assign = bindPixels(rgba, w, h, rig);
  const J = rig.joints;
  const overlap = Math.max(5, (rig.strokeWidth || 6) * 0.9);
  const lists = BONE_IDS.map(() => []);
  const children = BONES.map((b) => BONES.map((c, ci) => (c.parent === b.id ? ci : -1)).filter((v) => v >= 0));
  for (let i = 0; i < w * h; i++) {
    const b = assign[i];
    if (b === 255) continue;
    lists[b].push(i);
    const x = i % w, y = (i / w) | 0;
    for (const c of children[b]) {
      const p = J[BONES[c].pivot];
      if (Math.hypot(x - p.x, y - p.y) <= overlap) lists[c].push(i);
    }
  }
  const pieces = {};
  BONES.forEach((bone, bi) => {
    const list = lists[bi];
    if (!list.length) { pieces[bone.id] = null; return; }
    let minx = w, miny = h, maxx = 0, maxy = 0;
    for (const i of list) {
      const x = i % w, y = (i / w) | 0;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    const pw = maxx - minx + 1, ph = maxy - miny + 1;
    const data = new Uint8ClampedArray(pw * ph * 4);
    for (const i of list) {
      const x = (i % w) - minx, y = ((i / w) | 0) - miny, o = (y * pw + x) * 4;
      data[o] = rgba[i * 4]; data[o + 1] = rgba[i * 4 + 1];
      data[o + 2] = rgba[i * 4 + 2]; data[o + 3] = rgba[i * 4 + 3];
    }
    pieces[bone.id] = { x: minx, y: miny, w: pw, h: ph, data, pixels: list.length };
  });
  return { pieces, assign };
}
