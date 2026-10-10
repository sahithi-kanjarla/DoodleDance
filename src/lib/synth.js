// Built-in royalty-free tracks, generated live with WebAudio (no audio files, no licences).
// Each track is a pure function of the step number → every guest plays the identical song,
// and "join late" simply means "start at step N". stepEvents() is pure and unit-tested.

export const TRACKS = {
  disco: { title: 'Disco Inferno-ish', bpm: 118, kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', clap: '', bass: 'x.xxx.xxx.xxx.xx', lead: 'x.xx.x.xx.xx.x.x', prog: [[57, 'm'], [57, 'm'], [62, 'M'], [64, 'M']], leadWave: 'square', bassWave: 'sawtooth', oct: true },
  neon: { title: 'Neon Highway', bpm: 104, kick: 'x.....x.x.....x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xx', clap: '....x.......x...', bass: 'xxxxxxxxxxxxxxxx', lead: 'x..x..x.x..x..x.', prog: [[45, 'm'], [53, 'M'], [48, 'M'], [55, 'M']], leadWave: 'sawtooth', bassWave: 'sawtooth', oct: false },
  chill: { title: 'Lazy Doodle', bpm: 76, kick: 'x.......x..x....', snare: '........x.......', hat: 'x.x.x.x.x.x.x.x.', clap: '', bass: 'x.....x.x.......', lead: 'x...x.x.....x...', prog: [[48, 'M7'], [45, 'm7'], [50, 'm7'], [43, 'D']], leadWave: 'triangle', bassWave: 'sine', oct: false },
  spooky: { title: 'Haunted Wiggle', bpm: 92, kick: 'x.......x.x.....', snare: '....x.......x...', hat: '..x...x...x...xx', clap: '', bass: 'x.x...x.x.x...x.', lead: 'x.x.xx..x.x.xx..', prog: [[52, 'm'], [52, 'd'], [49, 'M'], [51, 'd']], leadWave: 'square', bassWave: 'triangle', oct: false },
  beach: { title: 'Sandy Toes', bpm: 100, kick: 'x.....x...x.....', snare: '........x.......', hat: 'x.xxx.xxx.xxx.xx', clap: '', bass: 'x.....x.x.....x.', lead: '..x...x...x...x.', prog: [[55, 'M'], [60, 'M'], [62, 'M'], [60, 'M']], leadWave: 'triangle', bassWave: 'sine', oct: false, offbeat: true },
  space: { title: 'Cosmic Noodle', bpm: 84, kick: 'x.......x.......', snare: '........x.......', hat: 'x...x...x...x..x', clap: '', bass: 'x.......x.......', lead: 'x.x.x.x.x.x.x.x.', prog: [[50, 'm7'], [46, 'M7'], [53, 'M7'], [48, 'M7']], leadWave: 'sine', bassWave: 'sine', oct: false, arpHigh: true },
};

const CHORDS = { M: [0, 4, 7, 12], m: [0, 3, 7, 12], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10], D: [0, 4, 7, 10], d: [0, 3, 6, 9] };
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

export const stepDur = (id) => 60 / TRACKS[id].bpm / 4;
export const STEPS_PER_BAR = 16;

/** Pure: what sounds on 16th-note step n (n >= 0). */
export function stepEvents(id, n) {
  const T = TRACKS[id]; if (!T) return [];
  const s = n % 16, bar = Math.floor(n / 16) % T.prog.length;
  const [root, q] = T.prog[bar], chord = CHORDS[q];
  const on = (pat) => pat[s] === 'x';
  const ev = [];
  if (on(T.kick)) ev.push({ type: 'kick', vel: s === 0 ? 1 : 0.85 });
  if (on(T.snare)) ev.push({ type: 'snare', vel: 0.8 });
  if (on(T.clap)) ev.push({ type: 'clap', vel: 0.6 });
  if (on(T.hat)) ev.push({ type: 'hat', vel: s % 4 === 2 ? 0.55 : 0.35 });
  if (on(T.bass)) ev.push({ type: 'bass', midi: root - 12 + (T.oct && s % 2 ? 12 : 0), dur: 1.6, vel: 0.9, wave: T.bassWave });
  if (on(T.lead)) {
    const k = (n >> 1) % chord.length;
    const note = root + 12 + chord[k] + (T.arpHigh ? 12 : 0);
    ev.push({ type: 'lead', midi: note, dur: T.offbeat ? 0.8 : 1.4, vel: 0.5, wave: T.leadWave });
  }
  if (T.offbeat && s % 4 === 2) ev.push({ type: 'stab', midi: root + 12, chord, vel: 0.35 });
  if (s === 0 && (id === 'space' || id === 'chill' || id === 'spooky')) ev.push({ type: 'pad', midi: root, chord, dur: 16, vel: 0.22 });
  return ev;
}

