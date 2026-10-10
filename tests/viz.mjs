// Contact sheet: ink in grey, TRUTH joints green, DETECTED joints red (blue/orange = L/R).
// node tests/viz.mjs out.png seed1 seed2 ...
import fs from 'node:fs';
import zlib from 'node:zlib';
import { analyzeMask } from '../src/lib/rig.js';
import { makeFigure, W, H } from './corpus.mjs';
import { scoreFigure } from './eval.mjs';

function crcTable() { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; }
const CT = crcTable();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = CT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
export function writePNG(path, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const [out, ...seeds] = process.argv.slice(2);
const S = 0.5, cw = W * S, ch = H * S;
const cols = Math.min(4, seeds.length), rows = Math.ceil(seeds.length / cols);
const SW = cols * cw, SH = rows * ch;
const img = Buffer.alloc(SW * SH * 3, 255);
const put = (x, y, c) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= SW || y >= SH) return; const o = (y * SW + x) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; };
const dot = (cx, cy, r, c) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) put(cx + x, cy + y, c); };
const ring = (cx, cy, rad, c) => { for (let a = 0; a < 6.3; a += 0.03) put(cx + rad * Math.cos(a), cy + rad * Math.sin(a), c); };

seeds.forEach((sd, idx) => {
  const fig = makeFigure(+sd), res = analyzeMask(fig.m, W, H), fails = scoreFigure(fig, res);
  const ox = (idx % cols) * cw, oy = Math.floor(idx / cols) * ch;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    if (fig.m[(y * 2) * W + x * 2]) put(ox + x, oy + y, [170, 170, 180]);
    if (x === 0 || y === 0) put(ox + x, oy + y, [220, 220, 230]);
  }
  if (res.skeleton) for (const [x, y] of res.skeleton) put(ox + x * S, oy + y * S, [255, 190, 0]);
  for (const [n, p] of Object.entries(fig.truth)) dot(ox + p.x * S, oy + p.y * S, 4, [20, 170, 80]);
  ring(ox + fig.truth.HEAD.x * S, oy + fig.truth.HEAD.y * S, fig.headR * S, [20, 170, 80]);
  if (res.joints) {
    for (const [n, p] of Object.entries(res.joints)) dot(ox + p.x * S, oy + p.y * S, 3, n.startsWith('LEFT') ? [40, 110, 255] : n.startsWith('RIGHT') ? [255, 120, 0] : [200, 30, 200]);
    ring(ox + res.joints.HEAD.x * S, oy + res.joints.HEAD.y * S, res.headRadius * S, [220, 30, 60]);
  }
  console.log(`#${idx + 1} seed ${sd} [${res.method}/${res.headMethod}] ${fails.join(',') || 'OK'}  | ${fig.tags.join(' ')}`);
});
writePNG(out, SW, SH, img);
