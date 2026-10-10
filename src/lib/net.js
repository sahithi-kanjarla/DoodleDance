// WebSocket client for a party: reconnect with the same identity, clock sync, tiny API.
// Only compact pose numbers and settings travel — never video.

export function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

export class PartyClient {
  /** handlers: {welcome, joined, left, presence, host, pose, emote, settings, phase, music, move, kicked, error, status} */
  constructor(handlers = {}, url = wsUrl()) {
    this.h = handlers;
    this.url = url;
    this.ws = null;
    this.identity = null;        // {code, id, token} once welcomed → used to rejoin
    this.first = null;           // first message to send on connect (create / join)
    this.offset = 0;             // serverNow ≈ Date.now() + offset
    this.rtt = 0;
    this.samples = [];
    this.closedByUs = false;
    this.retry = 0;
    this.pingTimer = null;
    this.pingN = 0;
    this.pings = new Map();
    this.status = 'idle';
  }

  serverNow() { return Date.now() + this.offset; }

  _status(s) { this.status = s; this.h.status?.(s); }

  create(name, user) { this.first = { t: 'create', name, user }; this._open(); }
  join(code, user) { this.first = { t: 'join', code, user }; this._open(); }

  _open() {
    this.closedByUs = false;
    this._status(this.retry ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      const msg = this.identity ? { t: 'rejoin', ...this.identity } : this.first;
      ws.send(JSON.stringify(msg));
      this._startPings();
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'pong') return this._pong(m);
      if (m.t === 'welcome') {
        this.identity = { code: m.code, id: m.you.id, token: m.you.token };
        this.offset = m.serverNow - Date.now();
        this._status('online');
      }
      if (m.t === 'error' && m.error === 'rejoin-failed') { this.identity = null; this.closedByUs = true; }
      if (m.t === 'kicked') this.closedByUs = true;
      this.h[m.t]?.(m);
    };
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      if (this.closedByUs) return this._status('closed');
      this.retry++;
      if (!this.identity && this.retry >= 3) { this.closedByUs = true; return this._status('unreachable'); }   // never got in: server is down
      this._status('reconnecting');
      setTimeout(() => { if (!this.closedByUs) this._open(); }, Math.min(5000, 400 * 2 ** Math.min(this.retry, 4)));
    };
    ws.onerror = () => {};
  }

  send(msg) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  pose(a, s, dx, dy) { this.send({ t: 'pose', a, s, dx, dy }); }
  emote(kind) { this.send({ t: 'emote', kind }); }
  admin(patch) { this.send({ t: 'admin', patch }); }
  phase(value) { this.send({ t: 'phase', value }); }
  music(action, extra = {}) { this.send({ t: 'music', action, ...extra }); }
  move(id, x, y) { this.send({ t: 'move', id, x, y }); }
  kick(id) { this.send({ t: 'kick', id }); }

  leave() {
    this.closedByUs = true;
    this.send({ t: 'leave' });
    clearInterval(this.pingTimer);
    setTimeout(() => this.ws?.close(), 50);
    this.identity = null;
  }

  // --- clock sync: keep the lowest-RTT samples, take their median offset
  _startPings() {
    clearInterval(this.pingTimer);
    const go = () => { const c = ++this.pingN; this.pings.set(c, performance.now()); this.send({ t: 'ping', c }); };
    go(); setTimeout(go, 250); setTimeout(go, 600);
    this.pingTimer = setInterval(go, 4000);
  }
  _pong(m) {
    const t0 = this.pings.get(m.c); if (t0 == null) return; this.pings.delete(m.c);
    const rtt = performance.now() - t0;
    const off = m.s + rtt / 2 - Date.now();
    this.samples.push({ rtt, off }); if (this.samples.length > 12) this.samples.shift();
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, 5).map((s) => s.off).sort((a, b) => a - b);
    this.offset = best[best.length >> 1];
    this.rtt = rtt;
  }
}

export async function partyExists(code) {
  try { const r = await fetch(`/api/party?code=${encodeURIComponent(code)}`); return r.ok ? await r.json() : null; } catch { return null; }
}

export async function uploadTrack(file, identity) {
  const q = new URLSearchParams({ code: identity.code, id: identity.id, token: identity.token });
  const r = await fetch(`/api/upload?${q}`, { method: 'POST', headers: { 'content-type': file.type || 'audio/mpeg', 'x-title': encodeURIComponent(file.name.replace(/\.[^.]+$/, '')) }, body: file });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || 'upload failed');
  return body; // {url, title}
}

/** Pull the 11-char id out of any YouTube link (watch, youtu.be, shorts, embed, live). */
export function parseYouTubeId(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(/^https?:\/\//.test(s) ? s : 'https://' + s);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1, 12) || null;
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (u.searchParams.get('v')) return u.searchParams.get('v').slice(0, 11);
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch { /* not a url */ }
  return null;
}
