// Integration test: real server, real sockets. node tests/server.test.mjs
import assert from 'node:assert/strict';
import { createPartyServer, bestSpot } from '../server/server.js';

const app = createPartyServer({});
const port = await app.listen(0, '127.0.0.1');
const base = `127.0.0.1:${port}`;
let pass = 0, fail = 0;
const test = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', e.message); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const J = {}; for (const k of ['HEAD','NECK','PELVIS','LEFT_SHOULDER','LEFT_ELBOW','LEFT_WRIST','RIGHT_SHOULDER','RIGHT_ELBOW','RIGHT_WRIST','LEFT_HIP','LEFT_KNEE','LEFT_ANKLE','RIGHT_HIP','RIGHT_KNEE','RIGHT_ANKLE']) J[k] = { x: 100, y: 100 };
const user = (name) => ({ name, character: { artwork: PNG, size: { w: 640, h: 640 }, name, rig: { joints: J, headRadius: 30, strokeWidth: 7, bbox: { minx: 0, miny: 0, maxx: 600, maxy: 600 } } } });

class Client {
  constructor() { this.q = []; this.waiters = []; this.ws = new WebSocket(`ws://${base}/ws`); this.closed = false;
    this.ws.onmessage = (e) => { const m = JSON.parse(e.data); const i = this.waiters.findIndex((w) => w.t === m.t); if (i >= 0) this.waiters.splice(i, 1)[0].res(m); else this.q.push(m); };
    this.ws.onclose = () => { this.closed = true; };
    this.open = new Promise((r) => (this.ws.onopen = r)); }
  async send(o) { await this.open; this.ws.send(JSON.stringify(o)); }
  next(t, ms = 1500) { const i = this.q.findIndex((m) => m.t === t); if (i >= 0) return Promise.resolve(this.q.splice(i, 1)[0]);
    return new Promise((res, rej) => { const w = { t, res }; this.waiters.push(w); setTimeout(() => { const k = this.waiters.indexOf(w); if (k >= 0) { this.waiters.splice(k, 1); rej(new Error('timeout waiting for ' + t)); } }, ms); }); }
  async nextWhere(t, f, ms = 1500) { const end = Date.now() + ms; for (;;) { const m = await this.next(t, Math.max(50, end - Date.now())); if (f(m)) return m; } }
  has(t) { return this.q.some((m) => m.t === t); }
}
const host = async (name = 'Host') => { const c = new Client(); await c.send({ t: 'create', name: 'Test Party', user: user(name) }); c.w = await c.next('welcome'); return c; };
const guest = async (code, name = 'Guest') => { const c = new Client(); await c.send({ t: 'join', code, user: user(name) }); c.w = await c.next('welcome'); return c; };

