// The party floor: a React-free canvas scene. Everyone is drawn with THEIR OWN character,
// from compact bone angles. Handles smoothing, idle/auto-dance, emotes, 2.5D depth, effects,
// and host drag-to-move.
import { drawCharacter, demoAngles } from './character.js';
import { THEMES, FLOOR_Y, drawLighting } from './themes.js';
import { Particles } from './effects.js';
import { emotePose, applyEmote, angDiff, EMOTE_INFO } from './emotes.js';
import { POSE_KEYS, FLOOR } from '../../shared/constants.js';

const U = -Math.PI / 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DEPTH_RANGE = 0.09;                                          // how far (fraction of stage height) you can step forward/back

export function arrayToAngles(a) { const o = {}; POSE_KEYS.forEach((k, i) => { if (a[i] != null) o[k] = a[i]; }); return o; }
export function anglesToArray(p) { return POSE_KEYS.map((k) => (p?.[k] == null ? null : +p[k].toFixed(3))); }

export class PartyScene {
  constructor(canvas, { getEnergy, onMove } = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.getEnergy = getEnergy || (() => 0);
    this.onMove = onMove || (() => {});
    this.actors = new Map();
    this.settings = { theme: 'neon', lighting: 'purple', effects: { sparkles: true } };
    this.musicPlaying = false;
    this.particles = new Particles();
    this.localId = null; this.localSource = null;        // () => angles | null (live camera)
    this.dragEnabled = false; this.drag = null;
    this.t = 0; this.last = 0; this.raf = 0; this.w = 640; this.h = 360; this.dpr = 1;
    this._bind();
  }

  // ------------------------------------------------------------ data in
  setSettings(s) { this.settings = { ...this.settings, ...s }; }
  setMusicPlaying(v) { this.musicPlaying = v; }
  addActor({ id, name, character, x, y, connected = true }) {
    this.actors.set(id, { id, name, ch: character, x, y, dx: x, dy: y, cur: {}, tgt: {}, poseAt: -99, sm: 1, off: 0, bodyDy: 0, bodyDx: 0, emote: null, connected, rect: null, phase: Math.random() * 6 });
  }
  removeActor(id) { this.actors.delete(id); }
  setPresence(id, connected) { const a = this.actors.get(id); if (a) a.connected = connected; }
  setPos(id, x, y) { const a = this.actors.get(id); if (a && !(this.drag && this.drag.id === id)) { a.x = x; a.y = y; } }
  setPose(id, m) {
    const a = this.actors.get(id); if (!a) return;
    a.tgtS = m.s || 1; a.tgt = arrayToAngles(m.a); a.tgtDy = m.dy || 0; a.tgtDx = m.dx || 0; a.poseAt = this.t;
  }
  emote(id, kind) {
    const a = this.actors.get(id); if (!a || !EMOTE_INFO[kind]) return;
    a.emote = { kind, t0: this.t, burst: 0 };
    const p = this._headPx(a); this.particles.burst(kind, p.x, p.y, p.k);
  }

  // ------------------------------------------------------------ geometry
  _y(a) { return a.dy + (a.off || 0); }
  _depth(a) { return 0.72 + 0.4 * clamp((this._y(a) - FLOOR.yMin) / (FLOOR.yMax - FLOOR.yMin), 0, 1); }
  _place(a) {
    const b = a.ch.bbox, P = a.ch.rig.joints.PELVIS, bh = b.maxy - b.miny + 1;
    const k = (this.h * 0.36 * this._depth(a)) / bh, cx = (b.minx + b.maxx) / 2;
    const feetY = this._y(a) * this.h;
    return { k, feetY, bh, place: { x: a.dx * this.w + k * (P.x - cx), y: feetY - k * (b.maxy - P.y), k } };
  }
  _headPx(a) { const g = this._place(a); return { x: a.dx * this.w, y: g.feetY - g.bh * g.k * 0.95, k: g.k > 0 ? clamp(g.k * 2.4, 0.7, 1.3) : 1 }; }

