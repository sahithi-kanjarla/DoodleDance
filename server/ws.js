// Minimal zero-dependency WebSocket server (RFC 6455): text frames, fragmentation,
// ping/pong, close, size limits. Enough for DoodleDance; swap for `ws` any time.
import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PAYLOAD = 2 * 1024 * 1024;

export class Socket {
  constructor(raw) {
    this.raw = raw;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.fragBytes = 0;
    this.alive = true;
    this.closed = false;
    this.onmessage = null;
    this.onclose = null;
    raw.on('data', (d) => this.#data(d));
    raw.on('close', () => this.#finish());
    raw.on('error', () => this.#finish());
    raw.setNoDelay(true);
  }
  get backlog() { return this.raw.writableLength; }
  send(text) {
    if (this.closed) return;
    const payload = Buffer.from(text, 'utf8');
    this.#write(0x1, payload);
  }
  ping() { if (!this.closed) this.#write(0x9, Buffer.alloc(0)); }
  close(code = 1000) {
    if (this.closed) return;
    const b = Buffer.alloc(2); b.writeUInt16BE(code);
    this.#write(0x8, b);
    this.raw.end();
    this.#finish();
  }
  #write(opcode, payload) {
    const n = payload.length;
    let head;
    if (n < 126) head = Buffer.from([0x80 | opcode, n]);
    else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(n, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    this.raw.write(Buffer.concat([head, payload]));
  }
  #finish() {
    if (this.closed) return;
    this.closed = true;
    this.raw.destroy();
    this.onclose?.();
  }
  #data(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = !!(b0 & 0x80), opcode = b0 & 0x0f, masked = !!(b1 & 0x80);
      let len = b1 & 0x7f, off = 2;
      if (!masked) return this.close(1002);            // clients must mask
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_PAYLOAD)) return this.close(1009);
        len = Number(big); off = 10;
      }
      if (len > MAX_PAYLOAD) return this.close(1009);
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const data = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      if (opcode === 0x8) return this.close(1000);
      if (opcode === 0x9) { this.#write(0xA, data); continue; }
      if (opcode === 0xA) { this.alive = true; continue; }
      if (opcode === 0x1 || opcode === 0x2 || opcode === 0x0) {
        if (opcode !== 0x0) { this.frags = []; this.fragBytes = 0; }
        this.frags.push(data); this.fragBytes += data.length;
        if (this.fragBytes > MAX_PAYLOAD) return this.close(1009);
        if (fin) {
          const msg = Buffer.concat(this.frags).toString('utf8');
          this.frags = []; this.fragBytes = 0;
          try { this.onmessage?.(msg); } catch (e) { console.error('message handler error', e); }
        }
      }
    }
  }
}

/** Attach to an http.Server; calls onConnection(socket, req) for upgrades on `path`. */
export function attachWebSocket(server, path, onConnection, verify = () => true) {
  server.on('upgrade', (req, rawSocket) => {
    const url = new URL(req.url, 'http://x');
    const key = req.headers['sec-websocket-key'];
    if (url.pathname !== path || !verify(req) || !key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
      rawSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n'); rawSocket.destroy(); return;
    }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    rawSocket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
    onConnection(new Socket(rawSocket), req);
  });
}
