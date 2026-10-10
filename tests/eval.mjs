// Scores analyzeMask() against ground truth on N random messy figures.
// node tests/eval.mjs [count=300] [--verbose] [--seed0=1]
import { analyzeMask } from '../src/lib/rig.js';
import { makeFigure, W, H } from './corpus.mjs';

const args = process.argv.slice(2);
const N = +(args.find((a) => /^\d+$/.test(a)) || 300);
const verbose = args.includes('--verbose');
const seed0 = +((args.find((a) => a.startsWith('--seed0=')) || '--seed0=1').split('=')[1]);

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function distToPoly(p, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

export function scoreFigure(fig, res) {
  const T = fig.truth;
  const fails = [];
  if (!res.joints) return ['no-result'];
  const J = res.joints;
  let ys = [], xs = [];
  for (let i = 0; i < W * H; i++) if (fig.m[i]) { ys.push((i / W) | 0); xs.push(i % W); }
  const hgt = Math.max(...ys) - Math.min(...ys);
  const tipTol = 0.075 * hgt;
  if (dist(J.HEAD, T.HEAD) > Math.max(0.6 * fig.headR, 12)) fails.push('head-pos');
  if (Math.abs(res.headRadius - fig.headR) > 0.45 * fig.headR + 6) fails.push('head-size');
  for (const s of ['LEFT', 'RIGHT']) {
    for (const [j, nm] of [['WRIST', 'wrist'], ['ANKLE', 'ankle']]) {
      const d = dist(J[`${s}_${j}`], T[`${s}_${j}`]);
      if (d > tipTol) fails.push(`${s[0]}-${nm}${dist(J[`${s}_${j}`], T[`${(s === 'LEFT' ? 'RIGHT' : 'LEFT')}_${j}`]) <= tipTol ? '-SWAPPED' : ''}`);
    }
  }
  // elbows/knees: must lie on the true limb polyline (straight limbs have no defined bend)
  for (const s of ['LEFT', 'RIGHT']) {
    const arm = [T[`${s}_SHOULDER`], T[`${s}_ELBOW`], T[`${s}_WRIST`]];
    const leg = [T[`${s}_HIP`], T[`${s}_KNEE`], T[`${s}_ANKLE`]];
    if (distToPoly(J[`${s}_ELBOW`], arm) > 0.05 * hgt) fails.push(`${s[0]}-elbow-off`);
    if (distToPoly(J[`${s}_KNEE`], leg) > 0.05 * hgt) fails.push(`${s[0]}-knee-off`);
  }
  if (dist(J.PELVIS, T.PELVIS) > 0.09 * hgt) fails.push('pelvis');
  if (dist(J.NECK, T.NECK) > 0.1 * hgt) fails.push('neck');
  return fails;
}

if (process.argv[1].endsWith('eval.mjs')) {
  const tally = {}, byTag = {}, failedFigs = [];
  let ok = 0, tpl = 0, ms = 0;
  for (let i = 0; i < N; i++) {
    const seed = seed0 + i;
    const fig = makeFigure(seed);
    const t0 = performance.now();
    const res = analyzeMask(fig.m, W, H);
    ms += performance.now() - t0;
    if (res.method === 'template') tpl++;
    const fails = scoreFigure(fig, res);
    for (const t of fig.tags) { byTag[t] ||= { n: 0, f: 0 }; byTag[t].n++; if (fails.length) byTag[t].f++; }
    if (!fails.length) ok++;
    else { failedFigs.push({ seed, fails, tags: fig.tags, method: res.method }); fails.forEach((f) => (tally[f] = (tally[f] || 0) + 1)); }
  }
  console.log(`\nfigures: ${N}   fully correct: ${ok} (${((100 * ok) / N).toFixed(1)}%)   template fallbacks: ${tpl}   avg ${(ms / N).toFixed(0)} ms`);
  console.log('\nfailure types:');
  Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(18)} ${v}`));
  console.log('\nfail rate by feature (worst first):');
  Object.entries(byTag).filter(([, v]) => v.n >= 8).sort((a, b) => b[1].f / b[1].n - a[1].f / a[1].n).slice(0, 14)
    .forEach(([k, v]) => console.log(`  ${k.padEnd(18)} ${String(v.f).padStart(3)}/${String(v.n).padEnd(3)} ${((100 * v.f) / v.n).toFixed(0)}%`));
  if (verbose) { console.log('\nfailed seeds:'); failedFigs.slice(0, 40).forEach((f) => console.log(`  seed ${f.seed} [${f.method}] ${f.fails.join(',')}  | ${f.tags.join(' ')}`)); }
  process.exit(0);
}
