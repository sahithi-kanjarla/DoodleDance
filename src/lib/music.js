// Synchronised music for a party. The server owns the state {source, playing, pos, ts}
// (pos = song seconds at server-time ts). Every client computes the same target position
// and nudges its own player to it. Sources: built-in synth, uploaded file, YouTube embed.
import { Synth, TRACKS } from './synth.js';

/** Pure: where in the song should we be right now? */
export function targetPosition(music, serverNow) {
  if (!music) return 0;
  return music.playing ? Math.max(0, music.pos + (serverNow - music.ts) / 1000) : music.pos;
}

let ytPromise = null;
function loadYT() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytPromise) return ytPromise;
  ytPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => { ytPromise = null; reject(new Error('YouTube blocked')); };
    document.head.appendChild(s);
  });
  return ytPromise;
}

export class MusicController {
  constructor({ getServerNow, onChange } = {}) {
    this.now = getServerNow || (() => Date.now());
    this.onChange = onChange || (() => {});
    this.music = null;
    this.volume = 0.8; this.muted = false;
    this.ctx = null; this.master = null; this.analyser = null; this.synth = null;
    this.audio = null; this.audioNode = null;
    this.yt = null; this.ytHost = null; this.ytReady = false; this.ytError = ''; this.ytWanted = null; this.ytBlocked = false;
    this.error = '';
    this.needsGesture = true;
    this.freq = new Uint8Array(64);
    this.timer = setInterval(() => this._tick(), 500);
  }