export class Synth {
  constructor(ctx, dest) {
    this.ctx = ctx; this.out = ctx.createGain(); this.out.gain.value = 0.9; this.out.connect(dest);
    this.id = null; this.t0 = 0; this.next = 0; this.timer = null;
    const len = ctx.sampleRate * 0.5, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }

  /** Start track `id` at `pos` seconds into the song. */
  start(id, pos = 0) {
    this.stop();
    if (!TRACKS[id]) return;
    this.id = id; this.sd = stepDur(id);
    this.t0 = this.ctx.currentTime - pos;
    this.next = Math.ceil(pos / this.sd - 1e-6);
    this.timer = setInterval(() => this._pump(), 40);
    this._pump();
  }
  stop() { clearInterval(this.timer); this.timer = null; this.id = null; }
  position() { return this.id ? this.ctx.currentTime - this.t0 : 0; }
  get playing() { return !!this.id; }

  _pump() {
    const horizon = this.ctx.currentTime + 0.25;
    while (this.t0 + this.next * this.sd < horizon) {
      const when = this.t0 + this.next * this.sd;
      if (when >= this.ctx.currentTime - 0.02) for (const e of stepEvents(this.id, this.next)) this._play(e, Math.max(when, this.ctx.currentTime));
      this.next++;
    }
  }

  _env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  _osc(type, f, t, dur, vel, cutoff) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), fl = this.ctx.createBiquadFilter();
    o.type = type; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = cutoff || 3000;
    this._env(g, t, 0.008, vel * 0.3, dur);
    o.connect(fl); fl.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  }
  _noise(t, dur, vel, hp, bp) {
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    s.buffer = this.noise; f.type = bp ? 'bandpass' : 'highpass'; f.frequency.value = hp;
    this._env(g, t, 0.002, vel * 0.35, dur);
    s.connect(f); f.connect(g); g.connect(this.out); s.start(t, Math.random() * 0.2); s.stop(t + dur + 0.05);
  }
  _play(e, t) {
    const sd = this.sd, c = this.ctx;
    switch (e.type) {
      case 'kick': {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        this._env(g, t, 0.002, e.vel * 0.9, 0.22); o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.3); break;
      }
      case 'snare': this._noise(t, 0.16, e.vel, 1800, true); this._osc('triangle', 190, t, 0.1, e.vel * 0.6); break;
      case 'clap': this._noise(t, 0.1, e.vel, 1200, true); this._noise(t + 0.012, 0.1, e.vel, 1500, true); break;
      case 'hat': this._noise(t, 0.045, e.vel, 7000); break;
      case 'bass': this._osc(e.wave, midi(e.midi), t, sd * e.dur, e.vel, 700); break;
      case 'lead': this._osc(e.wave, midi(e.midi), t, sd * e.dur * 1.4, e.vel, 2600); break;
      case 'stab': for (const k of e.chord.slice(0, 3)) this._osc('square', midi(e.midi + k), t, sd * 1.2, e.vel * 0.6, 1800); break;
      case 'pad': for (const k of e.chord.slice(0, 3)) this._osc('sawtooth', midi(e.midi + 12 + k), t, sd * e.dur, e.vel * 0.5, 900); break;
      default: break;
    }
  }
}
