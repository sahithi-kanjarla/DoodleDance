import assert from 'node:assert/strict';
import { stepEvents, TRACKS, stepDur } from '../src/lib/synth.js';
import { targetPosition } from '../src/lib/music.js';
import { emotePose, applyEmote, EMOTE_INFO, angDiff } from '../src/lib/emotes.js';
import { parseYouTubeId } from '../src/lib/net.js';
import { arrayToAngles, anglesToArray } from '../src/lib/partyScene.js';
import { THEMES } from '../src/lib/themes.js';
import { THEMES as THEME_IDS, TRACK_IDS, EMOTES } from '../shared/constants.js';
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ok  ', n); } catch (e) { fail++; console.log('  FAIL', n, '\n      ', e.message); } };
console.log('party lib tests');
t('every track id has a track, every track plays something each bar', () => {
  for (const id of TRACK_IDS) { assert.ok(TRACKS[id]); let c = 0; for (let n = 0; n < 16; n++) c += stepEvents(id, n).length; assert.ok(c > 8, id); }
});
t('stepEvents is deterministic and loops every 4 bars for drums', () => {
  for (const id of TRACK_IDS) for (let n = 0; n < 64; n++) { assert.deepEqual(stepEvents(id, n), stepEvents(id, n)); assert.deepEqual(stepEvents(id, n).filter((e) => e.type === 'kick'), stepEvents(id, n + 64).filter((e) => e.type === 'kick')); }
});
t('late joiner at pos P hears the same step as someone who started at 0', () => {
  const id = 'disco', sd = stepDur(id), pos = 37.3, n = Math.ceil(pos / sd); assert.ok(n * sd >= pos && (n - 1) * sd < pos);
});
t('targetPosition math', () => {
  assert.equal(targetPosition({ playing: false, pos: 12, ts: 1000 }, 99999), 12);
  assert.equal(targetPosition({ playing: true, pos: 12, ts: 1000 }, 3500), 14.5);
  assert.equal(targetPosition({ playing: true, pos: 0, ts: 5000 }, 4000), 0);
  assert.equal(targetPosition(null, 1), 0);
});
t('every emote is defined, bounded in time, and only touches known keys', () => {
  const keys = new Set(['torso', 'head', 'uaL', 'laL', 'uaR', 'laR', 'ulL', 'llL', 'ulR', 'llR']);
  for (const k of EMOTES) {
    assert.ok(EMOTE_INFO[k]); assert.equal(emotePose(k, -0.1), null); assert.equal(emotePose(k, EMOTE_INFO[k].dur + 0.1), null);
    for (let x = 0.05; x < EMOTE_INFO[k].dur; x += 0.07) { const e = emotePose(k, x); for (const [a, v] of Object.entries(e.a)) { assert.ok(keys.has(a), k + a); assert.ok(Number.isFinite(v)); } assert.ok(e.k >= 0 && e.k <= 1); }
  }
});
t('emotes keep the unaffected limbs of the live pose', () => {
  const base = { uaL: 1, laL: 1, ulL: 1.5, dy: 0 }; const out = applyEmote(base, emotePose('wave', 1)); assert.equal(out.ulL, 1.5); assert.notEqual(out.uaR, undefined);
});
t('angDiff wraps', () => { assert.ok(Math.abs(angDiff(3.1, -3.1) - 0.083) < 0.01); });
t('YouTube link parsing', () => {
  const id = 'dQw4w9WgXcQ';
  for (const u of [`https://www.youtube.com/watch?v=${id}&t=3`, `https://youtu.be/${id}?si=x`, `youtube.com/shorts/${id}`, `https://m.youtube.com/embed/${id}`, id, `https://music.youtube.com/watch?v=${id}`]) assert.equal(parseYouTubeId(u), id, u);
  for (const u of ['', 'hello', 'https://vimeo.com/123', 'https://evil.com/watch?v=dQw4w9WgXcQ']) assert.equal(parseYouTubeId(u), null, u);
});
t('pose array round-trip keeps nulls', () => {
  const a = anglesToArray({ torso: -1.5, uaL: 2 }); assert.equal(a.length, 10); assert.deepEqual(arrayToAngles(a), { torso: -1.5, uaL: 2 });
});
t('all 10 themes exist with a draw function', () => { for (const id of THEME_IDS) assert.equal(typeof THEMES[id]?.draw, 'function', id); });
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