  // ------------------------------------------------------------ frame
  anglesFor(a) {
    const isLocal = a.id === this.localId;
    const live = isLocal ? this.localSource?.() : null;
    let base, bdx = 0, bdy = 0;
    if (live) { base = { ...live }; delete base.scale; bdx = live.dx || 0; bdy = live.dy || 0; delete base.dx; delete base.dy; a.poseAt = this.t; a.cur = base; }
    else if (this.t - a.poseAt < 1.2) {
      for (const k of POSE_KEYS) {                                    // smooth 20 Hz network poses
        const tg = a.tgt[k], cu = a.cur[k];
        if (tg == null) { a.cur[k] = undefined; continue; }
        a.cur[k] = cu == null ? tg : cu + angDiff(cu, tg) * 0.45;
      }
      a.bodyDy = (a.bodyDy ?? 0) + ((a.tgtDy || 0) - (a.bodyDy ?? 0)) * 0.4; a.bodyDx = (a.bodyDx ?? 0) + ((a.tgtDx || 0) - (a.bodyDx ?? 0)) * 0.4;
      base = { ...a.cur }; bdx = a.bodyDx; bdy = a.bodyDy;
    } else if (this.musicPlaying) {
      base = demoAngles('dance', this.t * 0.9 + a.phase);          // no camera → bop to the music
      bdy = -0.04 * Math.abs(Math.sin(this.t * 4 + a.phase));
    } else {
      const s = Math.sin(this.t * 1.6 + a.phase);                    // gentle idle breathing
      base = { torso: U + 0.015 * s, head: 0.04 * Math.sin(this.t * 0.9 + a.phase) };
    }
    bdx = clamp(bdx, -1, 1);                                          // sideways wandering stays limited too
    // step toward / away from the camera → come forward / go back on the floor (limited, never into a neighbour)
    const sNow = live ? (live.scale ?? 1) : (this.t - a.poseAt < 1.2 ? (a.tgtS ?? 1) : 1);
    a.sm += (sNow - a.sm) * 0.1;
    let want = clamp((a.sm - 1) * 0.25, -DEPTH_RANGE, DEPTH_RANGE);
    for (const o of this.actors.values()) {
      if (o === a || Math.abs(o.dx - a.dx) > 0.11) continue;
      const gap = 0.07, oy = o.dy;                                   // others' home row (no feedback loops)
      if (want > 0 && a.dy < oy && a.dy + want > oy - gap) want = Math.max(0, oy - gap - a.dy);
      if (want < 0 && a.dy > oy && a.dy + want < oy + gap) want = Math.min(0, oy + gap - a.dy);
    }
    want = clamp(a.dy + want, FLOOR.yMin, FLOOR.yMax) - a.dy;
    a.off += (want - a.off) * 0.12;
    let out = { ...base, dx: bdx, dy: bdy };
    if (a.emote) {
      const em = emotePose(a.emote.kind, this.t - a.emote.t0);
      if (em) { out = applyEmote(out, em); const e = a.emote; const n = Math.floor((this.t - e.t0) / 0.7); if (n > e.burst && (e.kind === 'dance' || e.kind === 'confetti' || e.kind === 'heart')) { e.burst = n; const p = this._headPx(a); this.particles.burst(e.kind, p.x, p.y, p.k * 0.8); } }
      else a.emote = null;
    }
    return out;
  }

