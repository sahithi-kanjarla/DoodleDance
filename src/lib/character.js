// Turns a saved drawing + rig into a renderable character and draws it posed.

import { buildPieces } from './binding.js';
import { solve, restAngles, torsoLength } from './retarget.js';
import { DRAW_ORDER } from './skeleton.js';

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function pieceCanvas(p) {
  const c = document.createElement('canvas');
  c.width = p.w; c.height = p.h;
  c.getContext('2d').putImageData(new ImageData(p.data, p.w, p.h), 0, 0);
  return { x: p.x, y: p.y, canvas: c };
}

/** saved = {id, name, artwork (png data URL), rig, size:{w,h}} */
export async function createCharacter(saved) {
  const img = await loadImage(saved.artwork);
  const { w, h } = saved.size;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const { pieces } = buildPieces(rgba, w, h, saved.rig);
  const canvases = {};
  for (const [id, p] of Object.entries(pieces)) canvases[id] = p ? pieceCanvas(p) : null;
  const b = saved.rig.bbox;
  return {
    id: saved.id,
    name: saved.name,
    rig: saved.rig,
    size: { w, h },
    pieces: canvases,
    rest: restAngles(saved.rig),
    torsoLen: torsoLength(saved.rig),
    bbox: b,
    labelOffset: saved.rig.joints.HEAD.y - b.miny + 22,
  };
}

/**
 * place = {x, y, k}: where the pelvis lands on the stage, and pixels-per-unit.
 * angles: see retarget.solve (+ optional scale/dx/dy from the webcam).
 */
export function drawCharacter(ctx, ch, angles, place, opts = {}) {
  const T = solve(ch.rig, ch.rest, angles);
  const P = ch.rig.joints.PELVIS;
  const s = (angles?.scale ?? 1) * place.k;
  const ox = (angles?.dx ?? 0) * ch.torsoLen * place.k;
  const oy = (angles?.dy ?? 0) * ch.torsoLen * place.k;
  const ax = place.x + ox, ay = place.y + oy;

  ctx.save();
  ctx.translate(ax, ay);
  ctx.scale(s, s);
  ctx.translate(-P.x, -P.y);
  for (const id of DRAW_ORDER) {
    const piece = ch.pieces[id];
    if (!piece) continue;
    const t = T[id];
    ctx.save();
    ctx.translate(t.cur.x, t.cur.y);
    ctx.rotate(t.rot);
    ctx.translate(-t.pivot.x, -t.pivot.y);
    if (opts.outline) {
      if (!piece.outline) piece.outline = makeOutline(piece.canvas, 4);
      ctx.drawImage(piece.outline, piece.x - 4, piece.y - 4);
    }
    ctx.drawImage(piece.canvas, piece.x, piece.y);
    ctx.restore();
  }
  ctx.restore();

  // name tag follows the head
  if (opts.label !== false && ch.name) {
    const up = { x: Math.sin(T.headRot), y: -Math.cos(T.headRot) };
    const hx = ax + (T.headCur.x - P.x) * s + up.x * ch.labelOffset * s;
    const hy = ay + (T.headCur.y - P.y) * s + up.y * ch.labelOffset * s;
    drawTag(ctx, ch.name, hx, hy);
  }
  return { x: ax, y: ay, s };
}

/** White "sticker" halo around a piece so dark lines stay readable on dark stages. */
function makeOutline(src, r) {
  const c = document.createElement('canvas');
  c.width = src.width + r * 2; c.height = src.height + r * 2;
  const g = c.getContext('2d');
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.drawImage(src, r + Math.cos(a) * r, r + Math.sin(a) * r); }
  g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  return c;
}

function drawTag(ctx, text, x, y) {
  ctx.save();
  ctx.font = '700 15px Fredoka, Inter, system-ui, sans-serif';
  const w = ctx.measureText(text).width + 24, h = 28;
  const rx = x - w / 2, ry = y - h;
  ctx.fillStyle = '#1b1b2f';
  ctx.beginPath(); ctx.roundRect(rx + 3, ry + 3, w, h, 10); ctx.fill();       // hard shadow
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b1b2f'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(rx, ry, w, h, 10); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1b1b2f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, ry + h / 2 + 1);
  ctx.restore();
}

// Self-test poses: each moves ONE limb group so left/right independence is visible.
export const DEMOS = [
  { id: 'rest', label: 'Rest pose' },
  { id: 'left-arm', label: 'Left arm only' },
  { id: 'right-arm', label: 'Right arm only' },
  { id: 'left-leg', label: 'Left leg only' },
  { id: 'right-leg', label: 'Right leg only' },
  { id: 'dance', label: 'Dance' },
];

export function demoAngles(kind, t) {
  const U = -Math.PI / 2, D = Math.PI / 2;
  const s = Math.sin;
  switch (kind) {
    case 'left-arm': return { uaL: U - 0.45, laL: U - 0.45 + 0.8 * s(t * 6) };
    case 'right-arm': return { uaR: U + 0.45, laR: U + 0.45 - 0.8 * s(t * 6) };
    case 'left-leg': { const a = D + 0.55 * (0.5 + 0.5 * s(t * 4)); return { ulL: a, llL: a + 0.45 }; }
    case 'right-leg': { const a = D - 0.55 * (0.5 + 0.5 * s(t * 4)); return { ulR: a, llR: a - 0.45 }; }
    case 'dance': {
      const a = 0.5 + 0.5 * s(t * 5), b = 0.5 + 0.5 * s(t * 5 + Math.PI);
      return {
        torso: U + 0.12 * s(t * 2.5), head: 0.18 * s(t * 2.5 + 1),
        uaL: U - 0.5 - 0.5 * a, laL: U - 0.5 - 0.5 * a + 0.5 * s(t * 10),
        uaR: U + 0.5 + 0.5 * b, laR: U + 0.5 + 0.5 * b - 0.5 * s(t * 10),
        ulL: D + 0.3 * a, llL: D + 0.3 * a + 0.3 * a,
        ulR: D - 0.3 * b, llR: D - 0.3 * b - 0.3 * b,
      };
    }
    default: return {};
  }
}
