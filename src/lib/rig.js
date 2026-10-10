// Automatic rig detection from a drawing. Pure functions, no DOM.
// Input: ink mask (1 = ink). Output: the 15 semantic joints (see skeleton.js).
//
// Pipeline
//  1. close tiny gaps, estimate stroke width
//  2. HEAD: gather candidates (closed loops at several closing strengths, filled
//     blobs), score them (roundness, size, "has a torso under it", position),
//     pick the best. Hats, hair curls, bags and raised hands lose to the head.
//  3. cut the head disc off; classify what is left: body vs hair/hat/accessory;
//     bridge limbs that were drawn without touching the body
//  4. thin to a 1px skeleton, shortest-path tree from the neck, prune spurs
//  5. ROLES: try every way of choosing 2 arms + 2 legs from the branch ends and
//     keep the lowest-cost human configuration (junction heights, lengths,
//     unused long branches, ...). Missing limbs get sensible defaults.
//  6. elbows/knees at the bends, shoulders/hips just off the junctions

const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

export function maskFromRGBA(data, w, h, thr = 40) {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = data[i * 4 + 3] > thr ? 1 : 0;
  return m;
}

// ---------------------------------------------------------------- primitives
function dilate(src, w, h, r) {
  if (r <= 0) return Uint8Array.from(src);
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -1e9;
    // forward/backward run-length trick keeps this O(n) per row
    for (let x = 0; x < w; x++) { if (src[y * w + x]) last = x; if (x - last <= r) tmp[y * w + x] = 1; }
    last = 1e9;
    for (let x = w - 1; x >= 0; x--) { if (src[y * w + x]) last = x; if (last - x <= r) tmp[y * w + x] = 1; }
  }
  for (let x = 0; x < w; x++) {
    let last = -1e9;
    for (let y = 0; y < h; y++) { if (tmp[y * w + x]) last = y; if (y - last <= r) out[y * w + x] = 1; }
    last = 1e9;
    for (let y = h - 1; y >= 0; y--) { if (tmp[y * w + x]) last = y; if (last - y <= r) out[y * w + x] = 1; }
  }
  return out;
}

function erode(src, w, h, r) {
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inv[i] = src[i] ? 0 : 1;
  const d = dilate(inv, w, h, r);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = d[i] ? 0 : 1;
  return out;
}
// closing seals gaps up to ~2r without thickening strokes or filling small interiors
function closeMask(src, w, h, r) { return erode(dilate(src, w, h, r), w, h, r); }

// Zhang-Suen thinning
function thin(src, w, h) {
  const m = Uint8Array.from(src);
  for (let x = 0; x < w; x++) { m[x] = 0; m[(h - 1) * w + x] = 0; }
  for (let y = 0; y < h; y++) { m[y * w] = 0; m[y * w + w - 1] = 0; }
  const del = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      del.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!m[i]) continue;
          const p2 = m[i - w], p3 = m[i - w + 1], p4 = m[i + 1], p5 = m[i + w + 1];
          const p6 = m[i + w], p7 = m[i + w - 1], p8 = m[i - 1], p9 = m[i - w - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) +
                    (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
          if (A !== 1) continue;
          if (step === 0) { if (p2 * p4 * p6 || p4 * p6 * p8) continue; }
          else if (p2 * p4 * p8 || p2 * p6 * p8) continue;
          del.push(i);
        }
      }
      for (const i of del) m[i] = 0;
      if (del.length) changed = true;
    }
  }
  return m;
}

function components(mask, w, h, conn8 = true) {
  const label = new Int32Array(w * h);
  const comps = [];
  const q = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s]) continue;
    const id = comps.length + 1;
    let qh = 0, qt = 0;
    q[qt++] = s; label[s] = id;
    let area = 0, sx = 0, sy = 0, minx = w, maxx = 0, miny = h, maxy = 0;
    while (qh < qt) {
      const i = q[qh++];
      const x = i % w, y = (i / w) | 0;
      area++; sx += x; sy += y;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      for (let k = 0; k < 8; k++) {
        const dx = N8[k][0], dy = N8[k][1];
        if (!conn8 && dx && dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (mask[j] && !label[j]) { label[j] = id; q[qt++] = j; }
      }
    }
    comps.push({ id, area, cx: sx / area, cy: sy / area, minx, maxx, miny, maxy });
  }
  return { label, comps };
}