  frame(dt, t) {
    this.t = t ?? this.t + dt;
    const { ctx: c, w, h } = this, th = THEMES[this.settings.theme] || THEMES.neon, e = this.getEnergy();
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    th.draw(c, w, h, this.t, e);
    const fx = this.settings.effects || {};
    this.particles.drawBack(c, w, h, this.t, fx, e);
    for (const a of this.actors.values()) { a.dx += (a.x - a.dx) * Math.min(1, dt * 7); a.dy += (a.y - a.dy) * Math.min(1, dt * 7); }
    const order = [...this.actors.values()].sort((p, q) => this._y(p) - this._y(q));
    for (const a of order) {
      const g = this._place(a), ang = this.anglesFor(a);
      c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(a.dx * w, g.feetY + 2, g.k * g.bh * 0.17, g.k * g.bh * 0.035, 0, 0, 7); c.fill();
      c.globalAlpha = a.connected ? 1 : 0.35;
      const squash = e > 0.5 && this.musicPlaying ? 1 + (e - 0.5) * 0.03 : 1;
      drawCharacter(c, a.ch, { ...ang, scale: squash }, g.place, { outline: true });
      c.globalAlpha = 1;
      const bw = (a.ch.bbox.maxx - a.ch.bbox.minx) * g.k, hh = g.bh * g.k;
      a.rect = { x0: a.dx * w - bw / 2 - 12, x1: a.dx * w + bw / 2 + 12, y0: g.feetY - hh - 40, y1: g.feetY + 10 };
      if (this.drag?.id === a.id) { c.strokeStyle = '#ffd23f'; c.lineWidth = 4; c.setLineDash([10, 8]); c.strokeRect(a.rect.x0, a.rect.y0, a.rect.x1 - a.rect.x0, a.rect.y1 - a.rect.y0); c.setLineDash([]); }
    }
    this.particles.update(dt, w, h, fx, e);
    drawLighting(c, w, h, this.t, this.settings.lighting, e);
    this.particles.draw(c);
  }

  // ------------------------------------------------------------ loop / size
  start() {
    const loop = (now) => {
      const dt = Math.min(0.05, (now - (this.last || now)) / 1000); this.last = now;
      this.frame(dt, (this.t || 0) + dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { cancelAnimationFrame(this.raf); this.ro?.disconnect(); this._unbind?.(); }
  fit() {
    const r = this.canvas.getBoundingClientRect(); this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(200, r.width); this.h = Math.max(120, r.height);
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
  }
  _bind() {
    this.fit(); this.ro = new ResizeObserver(() => this.fit()); this.ro.observe(this.canvas);
    const pt = (e) => { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    let lastSend = 0;
    const down = (e) => {
      if (!this.dragEnabled) return; const p = pt(e);
      const hit = [...this.actors.values()].sort((a, b) => b.dy - a.dy).find((a) => a.rect && p.x >= a.rect.x0 && p.x <= a.rect.x1 && p.y >= a.rect.y0 && p.y <= a.rect.y1);
      if (hit) { this.drag = { id: hit.id, ox: hit.x * this.w - p.x, oy: hit.y * this.h - p.y }; this.canvas.setPointerCapture(e.pointerId); }
    };
    const move = (e) => {
      if (!this.drag) return; const p = pt(e), a = this.actors.get(this.drag.id); if (!a) return;
      a.x = clamp((p.x + this.drag.ox) / this.w, FLOOR.xMin, FLOOR.xMax); a.y = clamp((p.y + this.drag.oy) / this.h, FLOOR.yMin, FLOOR.yMax);
      const n = performance.now(); if (n - lastSend > 66) { lastSend = n; this.onMove(a.id, a.x, a.y); }
    };
    const up = () => { if (!this.drag) return; const a = this.actors.get(this.drag.id); if (a) this.onMove(a.id, a.x, a.y); this.drag = null; };
    this.canvas.addEventListener('pointerdown', down); this.canvas.addEventListener('pointermove', move);
    this.canvas.addEventListener('pointerup', up); this.canvas.addEventListener('pointercancel', up);
    this._unbind = () => { this.canvas.removeEventListener('pointerdown', down); this.canvas.removeEventListener('pointermove', move); this.canvas.removeEventListener('pointerup', up); this.canvas.removeEventListener('pointercancel', up); };
  }
}
