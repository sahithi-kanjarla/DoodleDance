// DoodleDance realtime server. Zero dependencies (Node >= 20).
//   node server/server.js            -> http + websocket on :8787 (serves dist/ if built)
// Protocol: JSON text frames over /ws. See README "Protocol".
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { attachWebSocket } from './ws.js';
import { THEMES, LIGHTINGS, EFFECTS, TRACK_IDS, EMOTES, MAX_PARTICIPANTS, POSE_KEYS, JOINTS, FLOOR } from '../shared/constants.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_UPLOAD = 15 * 1024 * 1024;
const MAX_ROOM_MEDIA = 40 * 1024 * 1024;
const MAX_ROOMS = 200;
const GRACE_MS = 45_000;
const EMPTY_ROOM_MS = 10 * 60_000;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

const rid = (n = 8) => crypto.randomBytes(n).toString('hex').slice(0, n);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '');

/** Best free spot on the floor: maximise the distance to everyone already there. */
export function bestSpot(taken) {
  let best = { x: 0.5, y: 0.7 }, bestD = -1;
  for (let y = 0.58; y <= 0.9; y += 0.08) {
    for (let x = 0.1; x <= 0.9; x += 0.06) {
      let d = 9;
      for (const t of taken) d = Math.min(d, Math.hypot((x - t.x) * 1.6, (y - t.y) * 2.4));
      d -= Math.abs(x - 0.5) * 0.02;                       // tiny pull toward the middle
      if (d > bestD) { bestD = d; best = { x: +x.toFixed(3), y: +y.toFixed(3) }; }
    }
  }
  return best;
}

function validCharacter(c) {
  if (!c || typeof c !== 'object') return null;
  const { artwork, rig, size } = c;
  if (typeof artwork !== 'string' || !artwork.startsWith('data:image/png;base64,') || artwork.length > 900_000) return null;
  if (!size || !(size.w > 0 && size.w <= 1024 && size.h > 0 && size.h <= 1024)) return null;
  if (!rig || typeof rig !== 'object' || !rig.joints || typeof rig.headRadius !== 'number') return null;
  const joints = {};
  for (const j of JOINTS) {
    const p = rig.joints[j];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    joints[j] = { x: p.x, y: p.y };
  }
  const b = rig.bbox || {};
  const bbox = { minx: +b.minx || 0, miny: +b.miny || 0, maxx: +b.maxx || size.w, maxy: +b.maxy || size.h };
  return { artwork, size: { w: size.w | 0, h: size.h | 0 }, name: str(c.name, 16), rig: { joints, headRadius: rig.headRadius, strokeWidth: +rig.strokeWidth || 6, bbox } };
}

function validSource(s) {
  if (!s || typeof s !== 'object') return null;
  const title = str(s.title, 80);
  if (s.kind === 'synth' && TRACK_IDS.includes(s.id)) return { kind: 'synth', id: s.id, title: title || s.id };
  if (s.kind === 'youtube' && /^[\w-]{11}$/.test(s.videoId || '')) return { kind: 'youtube', videoId: s.videoId, title: title || 'YouTube' };
  if (s.kind === 'file' && /^\/media\/[A-Z0-9]{6}\/[a-f0-9]{8}$/.test(s.url || '')) return { kind: 'file', url: s.url, title: title || 'Uploaded track' };
  return null;
}