// Enclosed background regions, with per-region shape stats.
function findHoles(ink, w, h) {
  const outside = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  let qh = 0, qt = 0;
  const push = (i) => { if (!ink[i] && !outside[i]) { outside[i] = 1; q[qt++] = i; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (qh < qt) {
    const i = q[qh++];
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  const enclosed = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) enclosed[i] = !ink[i] && !outside[i] ? 1 : 0;
  const { label, comps } = components(enclosed, w, h, false);
  // roundness of the FILLED outline (face features carved out of a head must not
  // make it look non-round): row-span area / (pi * farthest-pixel^2 from bbox centre)
  const rowMin = comps.map((c) => new Int32Array(c.maxy - c.miny + 1).fill(1e9));
  const rowMax = comps.map((c) => new Int32Array(c.maxy - c.miny + 1).fill(-1));
  const far2 = new Float64Array(comps.length + 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = label[y * w + x];
    if (!l) continue;
    const c = comps[l - 1], k = y - c.miny;
    if (x < rowMin[l - 1][k]) rowMin[l - 1][k] = x;
    if (x > rowMax[l - 1][k]) rowMax[l - 1][k] = x;
    const d = (x - (c.minx + c.maxx) / 2) ** 2 + (y - (c.miny + c.maxy) / 2) ** 2;
    if (d > far2[l]) far2[l] = d;
  }
  comps.forEach((c, i) => {
    let span = 0;
    for (let k = 0; k < rowMin[i].length; k++) if (rowMax[i][k] >= 0) span += rowMax[i][k] - rowMin[i][k] + 1;
    c.span = span;
    c.round = span / (Math.PI * Math.max(1, far2[c.id]));
  });
  return { holes: comps, enclosed, label };
}

function fillSmallHoles(ink, w, h, maxArea) {
  const { holes, label } = findHoles(ink, w, h);
  const out = Uint8Array.from(ink);
  const kill = new Set(holes.filter((c) => c.area <= maxArea).map((c) => c.id));
  if (!kill.size) return out;
  for (let i = 0; i < w * h; i++) if (label[i] && kill.has(label[i])) out[i] = 1;
  return out;
}

// Chamfer distance to nearest background.
function distanceTransform(ink, w, h) {
  const d = new Float32Array(w * h);
  const INF = 1e9;
  for (let i = 0; i < w * h; i++) d[i] = ink[i] ? INF : 0;
  const a = 1, b = 1.4142;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], d[i - 1] + a, d[i - w] + a, d[i - w - 1] + b, d[i - w + 1] + b);
    }
  }
  for (let y = h - 2; y > 0; y--) {
    for (let x = w - 2; x > 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], d[i + 1] + a, d[i + w] + a, d[i + w + 1] + b, d[i + w - 1] + b);
    }
  }
  return d;
}

// Distance (and nearest source pixel) from a set of source pixels.
function distanceFromSet(src, w, h) {
  const d = new Float32Array(w * h).fill(1e9);
  const near = new Int32Array(w * h).fill(-1);
  for (let i = 0; i < w * h; i++) if (src[i]) { d[i] = 0; near[i] = i; }
  const a = 1, b = 1.4142;
  const relax = (i, j, c) => { if (d[j] + c < d[i]) { d[i] = d[j] + c; near[i] = near[j]; } };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x > 0) relax(i, i - 1, a);
    if (y > 0) { relax(i, i - w, a); if (x > 0) relax(i, i - w - 1, b); if (x < w - 1) relax(i, i - w + 1, b); }
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (x < w - 1) relax(i, i + 1, a);
    if (y < h - 1) { relax(i, i + w, a); if (x < w - 1) relax(i, i + w + 1, b); if (x > 0) relax(i, i + w - 1, b); }
  }
  return { d, near };
}

function bboxOf(mask, w, h) {
  let minx = w, maxx = -1, miny = h, maxy = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
  }
  return maxx < 0 ? null : { minx, maxx, miny, maxy };
}

function count(m) { let c = 0; for (let i = 0; i < m.length; i++) c += m[i]; return c; }
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const xy = (i, w) => ({ x: i % w, y: (i / w) | 0 });

function drawLine(m, w, h, a, b) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)) + 1;
  for (let k = 0; k <= n; k++) {
    const x = Math.round(a.x + ((b.x - a.x) * k) / n), y = Math.round(a.y + ((b.y - a.y) * k) / n);
    if (x >= 0 && y >= 0 && x < w && y < h) m[y * w + x] = 1;
  }
}

// ---------------------------------------------------------------- head
// Does a torso line run down from this candidate? Flood the ink in a narrow
// corridor that starts at the disc and widens downward (torsos lean a little).
// Hats / hair rings sit ON the head, so below them is only the head outline and
// then empty face: the corridor dies after a few pixels. Returns 0..1.
function neckLink(ink, w, h, c, bboxH) {
  const ybot = c.y + c.r;
  const hwAt = (y) => Math.max(6, 0.5 * c.r + 0.3 * Math.max(0, y - ybot));
  const y0 = Math.max(1, Math.round(ybot - 0.35 * c.r)), yMax = Math.min(h - 2, Math.round(ybot + 0.9 * (bboxH || 400)));
  const seen = new Uint8Array((yMax - y0 + 1) * w);
  const q = [];
  const inCorr = (x, y) => y >= y0 && y <= yMax && Math.abs(x - c.x) <= hwAt(y);
  for (let y = y0; y <= Math.round(ybot + 0.6 * c.r); y++) {
    const hw = hwAt(y);
    for (let x = Math.max(1, Math.round(c.x - hw)); x <= Math.min(w - 2, Math.round(c.x + hw)); x++) {
      if (!ink[y * w + x]) continue;
      // seeds: the outline near the bottom of the disc (not face features inside it)
      if (Math.hypot(x - c.x, y - c.y) < c.r * 0.82) continue;
      seen[(y - y0) * w + x] = 1; q.push(y * w + x);
    }
  }
  let maxY = y0;
  for (let qh = 0; qh < q.length; qh++) {
    const i = q[qh], x = i % w, y = (i / w) | 0;
    if (y > maxY) maxY = y;
    for (let k = 0; k < 8; k++) {
      const nx = x + N8[k][0], ny = y + N8[k][1];
      if (!inCorr(nx, ny) || !ink[ny * w + nx] || seen[(ny - y0) * w + nx]) continue;
      seen[(ny - y0) * w + nx] = 1; q.push(ny * w + nx);
    }
  }
  const depth = Math.max(0, maxY - ybot);
  return Math.max(0, Math.min(1, depth / Math.max(40, 0.2 * (bboxH || 400))));
}