  // ---------- audio context (needs a user gesture in most browsers)
  _ensureCtx() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.volume;
    this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 128; this.analyser.smoothingTimeConstant = 0.7;
    this.master.connect(this.analyser); this.analyser.connect(this.ctx.destination);
    this.synth = new Synth(this.ctx, this.master);
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    return this.ctx;
  }
  /** Call from a click/tap handler. Unlocks sound for synth, files and YouTube. */
  async unlock() {
    const ctx = this._ensureCtx();
    try { await ctx?.resume(); } catch { /* ignore */ }
    this.needsGesture = false; this.ytBlocked = false;
    this.apply(true);
    this.onChange(this.info());
  }
  attachYouTubeHost(el) { this.ytHost = el; if (this.music?.source?.kind === 'youtube') this.apply(true); }

  info() {
    const s = this.music?.source;
    return { source: s || null, playing: !!this.music?.playing, title: s?.title || '', needsGesture: this.needsGesture || this.ytBlocked, error: this.error, volume: this.volume, muted: this.muted };
  }

  setVolume(v, muted = this.muted) {
    this.volume = Math.min(1, Math.max(0, v)); this.muted = muted;
    const g = this.muted ? 0 : this.volume;
    if (this.master) this.master.gain.value = g;
    if (this.audio && !this.audioNode) this.audio.volume = g;
    try { this.yt?.setVolume?.(Math.round(g * 100)); muted ? this.yt?.mute?.() : this.yt?.unMute?.(); } catch { /* ignore */ }
    this.onChange(this.info());
  }

  /** New state from the server. */
  setState(music) {
    const prev = this.music?.source;
    this.music = music;
    const s = music?.source;
    const changed = JSON.stringify(prev) !== JSON.stringify(s);
    this.apply(changed);
    this.onChange(this.info());
  }

  _stopAll() {
    this.synth?.stop();
    if (this.audio) { this.audio.pause(); this.audio.src = ''; this.audio = null; this.audioNode = null; }
    try { this.yt?.pauseVideo?.(); } catch { /* ignore */ }
    this.ytWanted = null;
  }

  apply(force = false) {
    const m = this.music, s = m?.source;
    this.error = s?.kind === 'youtube' && this.ytVideo === s.videoId ? this.ytError || '' : '';
    if (!s) { this._stopAll(); return; }
    const target = targetPosition(m, this.now());
    if (s.kind === 'synth') {
      this._pauseOthers('synth');
      if (!this._ensureCtx() || this.ctx.state !== 'running') { this.needsGesture = true; if (this.ctx?.state === 'suspended') this.ctx.resume().then(() => { this.needsGesture = false; this.apply(true); this.onChange(this.info()); }).catch(() => {}); return; }
      this.needsGesture = false;
      if (!m.playing) { this.synth.stop(); return; }
      if (force || this.synth.id !== s.id || Math.abs(this.synth.position() - target) > 0.12) this.synth.start(s.id, target);
    } else if (s.kind === 'file') {
      this._pauseOthers('file');
      if (!this.audio || this.audio.dataset.url !== s.url) {
        this.audio?.pause();
        const a = new Audio(); a.crossOrigin = 'anonymous'; a.preload = 'auto'; a.loop = false; a.dataset.url = s.url; a.src = s.url; a.volume = this.muted ? 0 : this.volume;
        a.onerror = () => { this.error = 'Could not load the uploaded track'; this.onChange(this.info()); };
        this.audio = a; force = true;
        const ctx = this._ensureCtx();
        if (ctx) { try { this.audioNode = ctx.createMediaElementSource(a); this.audioNode.connect(this.analyser); a.volume = 1; } catch { /* already connected */ } }
      }
      const a = this.audio;
      if (!m.playing) { a.pause(); if (Math.abs(a.currentTime - target) > 0.05) a.currentTime = target; return; }
      if (force || Math.abs(a.currentTime - target) > 0.35) { try { a.currentTime = target; } catch { /* not seekable yet */ } }
      if (a.paused) a.play().then(() => { this.needsGesture = false; this.onChange(this.info()); }).catch(() => { this.needsGesture = true; this.onChange(this.info()); });
    } else if (s.kind === 'youtube') {
      this._pauseOthers('youtube');
      this._applyYouTube(s, m, target, force);
    }
  }

  _pauseOthers(keep) {
    if (keep !== 'synth') this.synth?.stop();
    if (keep !== 'file' && this.audio) { this.audio.pause(); }
    if (keep !== 'youtube') { try { this.yt?.pauseVideo?.(); } catch { /* ignore */ } }
  }

  async _applyYouTube(s, m, target, force) {
    if (!this.ytHost) return;
    try {
      const YT = await loadYT();
      if (!this.yt || this.ytVideo !== s.videoId) {
        if (this.yt) { try { this.yt.destroy(); } catch { /* ignore */ } this.yt = null; this.ytReady = false; this.ytHost.innerHTML = ''; }
        const div = document.createElement('div'); this.ytHost.appendChild(div);
        this.ytVideo = s.videoId; this.ytReady = false; this.ytError = '';
        this.yt = new YT.Player(div, {
          videoId: s.videoId, width: '100%', height: '100%',
          playerVars: { controls: 0, playsinline: 1, rel: 0, modestbranding: 1, disablekb: 1, fs: 0, iv_load_policy: 3, origin: location.origin },
          events: {
            onReady: () => { this.ytReady = true; this.setVolume(this.volume, this.muted); this.apply(true); },
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.PLAYING) { this.ytBlocked = false; this.onChange(this.info()); }
              if (e.data === YT.PlayerState.UNSTARTED || e.data === YT.PlayerState.CUED) { if (this.music?.playing) setTimeout(() => { if (this.yt?.getPlayerState?.() !== YT.PlayerState.PLAYING) { this.ytBlocked = true; this.onChange(this.info()); } }, 1200); }
            },
            onError: (e) => { this.ytError = this.error = e.data === 101 || e.data === 150 ? 'The video owner blocks embedding — pick another' : 'YouTube could not play that video'; this.onChange(this.info()); },
          },
        });
        return;
      }
      if (!this.ytReady) return;
      const p = this.yt, st = p.getPlayerState?.();
      if (!m.playing) { if (st === YT.PlayerState.PLAYING) p.pauseVideo(); return; }
      const cur = p.getCurrentTime?.() || 0;
      if (force || Math.abs(cur - target) > 0.8) p.seekTo(target, true);
      if (st !== YT.PlayerState.PLAYING && st !== YT.PlayerState.BUFFERING) p.playVideo();
    } catch (e) { this.error = e.message || 'YouTube unavailable'; this.onChange(this.info()); }
  }

  /** Periodic drift correction. */
  _tick() { if (this.music?.playing && !this.needsGesture) this.apply(false); }

  // ---------- visuals
  /** 0..1 loudness for pulsing the stage. */
  energy() {
    if (!this.music?.playing) return 0;
    if (this.analyser && (this.music.source?.kind !== 'youtube')) {
      this.analyser.getByteFrequencyData(this.freq);
      let s = 0; const n = Math.min(6, this.freq.length); for (let i = 0; i < n; i++) s += this.freq[i];
      return Math.min(1, (s / n / 255) * 1.25);
    }
    const t = this.now() / 1000, beat = (t * 2) % 1;           // YouTube gives no audio data → fake 120 bpm pulse
    return Math.pow(1 - beat, 3) * 0.8 + 0.1;
  }
  bars(n = 16) {
    const out = new Array(n).fill(0);
    if (!this.music?.playing) return out;
    if (this.analyser && this.music.source?.kind !== 'youtube') {
      this.analyser.getByteFrequencyData(this.freq);
      const per = Math.max(1, Math.floor(this.freq.length * 0.7 / n));
      for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < per; j++) s += this.freq[i * per + j] || 0; out[i] = s / per / 255; }
    } else {
      const t = this.now() / 1000;
      for (let i = 0; i < n; i++) out[i] = 0.25 + 0.6 * Math.abs(Math.sin(t * (2.2 + i * 0.37) + i));
    }
    return out;
  }
  trackTitle(id) { return TRACKS[id]?.title || id; }

  destroy() { clearInterval(this.timer); this._stopAll(); try { this.yt?.destroy(); } catch { /* ignore */ } this.ctx?.close?.(); }
}