console.log('server tests');
const h = await host();
const code = h.w.code;
await test('create gives code, host flag, defaults', () => {
  assert.match(code, /^[A-Z2-9]{6}$/); assert.equal(h.w.you.isHost, true);
  assert.equal(h.w.room.theme, 'neon'); assert.equal(h.w.participants.length, 1); assert.ok(h.w.you.token);
});
const g1 = await guest(code.toLowerCase(), 'Ann');
await test('join (case-insensitive) + others told', async () => {
  assert.equal(g1.w.you.isHost, false); assert.equal(g1.w.participants.length, 2);
  const j = await h.next('joined'); assert.equal(j.participant.name, 'Ann'); assert.ok(j.participant.character.artwork);
});
const g2 = await guest(code, 'Bob'); await h.next('joined'); await g1.next('joined');
await test('spawn positions are distinct', () => {
  const ps = g2.w.participants; for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert.ok(Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y) > 0.05);
});
await test('/api/party', async () => {
  const r = await fetch(`http://${base}/api/party?code=${code}`); const b = await r.json(); assert.equal(b.players, 3);
  assert.equal((await fetch(`http://${base}/api/party?code=ZZZZZZ`)).status, 404);
});
await test('no such party / bad character / bad json', async () => {
  const c = new Client(); await c.send({ t: 'join', code: 'NOPE22', user: user('x') }); assert.equal((await c.next('error')).error, 'no-such-party');
  const d = new Client(); await d.send({ t: 'join', code, user: { name: 'x', character: { artwork: 'http://evil' } } }); assert.equal((await d.next('error')).error, 'bad-character');
  d.ws.send('{nope'); assert.equal((await d.next('error')).error, 'bad-json');
});
await test('pose goes to others, not sender; sanitised', async () => {
  const a = [0, 0.1, 1, 2, 3, 4, 5, 6, 7, 8];
  await g1.send({ t: 'pose', a, s: 99, dx: 0.5, dy: -9 });
  const p = await h.next('pose'); assert.equal(p.id, g1.w.you.id); assert.deepEqual(p.a, a); assert.equal(p.s, 2.5); assert.equal(p.dy, -3);
  await g2.next('pose'); await sleep(50); assert.ok(!g1.has('pose'));
  await g1.send({ t: 'pose', a: [1, 2] }); await sleep(80); assert.ok(!h.has('pose'));
});
await test('pose rate limit', async () => {
  const a = Array(10).fill(0); for (let i = 0; i < 300; i++) await g2.send({ t: 'pose', a });
  await sleep(300); let n = 0; while (h.has('pose')) { await h.next('pose'); n++; } assert.ok(n < 200 && n > 20, 'received ' + n);
});
await test('host-only is enforced', async () => {
  for (const msg of [{ t: 'admin', patch: { theme: 'space' } }, { t: 'phase', value: 'live' }, { t: 'music', action: 'play' }, { t: 'kick', id: g2.w.you.id }, { t: 'move', id: g2.w.you.id, x: .5, y: .5 }]) {
    await g1.send(msg); assert.equal((await g1.next('error')).error, 'host-only');
  }
  assert.ok(!g2.closed);
});
await test('admin settings broadcast + validation', async () => {
  await h.send({ t: 'admin', patch: { theme: 'space', lighting: 'bogus', name: 'New <b>Name', effects: { confetti: true, disco: 'yes' } } });
  const s = await g1.next('settings'); assert.equal(s.settings.theme, 'space'); assert.equal(s.settings.lighting, 'purple');
  assert.equal(s.settings.name, 'New bName'); assert.equal(s.settings.effects.confetti, true); assert.equal(s.settings.effects.disco, false);
  await h.next('settings'); await g2.next('settings');
});
await test('phase live has countdown timestamp', async () => {
  await h.send({ t: 'phase', value: 'live' }); const p = await g1.next('phase'); assert.equal(p.phase, 'live'); assert.ok(p.at - p.serverNow >= 2900);
  await h.send({ t: 'phase', value: 'lobby' }); assert.equal((await g1.next('phase')).phase, 'lobby');
});
await test('music: set/pause/play/seek/next position maths', async () => {
  await h.send({ t: 'music', action: 'set', source: { kind: 'synth', id: 'chill' } });
  let m = await g1.next('music'); assert.equal(m.music.playing, true); assert.equal(m.music.source.id, 'chill'); assert.ok(m.music.pos < 0.2);
  await sleep(400); await h.send({ t: 'music', action: 'pause' }); m = await g1.next('music');
  assert.equal(m.music.playing, false); assert.ok(m.music.pos > 0.35 && m.music.pos < 0.9, 'pos ' + m.music.pos);
  const frozen = m.music.pos; await sleep(200);
  const late = await guest(code, 'Late'); await h.next('joined');
  assert.equal(late.w.room.music.playing, false); assert.ok(Math.abs(late.w.room.music.pos - frozen) < 0.01);
  await h.send({ t: 'music', action: 'seek', pos: 42 }); m = await g1.next('music'); assert.equal(m.music.pos, 42);
  await h.send({ t: 'music', action: 'play' }); await g1.next('music'); await sleep(300);
  const late2 = await guest(code, 'Late2'); assert.ok(late2.w.room.music.playing && late2.w.room.music.pos > 42.25 && late2.w.room.music.pos < 43, 'late join pos ' + late2.w.room.music.pos);
  await h.send({ t: 'music', action: 'next' }); m = await g1.next('music'); assert.equal(m.music.source.id, 'spooky');
  await h.send({ t: 'music', action: 'prev' }); m = await g1.next('music'); assert.equal(m.music.source.id, 'chill');
  await h.send({ t: 'music', action: 'set', source: { kind: 'youtube', videoId: 'dQw4w9WgXcQ', title: 'yt' } }); m = await g1.next('music'); assert.equal(m.music.source.videoId, 'dQw4w9WgXcQ');
  await h.send({ t: 'music', action: 'set', source: { kind: 'youtube', videoId: 'short' } }); assert.equal((await h.next('error')).error, 'bad-source');
  await h.send({ t: 'music', action: 'set', source: { kind: 'file', url: '/media/ABCDEF/00000000' } }); assert.equal((await h.next('error')).error, 'bad-source');
  late.ws.close(); late2.ws.close();
});
await test('upload (host only, audio only) + Range streaming + set as source', async () => {
  const bytes = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 251));
  const q = `code=${code}&id=${h.w.you.id}&token=${h.w.you.token}`;
  let r = await fetch(`http://${base}/api/upload?${q}`, { method: 'POST', headers: { 'content-type': 'audio/mpeg', 'x-title': encodeURIComponent('My Song ♪') }, body: bytes });
  assert.equal(r.status, 200); const up = await r.json(); assert.equal(up.title, 'My Song ♪'); assert.match(up.url, /^\/media\/[A-Z0-9]{6}\/[a-f0-9]{8}$/);
  r = await fetch(`http://${base}${up.url}`); assert.equal(r.status, 200); assert.equal(Buffer.from(await r.arrayBuffer()).compare(bytes), 0);
  r = await fetch(`http://${base}${up.url}`, { headers: { range: 'bytes=100-199' } }); assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), 'bytes 100-199/5000'); assert.equal(Buffer.from(await r.arrayBuffer()).compare(bytes.subarray(100, 200)), 0);
  r = await fetch(`http://${base}${up.url}`, { headers: { range: 'bytes=-50' } }); assert.equal(r.headers.get('content-range'), 'bytes 4950-4999/5000');
  r = await fetch(`http://${base}${up.url}`, { headers: { range: 'bytes=4900-' } }); assert.equal(r.headers.get('content-range'), 'bytes 4900-4999/5000');
  const gq = `code=${code}&id=${g1.w.you.id}&token=${g1.w.you.token}`;
  assert.equal((await fetch(`http://${base}/api/upload?${gq}`, { method: 'POST', headers: { 'content-type': 'audio/mpeg' }, body: bytes })).status, 403);
  assert.equal((await fetch(`http://${base}/api/upload?${q}`, { method: 'POST', headers: { 'content-type': 'text/html' }, body: bytes })).status, 415);
  await h.send({ t: 'music', action: 'set', source: { kind: 'file', url: up.url, title: up.title } });
  const m = await g1.next('music'); assert.equal(m.music.source.kind, 'file');
});
await test('move clamps to floor', async () => {
  await h.send({ t: 'move', id: g1.w.you.id, x: 5, y: -2 }); const m = await g2.next('move'); assert.equal(m.x, 0.93); assert.equal(m.y, 0.5);
});
await test('emotes broadcast, rate-limited, validated', async () => {
  await g1.send({ t: 'emote', kind: 'clap' }); const e = await h.next('emote'); assert.equal(e.kind, 'clap'); assert.equal(e.id, g1.w.you.id);
  await g1.send({ t: 'emote', kind: 'wave' }); await g1.send({ t: 'emote', kind: 'bogus' }); await sleep(100);
  assert.ok(!h.has('emote'));
});
await test('reconnect with rejoin keeps identity; bad token refused', async () => {
  const id = g2.w.you.id, token = g2.w.you.token; g2.ws.close();
  await h.nextWhere('presence', (m) => m.id === id && m.connected === false);
  const c = new Client(); await c.send({ t: 'rejoin', code, id, token }); const w = await c.next('welcome'); assert.equal(w.you.id, id);
  await h.nextWhere('presence', (m) => m.id === id && m.connected === true);
  const bad = new Client(); await bad.send({ t: 'rejoin', code, id, token: 'nope' }); assert.equal((await bad.next('error')).error, 'rejoin-failed');
  c.ws.close();
});
await test('kick removes and notifies', async () => {
  const k = await guest(code, 'Kickme'); await h.next('joined');
  await h.send({ t: 'kick', id: k.w.you.id }); await k.next('kicked'); const l = await g1.next('left'); assert.ok(l.id);
  while (l.reason !== 'kicked') break;
});
await test('host leaves -> host promoted', async () => {
  const hh = await host('H2'); const c = hh.w.code; const a = await guest(c, 'A'); await hh.next('joined');
  await hh.send({ t: 'leave' }); const msg = await a.next('host'); assert.equal(msg.id, a.w.you.id);
  await a.send({ t: 'admin', patch: { theme: 'cozy' } }); assert.equal((await a.next('settings')).settings.theme, 'cozy');
  a.ws.close();
});
await test('party full at 12', async () => {
  const hh = await host('F'); const c = hh.w.code; const gs = [];
  for (let i = 0; i < 11; i++) gs.push(await guest(c, 'g' + i));
  const x = new Client(); await x.send({ t: 'join', code: c, user: user('over') }); assert.equal((await x.next('error')).error, 'party-full');
  [hh, ...gs].forEach((q) => q.ws.close());
});
await test('ping/pong echoes counter with server time', async () => {
  await h.send({ t: 'ping', c: 7 }); const p = await h.next('pong'); assert.equal(p.c, 7); assert.ok(Math.abs(p.s - Date.now()) < 1000);
});
await test('bestSpot spreads out', () => {
  const taken = []; for (let i = 0; i < 12; i++) { const s = bestSpot(taken); assert.ok(!taken.some((t) => t.x === s.x && t.y === s.y)); taken.push(s); }
});

console.log(`\n${pass} passed, ${fail} failed`);
await app.close();
process.exit(fail ? 1 : 0);