// Circle fit by voting: how much of a circle's perimeter lies on ink. Finds
// open loops, scribbled and filled heads that enclose no clean hole.
function circleFits(ink, w, h, bbox, sw) {
  const Hh = bbox.maxy - bbox.miny + 1;
  const rmin = Math.max(10, Math.round(0.035 * Hh)), rmax = Math.round(0.2 * Hh);
  const tol = sw / 2 + 1.6;
  const { d } = distanceFromSet(ink, w, h);
  const NA = 40, cs = [], sn = [];
  for (let k = 0; k < NA; k++) { cs.push(Math.cos((2 * Math.PI * k) / NA)); sn.push(Math.sin((2 * Math.PI * k) / NA)); }
  const y0 = bbox.miny + rmin - 4, y1 = bbox.miny + Math.round(0.62 * Hh);
  const x0 = bbox.minx + rmin - 4, x1 = bbox.maxx - rmin + 4;
  const hits = [];
  for (let cy = y0; cy <= y1; cy += 2) {
    for (let cx = x0; cx <= x1; cx += 2) {
      for (let r = rmin; r <= rmax; r += 2) {
        let hit = 0, bad = false;
        for (let k = 0; k < NA; k += 4) {
          const px = Math.round(cx + r * cs[k]), py = Math.round(cy + r * sn[k]);
          if (px < 0 || py < 0 || px >= w || py >= h) { bad = true; break; }
          if (d[py * w + px] <= tol) hit++;
        }
        if (bad || hit < 7) continue;
        let full = 0;
        for (let k = 0; k < NA; k++) {
          const px = Math.round(cx + r * cs[k]), py = Math.round(cy + r * sn[k]);
          if (px >= 0 && py >= 0 && px < w && py < h && d[py * w + px] <= tol) full++;
        }
        const cov = full / NA;
        if (cov >= 0.8) hits.push({ x: cx, y: cy, r, cov });
      }
    }
  }
  hits.sort((a, b) => b.cov - a.cov || b.r - a.r);
  const out = [];
  const used = new Uint8Array(hits.length);
  for (let i = 0; i < hits.length && out.length < 8; i++) {
    if (used[i]) continue;
    const t = hits[i];
    let sx = 0, sy = 0, sr = 0, sw8 = 0;
    for (let j = i; j < hits.length; j++) {
      const q = hits[j];
      if (used[j] || Math.hypot(q.x - t.x, q.y - t.y) > 0.4 * t.r || Math.abs(q.r - t.r) > 0.4 * t.r) continue;
      used[j] = 1;
      if (q.cov >= t.cov - 0.1) { sx += q.x * q.cov; sy += q.y * q.cov; sr += q.r * q.cov; sw8 += q.cov; }
    }
    out.push({ type: 'arc', x: sx / sw8, y: sy / sw8, r: sr / sw8, round: Math.min(1, t.cov * 1.05), lev: 0, cov: t.cov });
  }
  return out;
}

function headCandidates(ink, w, h, bbox, sw, rc) {
  const Hh = bbox.maxy - bbox.miny + 1;
  const cands = [];
  // (a) clean enclosed loops (closing already sealed small gaps)
  const { holes } = findHoles(ink, w, h);
  for (const c of holes) {
    const bw = c.maxx - c.minx + 1, bh = c.maxy - c.miny + 1;
    const r = (bw + bh) / 4 + sw * 0.5;
    if (c.round < 0.55 || bw / bh > 1.8 || bh / bw > 1.8) continue;
    if (r < Math.max(9, 0.03 * Hh) || r > 0.3 * Hh) continue;
    cands.push({ type: 'loop', x: (c.minx + c.maxx) / 2, y: (c.miny + c.maxy) / 2, r, round: c.round, lev: 0, area: c.area });
  }
  // (b) circle fits: open loops, scribbles, filled discs
  for (const f of circleFits(ink, w, h, bbox, sw)) {
    if (cands.some((c) => Math.hypot(c.x - f.x, c.y - f.y) < 0.45 * c.r && Math.abs(c.r - f.r) < 0.4 * c.r)) continue;
    cands.push(f);
  }
  // eyes / mouth / hat rings that sit inside a bigger loop are not heads
  for (let i = cands.length - 1; i >= 0; i--) {
    const c = cands[i];
    if (cands.some((o) => o !== c && o.r > c.r && dist(o, c) + c.r <= 1.12 * o.r)) cands.splice(i, 1);
  }
  // solid discs that are barely thicker than a stroke junction are not heads
  for (let i = cands.length - 1; i >= 0; i--) {
    const c = cands[i];
    if (c.type !== 'arc') continue;
    let inside = 0, tot = 0;
    const R = Math.round(0.55 * c.r);
    for (let y = -R; y <= R; y += 2) for (let x = -R; x <= R; x += 2) {
      if (x * x + y * y > R * R) continue;
      const px = Math.round(c.x + x), py = Math.round(c.y + y);
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      tot++; if (ink[py * w + px]) inside++;
    }
    if (tot && inside / tot > 0.8 && c.r < 2.8 * (sw / 2 + rc)) cands.splice(i, 1);
  }
  return cands;
}