export function createPartyServer({ distDir } = {}) {
  const rooms = new Map();

  const publicSettings = (r) => ({ name: r.name, theme: r.theme, lighting: r.lighting, effects: r.effects });
  const publicP = (p, withChar) => ({ id: p.id, name: p.name, x: p.x, y: p.y, isHost: p.isHost, connected: p.connected, ...(withChar ? { character: p.character } : {}) });
  const send = (p, msg) => { if (p.ws && !p.ws.closed) p.ws.send(JSON.stringify(msg)); };
  const broadcast = (r, msg, exceptId, skipIfBusy = false) => {
    const text = JSON.stringify(msg);
    for (const p of r.participants.values()) {
      if (p.id === exceptId || !p.ws || p.ws.closed) continue;
      if (skipIfBusy && p.ws.backlog > 512 * 1024) continue;   // slow client: drop pose frames, not state
      p.ws.send(text);
    }
  };
  const musicNow = (r) => (r.music.playing ? r.music.pos + (Date.now() - r.music.ts) / 1000 : r.music.pos);

  function newCode() {
    for (;;) {
      let c = '';
      for (let i = 0; i < 6; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
      if (!rooms.has(c)) return c;
    }
  }
  function addParticipant(r, ws, user, isHost) {
    const character = validCharacter(user?.character);
    if (!character) return { error: 'bad-character' };
    const spot = bestSpot([...r.participants.values()].map((p) => ({ x: p.x, y: p.y })));
    const p = { id: rid(8), token: rid(16), name: str(user?.name, 20) || 'Guest', character, x: spot.x, y: spot.y, isHost, ws, connected: true, drop: null, poseTokens: 60, poseT: Date.now(), emoteAt: 0 };
    r.participants.set(p.id, p);
    if (r.emptyTimer) { clearTimeout(r.emptyTimer); r.emptyTimer = null; }
    return { p };
  }
  function welcome(r, p) {
    send(p, {
      t: 'welcome', code: r.code, serverNow: Date.now(),
      you: { id: p.id, token: p.token, isHost: p.isHost },
      room: { ...publicSettings(r), phase: r.phase, phaseAt: r.phaseAt, music: { ...r.music, pos: musicNow(r), ts: Date.now() } },
      participants: [...r.participants.values()].map((q) => publicP(q, true)),
    });
  }
  function removeParticipant(r, p, reason = 'left') {
    if (!r.participants.has(p.id)) return;
    clearTimeout(p.drop);
    r.participants.delete(p.id);
    broadcast(r, { t: 'left', id: p.id, reason });
    if (p.isHost && r.participants.size) {
      const next = [...r.participants.values()].find((q) => q.connected) || [...r.participants.values()][0];
      next.isHost = true;
      broadcast(r, { t: 'host', id: next.id });
    }
    if (!r.participants.size) r.emptyTimer = setTimeout(() => rooms.delete(r.code), EMPTY_ROOM_MS);
  }

  function onConnection(ws) {
    let room = null, me = null;
    const timer = setInterval(() => { if (!ws.alive) return ws.close(1001); ws.alive = false; ws.ping(); }, 25_000);
    const fail = (error) => ws.send(JSON.stringify({ t: 'error', error }));

    ws.onclose = () => {
      clearInterval(timer);
      if (room && me && me.ws === ws) {
        me.connected = false; me.ws = null;
        broadcast(room, { t: 'presence', id: me.id, connected: false });
        me.drop = setTimeout(() => removeParticipant(room, me, 'timeout'), GRACE_MS);
      }
    };

    ws.onmessage = (text) => {
      let m;
      try { m = JSON.parse(text); } catch { return fail('bad-json'); }
      if (!m || typeof m.t !== 'string') return fail('bad-message');

      if (m.t === 'ping') return ws.send(JSON.stringify({ t: 'pong', c: m.c, s: Date.now() }));

      if (m.t === 'create') {
        if (me) return fail('already-in-room');
        if (rooms.size >= MAX_ROOMS) return fail('server-busy');
        room = { code: newCode(), name: str(m.name, 40) || 'Untitled Party', theme: 'neon', lighting: 'purple', effects: { confetti: false, disco: false, smoke: false, sparkles: true },
          phase: 'lobby', phaseAt: 0, music: { source: null, playing: false, pos: 0, ts: Date.now() }, participants: new Map(), media: new Map(), mediaBytes: 0, emptyTimer: null };
        const r = addParticipant(room, ws, m.user, true);
        if (r.error) { room = null; return fail(r.error); }
        rooms.set(room.code, room); me = r.p; return welcome(room, me);
      }
      if (m.t === 'join' || m.t === 'rejoin') {
        if (me) return fail('already-in-room');
        const r = rooms.get(str(m.code, 6).toUpperCase());
        if (!r) return fail('no-such-party');
        if (m.t === 'rejoin') {
          const p = r.participants.get(m.id);
          if (!p || p.token !== m.token) return fail('rejoin-failed');
          clearTimeout(p.drop); p.ws?.close(); p.ws = ws; p.connected = true; room = r; me = p;
          broadcast(r, { t: 'presence', id: p.id, connected: true }, p.id);
          return welcome(r, p);
        }
        if (r.participants.size >= MAX_PARTICIPANTS) return fail('party-full');
        const res = addParticipant(r, ws, m.user, false);
        if (res.error) return fail(res.error);
        room = r; me = res.p; welcome(r, me);
        return broadcast(r, { t: 'joined', participant: publicP(me, true) }, me.id);
      }
      if (!room || !me) return fail('not-in-room');

      switch (m.t) {
        case 'pose': {
          const now = Date.now();
          me.poseTokens = Math.min(60, me.poseTokens + ((now - me.poseT) / 1000) * 40); me.poseT = now;
          if (me.poseTokens < 1) return;                       // > ~40 poses/s: drop
          me.poseTokens -= 1;
          if (!Array.isArray(m.a) || m.a.length !== POSE_KEYS.length) return;
          const a = m.a.map((v) => (Number.isFinite(v) ? v : null));
          return broadcast(room, { t: 'pose', id: me.id, a, s: clamp(+m.s || 1, 0.3, 2.5), dx: clamp(+m.dx || 0, -3, 3), dy: clamp(+m.dy || 0, -3, 3) }, me.id, true);
        }
        case 'emote': {
          if (!EMOTES.includes(m.kind)) return;
          const now = Date.now();
          if (now - me.emoteAt < 600) return;
          me.emoteAt = now;
          return broadcast(room, { t: 'emote', id: me.id, kind: m.kind, serverNow: now });
        }
        case 'leave': return removeParticipant(room, me), ws.close();
        default: break;
      }

      // ---- host only from here ----
      if (!me.isHost) return fail('host-only');
      switch (m.t) {
        case 'admin': {
          const p = m.patch || {};
          if (typeof p.name === 'string') room.name = str(p.name, 40) || room.name;
          if (THEMES.includes(p.theme)) room.theme = p.theme;
          if (LIGHTINGS.includes(p.lighting)) room.lighting = p.lighting;
          if (p.effects && typeof p.effects === 'object') for (const k of EFFECTS) if (typeof p.effects[k] === 'boolean') room.effects[k] = p.effects[k];
          return broadcast(room, { t: 'settings', settings: publicSettings(room) });
        }
        case 'phase': {
          if (m.value !== 'live' && m.value !== 'lobby') return;
          room.phase = m.value; room.phaseAt = m.value === 'live' ? Date.now() + 3000 : 0;
          return broadcast(room, { t: 'phase', phase: room.phase, at: room.phaseAt, serverNow: Date.now() });
        }
        case 'music': {
          const mu = room.music, now = Date.now();
          if (m.action === 'set') {
            const src = validSource(m.source); if (!src) return fail('bad-source');
            if (src.kind === 'file' && !room.media.has(src.url.split('/').pop())) return fail('bad-source');
            Object.assign(mu, { source: src, pos: 0, ts: now, playing: m.play !== false });
          } else if (m.action === 'play') { if (!mu.source) return; Object.assign(mu, { pos: musicNow(room), ts: now, playing: true }); }
          else if (m.action === 'pause') Object.assign(mu, { pos: musicNow(room), ts: now, playing: false });
          else if (m.action === 'seek') Object.assign(mu, { pos: Math.max(0, +m.pos || 0), ts: now });
          else if (m.action === 'next' || m.action === 'prev') {
            const i = mu.source?.kind === 'synth' ? TRACK_IDS.indexOf(mu.source.id) : -1;
            const n = (i + (m.action === 'next' ? 1 : -1) + TRACK_IDS.length) % TRACK_IDS.length;
            Object.assign(mu, { source: { kind: 'synth', id: TRACK_IDS[n], title: TRACK_IDS[n] }, pos: 0, ts: now, playing: true });
          } else return;
          return broadcast(room, { t: 'music', music: { ...mu, pos: musicNow(room), ts: now }, serverNow: now });
        }
        case 'move': {
          const p = room.participants.get(m.id); if (!p) return;
          p.x = clamp(+m.x || 0.5, FLOOR.xMin, FLOOR.xMax); p.y = clamp(+m.y || 0.7, FLOOR.yMin, FLOOR.yMax);
          return broadcast(room, { t: 'move', id: p.id, x: p.x, y: p.y });
        }
        case 'kick': {
          const p = room.participants.get(m.id); if (!p || p.id === me.id) return;
          send(p, { t: 'kicked' }); p.ws?.close(); return removeParticipant(room, p, 'kicked');
        }
        default: return fail('unknown-message');
      }
    };
  }

  // ------------------------------------------------------------ http
  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      const chunks = []; let n = 0;
      req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('too-large')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }
  const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(obj)); };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' }); return res.end(); }
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, rooms: rooms.size });
    if (url.pathname === '/api/party') {                                   // does this party exist? (join page)
      const r = rooms.get((url.searchParams.get('code') || '').toUpperCase());
      return json(res, r ? 200 : 404, r ? { exists: true, name: r.name, players: r.participants.size, full: r.participants.size >= MAX_PARTICIPANTS } : { exists: false });
    }
    if (req.method === 'POST' && url.pathname === '/api/upload') {
      const r = rooms.get((url.searchParams.get('code') || '').toUpperCase());
      const p = r?.participants.get(url.searchParams.get('id'));
      if (!r || !p || p.token !== url.searchParams.get('token') || !p.isHost) return json(res, 403, { error: 'host-only' });
      const type = (req.headers['content-type'] || '').split(';')[0];
      if (!type.startsWith('audio/')) return json(res, 415, { error: 'audio-only' });
      let buf;
      try { buf = await readBody(req, MAX_UPLOAD); } catch { return json(res, 413, { error: 'too-large (max 15 MB)' }); }
      if (!buf.length) return json(res, 400, { error: 'empty' });
      while (r.mediaBytes + buf.length > MAX_ROOM_MEDIA && r.media.size) { const [k, v] = r.media.entries().next().value; r.media.delete(k); r.mediaBytes -= v.buf.length; }
      const id = rid(8);
      let rawTitle = 'Uploaded track';
      try { rawTitle = decodeURIComponent(req.headers['x-title'] || rawTitle); } catch { /* malformed escape: keep default */ }
      r.media.set(id, { buf, type, title: str(rawTitle, 80) || 'Uploaded track' });
      r.mediaBytes += buf.length;
      return json(res, 200, { url: `/media/${r.code}/${id}`, title: r.media.get(id).title });
    }
    const mm = url.pathname.match(/^\/media\/([A-Z0-9]{6})\/([a-f0-9]{8})$/);
    if (mm) {
      const item = rooms.get(mm[1])?.media.get(mm[2]);
      if (!item) { res.writeHead(404); return res.end(); }
      const total = item.buf.length, range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      const base = { 'content-type': item.type, 'accept-ranges': 'bytes', 'access-control-allow-origin': '*', 'cache-control': 'private, max-age=3600' };
      if (range) {
        let s = range[1] === '' ? total - +range[2] : +range[1], e = range[2] === '' || range[1] === '' ? total - 1 : +range[2];
        s = clamp(s, 0, total - 1); e = clamp(e, s, total - 1);
        res.writeHead(206, { ...base, 'content-range': `bytes ${s}-${e}/${total}`, 'content-length': e - s + 1 });
        return res.end(item.buf.subarray(s, e + 1));
      }
      res.writeHead(200, { ...base, 'content-length': total });
      return res.end(item.buf);
    }
    // static app + SPA fallback
    if (distDir && fs.existsSync(distDir) && (req.method === 'GET' || req.method === 'HEAD')) {
      let rel = url.pathname; try { rel = decodeURIComponent(rel); } catch { /* keep raw */ }
      let file = path.join(distDir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(distDir + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(distDir, 'index.html');
      const ext = path.extname(file);
      const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache' };
      const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && ['.html', '.js', '.css', '.svg', '.json'].includes(ext);
      if (gz) { headers['content-encoding'] = 'gzip'; headers.vary = 'Accept-Encoding'; }
      res.writeHead(200, headers);
      if (req.method === 'HEAD') return res.end();
      const rs = fs.createReadStream(file); rs.on('error', () => res.destroy());
      return gz ? rs.pipe(zlib.createGzip()).pipe(res) : rs.pipe(res);
    }
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('DoodleDance server. Build the app (npm run build) to serve it from here.');
  });
  attachWebSocket(server, '/ws', onConnection, (req) => {
    const o = req.headers.origin; if (!o) return true;              // non-browser clients (tests)
    try { const h = new URL(o).host; return h === req.headers.host || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(h); } catch { return false; }
  });
  const sockets = new Set();
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });

  return {
    server, rooms,
    listen: (port = 8787, host = '0.0.0.0') => new Promise((r) => server.listen(port, host, () => r(server.address().port))),
    close: () => new Promise((r) => { for (const room of rooms.values()) { clearTimeout(room.emptyTimer); for (const p of room.participants.values()) { clearTimeout(p.drop); p.ws?.close(); } } server.close(() => r()); for (const s of sockets) s.destroy(); }),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));
  process.on('uncaughtException', (e) => console.error('uncaughtException', e));
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
  const app = createPartyServer({ distDir: dist });
  const port = +process.env.PORT || 8787;
  app.listen(port).then((p) => console.log(`DoodleDance server on http://localhost:${p}  (ws path /ws)${fs.existsSync(dist) ? '  — serving dist/' : ''}`));
}