function scoreHeads(ink, w, h, bbox, sw, rc) {
  const Hh = bbox.maxy - bbox.miny + 1;
  const cands = headCandidates(ink, w, h, bbox, sw, rc);
  for (const c of cands) {
    c.neck = neckLink(ink, w, h, c, Hh);
    const rel = c.r / Hh;
    const top = (c.y - bbox.miny) / Hh;                    // 0 = top of drawing
    let s = 0;
    s += 2.4 * c.neck;
    s += 1.2 * Math.min(1, c.round);
    s += 1.6 * Math.min(1, rel / 0.09);                    // bigger beats hat/hair loops
    s -= 2.0 * Math.max(0, rel - 0.2) / 0.1;               // implausibly huge
    s -= 8.0 * Math.max(0, top - 0.3);                     // low in the figure => bag, belt, hand blob
    if (c.type === 'arc') s -= 0.15;
    c.score = s;
    c.method = c.type;
    c.confidence = Math.max(0.2, Math.min(1, s / 4));
  }
  return cands.filter((c) => c.neck >= 0.1).sort((a, b) => b.score - a.score);
}

function guessHead(ink, w, h, bbox) {
  const Hh = bbox.maxy - bbox.miny + 1;
  // widest vertical run of ink in the top third marks the neck line; head sits above it
  const topXs = [];
  const y0 = bbox.miny + Math.round(Hh * 0.04);
  for (let x = bbox.minx; x <= bbox.maxx; x++) if (ink[y0 * w + x]) topXs.push(x);
  const cx = topXs.length ? topXs.reduce((a, b) => a + b, 0) / topXs.length : (bbox.minx + bbox.maxx) / 2;
  const r = Math.max(Hh * 0.08, 10);
  return { x: cx, y: bbox.miny + r * 1.4, r, method: 'guess', confidence: 0.15 };
}

// ---------------------------------------------------------------- limbs
function pointAtArc(pts, cum, s) {
  if (s <= 0) return pts[0];
  const L = cum[cum.length - 1];
  if (s >= L) return pts[pts.length - 1];
  let i = 1;
  while (i < cum.length && cum[i] < s) i++;
  const t = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
  return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
}

function smoothPath(pts, win = 5) {
  const n = pts.length, half = (win / 2) | 0;
  return pts.map((p, i) => {
    if (i === 0 || i === n - 1) return p;
    const a = Math.max(0, i - half), b = Math.min(n - 1, i + half);
    let sx = 0, sy = 0;
    for (let k = a; k <= b; k++) { sx += pts[k].x; sy += pts[k].y; }
    return { x: sx / (b - a + 1), y: sy / (b - a + 1) };
  });
}

// pts: junction -> tip. Returns {top, mid, tip}.
function limbJoints(rawPts, H, topFrac) {
  const pts = smoothPath(rawPts, 9);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i], pts[i - 1]));
  const L = cum[cum.length - 1];
  const tip = rawPts[rawPts.length - 1];
  const topS = Math.min(topFrac * L, 0.05 * H);
  const top = pointAtArc(pts, cum, topS);
  const chord = dist(top, tip);
  const lo = topS + 0.2 * (L - topS), hi = topS + 0.8 * (L - topS);
  let bestD = 0, best = null;
  const dx = tip.x - top.x, dy = tip.y - top.y;
  for (let i = 0; i < pts.length; i++) {
    if (cum[i] < lo || cum[i] > hi) continue;
    const d = Math.abs(dx * (pts[i].y - top.y) - dy * (pts[i].x - top.x)) / Math.max(1e-6, chord);
    if (d > bestD) { bestD = d; best = pts[i]; }
  }
  const mid = best && bestD > 0.06 * chord ? best : pointAtArc(pts, cum, topS + 0.5 * (L - topS));
  return { top, mid, tip, len: L };
}

function round1(p) { return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }; }

// Proportional skeleton, used for whole figures that could not be read at all.
export function templateRig(bbox, head) {
  const H = bbox.maxy - bbox.miny, cx = head.x;
  const neck = { x: cx, y: head.y + head.r * 1.05 };
  const pelvis = { x: cx, y: neck.y + H * 0.32 };
  const sh = H * 0.07, arm = H * 0.17, leg = H * 0.2;
  return {
    HEAD: { x: head.x, y: head.y }, NECK: neck, PELVIS: pelvis,
    LEFT_SHOULDER: { x: cx - sh, y: neck.y + H * 0.04 },
    LEFT_ELBOW: { x: cx - sh - arm * 0.5, y: neck.y + H * 0.14 },
    LEFT_WRIST: { x: cx - sh - arm, y: neck.y + H * 0.24 },
    RIGHT_SHOULDER: { x: cx + sh, y: neck.y + H * 0.04 },
    RIGHT_ELBOW: { x: cx + sh + arm * 0.5, y: neck.y + H * 0.14 },
    RIGHT_WRIST: { x: cx + sh + arm, y: neck.y + H * 0.24 },
    LEFT_HIP: { x: cx - H * 0.03, y: pelvis.y + H * 0.02 },
    LEFT_KNEE: { x: cx - H * 0.07, y: pelvis.y + leg },
    LEFT_ANKLE: { x: cx - H * 0.09, y: pelvis.y + leg * 2 },
    RIGHT_HIP: { x: cx + H * 0.03, y: pelvis.y + H * 0.02 },
    RIGHT_KNEE: { x: cx + H * 0.07, y: pelvis.y + leg },
    RIGHT_ANKLE: { x: cx + H * 0.09, y: pelvis.y + leg * 2 },
  };
}

// A hanging limb synthesised from nothing (used when a limb could not be found).
function defaultLimb(top, dir, L1, L2) {
  const mid = { x: top.x + dir.x * L1, y: top.y + dir.y * L1 };
  return { top, mid, tip: { x: mid.x + dir.x * L2, y: mid.y + dir.y * L2 }, len: L1 + L2, synthetic: true };
}

// ---------------------------------------------------------------- roles
// Choose which 4 branch ends are the arms and legs. paths[i] is the pixel path
// neck -> leaf i. Costs are in "figure heights".
function assignRoles(paths, w, H, neckY) {
  const n = paths.length;
  const common = (A, B) => { let k = 0; while (k < A.length && k < B.length && A[k] === B[k]) k++; return k; };
  const lca = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let a = 0; a < n; a++) for (let b = a; b < n; b++) lca[a][b] = lca[b][a] = common(paths[a], paths[b]);
  const tipY = paths.map((p) => ((p[p.length - 1] / w) | 0));
  const len = paths.map((p) => p.length);
  const junctionY = (a, b) => ((paths[a][Math.max(0, lca[a][b] - 1)] / w) | 0);
  const arcFromJ = (a, b) => Math.max(0, len[a] - lca[a][b]);

  const pairCost = (a, b, role) => {
    const j = lca[a][b];
    if (j < 1) return 1e3;
    const la = arcFromJ(a, b) / H, lb = arcFromJ(b, a) / H;
    let c = 0;
    const lo = role === 'arm' ? 0.07 : 0.1, hi = role === 'arm' ? 0.55 : 0.65;
    for (const l of [la, lb]) { if (l < lo) c += (lo - l) * 12; if (l > hi) c += (l - hi) * 6; }
    c += Math.abs(la - lb) * 0.8;                              // limbs of a pair are alike
    return c;
  };

  let best = null, bestCost = Infinity;
  const idx = [...Array(n).keys()];
  for (let a1 = 0; a1 < n; a1++) for (let a2 = a1 + 1; a2 < n; a2++) {
    for (let l1 = 0; l1 < n; l1++) {
      if (l1 === a1 || l1 === a2) continue;
      for (let l2 = l1 + 1; l2 < n; l2++) {
        if (l2 === a1 || l2 === a2) continue;
        const jA = junctionY(a1, a2), jL = junctionY(l1, l2);
        const legsLower = (jL - jA) / H;                      // pelvis must be below the shoulders
        let c = pairCost(a1, a2, 'arm') + pairCost(l1, l2, 'leg');
        if (legsLower < 0.08) c += (0.08 - legsLower) * 18;
        const armTop = (jA - neckY) / H;                      // arms leave near the neck
        if (armTop > 0.4) c += (armTop - 0.4) * 10;
        if (jL < neckY + 0.2 * H) c += 4;                     // pelvis can't hug the head
        const armsY = (tipY[a1] + tipY[a2]) / 2, legsY = (tipY[l1] + tipY[l2]) / 2;
        c -= Math.max(-0.3, Math.min(0.5, (legsY - armsY) / H)) * 2.2;   // feet are lower than hands
        // each leg should reach below the pelvis it hangs from (kick = sideways, still not above it)
        for (const t of [l1, l2]) if (tipY[t] < jL - 0.02 * H) c += ((jL - tipY[t]) / H) * 6;
        // legs share the pelvis junction, arms share the shoulder junction: other pairings must merge lower
        const cross = Math.min(lca[a1][l1], lca[a1][l2], lca[a2][l1], lca[a2][l2]);
        if (cross > lca[a1][a2] + 3 * 1 && lca[a1][a2] > 0 && cross > lca[l1][l2]) c += 2; // arm+leg shouldn't merge deeper than their own pair
        // long branches left over are probably real limbs we skipped; short ones are props
        const used = new Set([a1, a2, l1, l2]);
        for (const u of idx) {
          if (used.has(u)) continue;
          let attach = 0;
          for (const v of used) attach = Math.max(attach, lca[u][v]);
          const own = Math.max(0, len[u] - attach) / H;
          c += Math.max(0, own - 0.05) * 5;
        }
        if (c < bestCost) { bestCost = c; best = { a1, a2, l1, l2, cost: c }; }
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------- main
// Everything that depends on WHICH disc we call the head: cut it off, classify
// and bridge what is left, grow the neck tree, pick arms/legs, build joints.
function analyzeWithHead(ctx, head) {
  const { w, h, skelPts, sw, rc, Hh, bbox } = ctx;
  const warnings = [];
  const cutR = head.r + sw * 0.5 + 2;
  const rest = new Uint8Array(w * h);
  for (const i of skelPts) if (Math.hypot(i % w - head.x, ((i / w) | 0) - head.y) > cutR) rest[i] = 1;
  const { label, comps } = components(rest, w, h, true);
  if (!comps.length) return { fail: true, cost: 99, warnings };

  const mainId = comps.reduce((a, b) => (b.area > a.area ? b : a)).id;
  const attached = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (label[i] === mainId) attached[i] = 1;
  const pending = comps.filter((c) => c.id !== mainId && c.area >= Math.max(5, 0.03 * Hh));
  const gapMax = Math.max(14, 0.11 * Hh);
  const compPixels = (c, fn) => {
    for (let y = c.miny; y <= c.maxy; y++) for (let x = c.minx; x <= c.maxx; x++) if (label[y * w + x] === c.id) fn(x, y, y * w + x);
  };
  const headDist = (c) => { let m = 1e9; compPixels(c, (x, y) => { const d = Math.hypot(x - head.x, y - head.y) - cutR; if (d < m) m = d; }); return m; };
  const extent = (c) => Math.hypot(c.maxx - c.minx, c.maxy - c.miny);
  while (pending.length) {
    const { d, near } = distanceFromSet(attached, w, h);
    let pick = -1, pickD = Infinity, pickP = -1;
    pending.forEach((c, k) => compPixels(c, (x, y, i) => { if (d[i] < pickD) { pickD = d[i]; pick = k; pickP = i; } }));
    if (pick < 0) break;
    const c = pending.splice(pick, 1)[0];
    const dh = headDist(c), ext = extent(c);
    // hair / hats / spikes hug the head; limbs reach back to the body
    const hugsHead = dh <= 1.5 * sw + 2;
    const ok = pickD <= gapMax && (!hugsHead || (ext >= 0.17 * Hh && pickD < dh) || pickD <= 0.5 * sw + rc);
    if (!ok) continue;
    drawLine(attached, w, h, xy(pickP, w), xy(near[pickP], w));
    compPixels(c, (x, y, i) => { attached[i] = 1; });
  }
  const skel = attached;
  const pts = [];
  for (let i = 0; i < w * h; i++) if (skel[i]) pts.push(i);
  if (pts.length < 10) return { fail: true, cost: 99, warnings };

  // neck: nearest skeleton pixel under the head, roughly centred
  let neckI = -1, bd = Infinity;
  for (const i of pts) {
    const x = i % w, y = (i / w) | 0;
    if (y <= head.y) continue;
    const dd = Math.hypot(x - head.x, y - head.y) + 0.8 * Math.max(0, Math.abs(x - head.x) - 0.5 * head.r);
    if (dd < bd) { bd = dd; neckI = i; }
  }
  if (neckI < 0) return { fail: true, cost: 99, warnings };

  // shortest-path tree from the neck, prune spurs
  const parent = new Int32Array(w * h).fill(-1);
  const depth = new Int32Array(w * h).fill(-1);
  const order = [neckI];
  depth[neckI] = 0;
  for (let qh = 0; qh < order.length; qh++) {
    const i = order[qh];
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of N8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (skel[j] && depth[j] < 0) { depth[j] = depth[i] + 1; parent[j] = i; order.push(j); }
    }
  }
  const cc = new Uint16Array(w * h);
  for (const i of order) if (i !== neckI) cc[parent[i]]++;
  const removed = new Uint8Array(w * h);
  const spurMin = Math.max(0.045 * Hh, 2.2 * sw);
  let again = true;
  while (again) {
    again = false;
    for (const leaf of order) {
      if (removed[leaf] || cc[leaf] !== 0 || leaf === neckI) continue;
      const path = [leaf];
      let cur = parent[leaf];
      while (cur !== neckI && cc[cur] === 1) { path.push(cur); cur = parent[cur]; }
      if (cur === neckI && cc[neckI] <= 1) continue;
      if (path.length < spurMin) { for (const p of path) removed[p] = 1; cc[cur]--; again = true; }
    }
  }
  const leaves = order.filter((i) => !removed[i] && cc[i] === 0 && i !== neckI);
  const pathOf = (leaf) => { const p = []; for (let c = leaf; c !== -1; c = parent[c]) p.push(c); return p.reverse(); };
  let leafList = leaves;
  if (leafList.length > 9) leafList = leafList.map((l) => [l, depth[l]]).sort((a, b) => b[1] - a[1]).slice(0, 9).map((v) => v[0]);
  const paths = leafList.map(pathOf);

  // roles
  const neckPt = xy(neckI, w);
  const choice = paths.length >= 4 ? assignRoles(paths, w, Hh, neckPt.y) : null;
  let confidence = head.confidence;
  const limbFrom = (path, junctionIdx, topFrac) => limbJoints(path.slice(junctionIdx).map((i) => xy(i, w)), Hh, topFrac);
  const common = (A, B) => { let k = 0; while (k < A.length && k < B.length && A[k] === B[k]) k++; return k; };
  const meanX = (path, from) => path.slice(from).reduce((acc, p) => acc + (p % w), 0) / Math.max(1, path.length - from);

  const torsoLen0 = Math.max(0.2 * Hh, 20);
  let arms, legs, pelvisPt, cost;
  if (choice) {
    const jA = common(paths[choice.a1], paths[choice.a2]) - 1;
    const jL = common(paths[choice.l1], paths[choice.l2]) - 1;
    arms = [choice.a1, choice.a2].map((i) => ({ ...limbFrom(paths[i], jA, 0.1), mx: meanX(paths[i], jA) })).sort((p, q) => p.mx - q.mx);
    legs = [choice.l1, choice.l2].map((i) => ({ ...limbFrom(paths[i], jL, 0.08), mx: meanX(paths[i], jL) })).sort((p, q) => p.mx - q.mx);
    pelvisPt = xy(paths[choice.l1][jL], w);
    cost = choice.cost;
    confidence *= Math.max(0.3, 1 - choice.cost / 6);
    if (choice.cost > 3) warnings.push('The body was unusual — check the limbs.');
  } else {
    // fewer than 4 branch ends: salvage what exists, default the rest
    cost = 9 + (4 - paths.length);
    warnings.push(`Only found ${paths.length} limb end${paths.length === 1 ? '' : 's'} — the rest were placed automatically. Check the joints.`);
    confidence *= 0.35;
    const tips = paths.map((p) => ({ p, ...xy(p[p.length - 1], w) })).sort((a, b) => b.y - a.y);
    const torsoLen = tips.length ? Math.max(torsoLen0, (tips[0].y - neckPt.y) * 0.45) : torsoLen0;
    pelvisPt = { x: neckPt.x, y: neckPt.y + torsoLen };
    const hang = (side, kind) => {
      const sgn = side === 'L' ? -1 : 1;
      if (kind === 'leg') return defaultLimb({ x: pelvisPt.x + sgn * 0.03 * Hh, y: pelvisPt.y }, { x: sgn * 0.18, y: 0.98 }, 0.19 * Hh, 0.19 * Hh);
      return defaultLimb({ x: neckPt.x + sgn * 0.05 * Hh, y: neckPt.y + 0.05 * Hh }, { x: sgn * 0.3, y: 0.95 }, 0.14 * Hh, 0.14 * Hh);
    };
    arms = [hang('L', 'arm'), hang('R', 'arm')];
    legs = [hang('L', 'leg'), hang('R', 'leg')];
    if (paths.length) {
      const low = tips.slice(0, Math.min(2, tips.length));
      const jL = low.length === 2 ? common(low[0].p, low[1].p) - 1 : Math.max(0, Math.floor(low[0].p.length * 0.75));
      const mk = (t) => ({ ...limbFrom(t.p, jL, 0.08), mx: t.x });
      if (low.length === 2) { legs = low.map(mk).sort((a, b) => a.mx - b.mx); pelvisPt = xy(low[0].p[jL], w); }
      else {
        const l = mk(low[0]);
        legs = [{ ...l, tip: { x: l.tip.x - 0.03 * Hh, y: l.tip.y }, mid: { x: l.mid.x - 0.02 * Hh, y: l.mid.y } },
          { ...l, tip: { x: l.tip.x + 0.03 * Hh, y: l.tip.y }, mid: { x: l.mid.x + 0.02 * Hh, y: l.mid.y } }];
        pelvisPt = xy(low[0].p[jL], w);
      }
      const restTips = tips.slice(low.length);
      if (restTips.length >= 2) arms = restTips.slice(0, 2).map((t) => ({ ...limbFrom(t.p, Math.max(0, common(restTips[0].p, restTips[1].p) - 1), 0.1), mx: t.x })).sort((a, b) => a.mx - b.mx);
      else if (restTips.length === 1) {
        const a = { ...limbFrom(restTips[0].p, Math.min(restTips[0].p.length - 2, Math.max(0, Math.floor(restTips[0].p.length * 0.15))), 0.1), mx: restTips[0].x };
        arms[a.tip.x < neckPt.x ? 0 : 1] = a;
      }
    }
  }

  const J = {
    HEAD: { x: head.x, y: head.y }, NECK: neckPt, PELVIS: pelvisPt,
    LEFT_SHOULDER: arms[0].top, LEFT_ELBOW: arms[0].mid, LEFT_WRIST: arms[0].tip,
    RIGHT_SHOULDER: arms[1].top, RIGHT_ELBOW: arms[1].mid, RIGHT_WRIST: arms[1].tip,
    LEFT_HIP: legs[0].top, LEFT_KNEE: legs[0].mid, LEFT_ANKLE: legs[0].tip,
    RIGHT_HIP: legs[1].top, RIGHT_KNEE: legs[1].mid, RIGHT_ANKLE: legs[1].tip,
  };
  if (dist(J.NECK, J.PELVIS) < 0.08 * Hh) warnings.push('Torso looks very short — check neck and pelvis.');
  return { J, cost, warnings, confidence, method: choice ? 'skeleton' : 'partial', skeleton: pts };
}

/**
 * @param {Uint8Array} mask  1 = ink
 * @returns {{joints, headRadius, bbox, strokeWidth, warnings, method, headMethod, confidence, skeleton}}
 */
export function analyzeMask(mask, w, h) {
  const bbox0 = bboxOf(mask, w, h);
  if (!bbox0) return { joints: null, warnings: ['The canvas is empty.'], empty: true };

  // stroke width + gap closing
  const skel0 = thin(mask, w, h);
  const dt0 = distanceTransform(mask, w, h);
  const widths = [];
  for (let i = 0; i < w * h; i++) if (skel0[i]) widths.push(dt0[i]);
  widths.sort((a, b) => a - b);
  const sw = Math.max(2, 2 * (widths[(widths.length / 2) | 0] || 1));
  const bbox0h = bbox0.maxy - bbox0.miny + 1;
  const rc = Math.max(2, Math.min(6, Math.round(Math.max(0.45 * sw, 0.008 * bbox0h)) + 1));
  const closed = closeMask(mask, w, h, rc);
  const bbox = bboxOf(closed, w, h);
  const Hh = bbox.maxy - bbox.miny + 1;
  // tiny enclosed bits (ties, buckles) are not structure
  const ink = fillSmallHoles(closed, w, h, Math.PI * Math.pow(0.028 * Hh, 2));
  const skelAll = thin(ink, w, h);
  const skelPts = [];
  for (let i = 0; i < w * h; i++) if (skelAll[i]) skelPts.push(i);
  const ctx = { w, h, ink, skelPts, sw, rc, Hh, bbox };

  // head candidates, best few
  const scored = scoreHeads(ink, w, h, bbox, sw, rc).slice(0, 4);
  const tried = [];
  for (const head of scored) {
    const r = analyzeWithHead(ctx, head);
    if (r.fail) continue;
    tried.push({ head, r, total: r.cost - 0.7 * head.score });
  }
  if (!tried.length) {
    const head = guessHead(ink, w, h, bbox);
    const r = analyzeWithHead(ctx, head);
    if (r.fail) {
      const warnings = ['Could not read the figure — joints were placed from a template. Drag them into place.'];
      return finish(templateRig(bbox, head), head, bbox, sw, warnings, 'template', [], w, 0.1);
    }
    r.warnings.unshift('Could not find a head. Draw a closed circle for best results, or drag the head into place.');
    return finish(r.J, head, bbox, sw, r.warnings, r.method, r.skeleton, w, r.confidence * 0.5);
  }
  tried.sort((a, b) => a.total - b.total);
  const { head, r } = tried[0];
  const warnings = [...r.warnings];
  if (head.method === 'blob') warnings.push('Head looked like a filled blob — check its position.');
  return finish(r.J, head, bbox, sw, warnings, r.method, r.skeleton, w, r.confidence);
}

function finish(J, head, bbox, sw, warnings, method, skelPts, w, confidence) {
  const joints = {};
  for (const k of Object.keys(J)) joints[k] = round1(J[k]);
  return {
    joints,
    headRadius: Math.round(head.r * 10) / 10,
    bbox,
    strokeWidth: Math.round(sw * 10) / 10,
    warnings,
    method,
    headMethod: head.method,
    confidence: Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100,
    skeleton: skelPts.filter((_, i) => i % 2 === 0).map((i) => [i % w, (i / w) | 0]),
  };
}

// Debug helper for tests/tools: head candidates with their scores.
export function _debugHead(mask, w, h) {
  const bb = bboxOf(mask, w, h);
  const skel0 = thin(mask, w, h);
  const dt0 = distanceTransform(mask, w, h);
  const widths = [];
  for (let i = 0; i < w * h; i++) if (skel0[i]) widths.push(dt0[i]);
  widths.sort((a, b) => a - b);
  const sw = Math.max(2, 2 * (widths[(widths.length / 2) | 0] || 1));
  const bb0h = bb.maxy - bb.miny + 1;
  const rc = Math.max(2, Math.min(6, Math.round(Math.max(0.45 * sw, 0.008 * bb0h)) + 1));
  const ink = closeMask(mask, w, h, rc);
  const bbox = bboxOf(ink, w, h);
  const cands = scoreHeads(ink, w, h, bbox, sw, rc);
  return { sw, rc, bbox, cands };
}
export const _internals = { findHoles, dilate, thin, components, distanceTransform };
