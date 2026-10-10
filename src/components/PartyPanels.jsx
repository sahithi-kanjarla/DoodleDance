import React, { useEffect, useRef, useState } from 'react';
import { THEMES, LIGHTINGS, EFFECTS, TRACK_IDS } from '../../shared/constants.js';
import { THEME_INFO } from '../lib/themes.js';
import { TRACKS } from '../lib/synth.js';
import { parseYouTubeId, uploadTrack } from '../lib/net.js';

const COLS = ['#ff3ea5', '#ffd23f', '#3ddc97', '#4cc9f0', '#b44dff', '#ff7b54'];
const LIGHT_LABEL = { off: 'Off', purple: 'Purple', blue: 'Blue', warm: 'Warm', rainbow: 'Rainbow' };
const FX_LABEL = { confetti: '🎊 Confetti', disco: '🪩 Disco spots', smoke: '💨 Smoke', sparkles: '✨ Sparkles' };

function Viz({ music }) {
  const cv = useRef(null);
  useEffect(() => {
    const c = cv.current, g = c.getContext('2d'); let raf = 0;
    const draw = () => {
      const bars = music.bars(24), w = c.width, h = c.height, bw = w / bars.length;
      g.clearRect(0, 0, w, h);
      bars.forEach((v, i) => { const bh = Math.max(4, v * h); g.fillStyle = COLS[i % COLORS_N]; g.fillRect(i * bw + 2, h - bh, bw - 4, bh); g.strokeStyle = '#1b1b2f'; g.lineWidth = 2; g.strokeRect(i * bw + 2, h - bh, bw - 4, bh); });
      raf = requestAnimationFrame(draw);
    };
    const COLORS_N = COLS.length;
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [music]);
  return <canvas ref={cv} width="240" height="40" className="viz" />;
}

/** Theme + lighting + effects, laid out wide and short so the stage stays visible underneath. */
export function ThemePanel({ net, room }) {
  return (
    <div className="pp">
      <div className="pp-row"><b className="pp-l">Theme</b>
        <div className="chips tight">
          {THEMES.map((t) => <button key={t} className={`chip ${room.theme === t ? 'on' : ''}`} onClick={() => net.admin({ theme: t })}>{THEME_INFO[t].emoji} {THEME_INFO[t].label}</button>)}
        </div>
      </div>
      <div className="pp-row"><b className="pp-l">Lights</b>
        <div className="chips tight">
          {LIGHTINGS.map((l) => <button key={l} className={`chip ${room.lighting === l ? 'on' : ''}`} onClick={() => net.admin({ lighting: l })}>{LIGHT_LABEL[l]}</button>)}
        </div>
      </div>
      <div className="pp-row"><b className="pp-l">Effects</b>
        <div className="chips tight">
          {EFFECTS.map((f) => <button key={f} className={`chip ${room.effects[f] ? 'on' : ''}`} onClick={() => net.admin({ effects: { [f]: !room.effects[f] } })}>{FX_LABEL[f]}</button>)}
        </div>
      </div>
    </div>
  );
}

/** Everyone gets volume + now playing; the host also gets the track pickers. */
export function MusicPanel({ net, isHost, music, info }) {
  const [yt, setYt] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const setSource = (source) => { setMsg(''); net.music('set', { source }); };
  const addYT = async () => {
    const id = parseYouTubeId(yt); if (!id) return setMsg('That does not look like a YouTube link.');
    setYt(''); let title = 'YouTube video';
    try {                                                   // best-effort real title; never blocks playing
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`, { signal: ctl.signal });
      clearTimeout(t); if (r.ok) title = String((await r.json()).title || title).slice(0, 80);
    } catch { /* offline / blocked: keep generic title */ }
    setSource({ kind: 'youtube', videoId: id, title });
  };
  const upload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('audio/')) return setMsg('Pick an audio file (mp3, wav, ogg, m4a).');
    if (file.size > 15 * 1024 * 1024) return setMsg('That file is over 15 MB.');
    setBusy(true); setMsg('Uploading…');
    try { const r = await uploadTrack(file, net.identity); setSource({ kind: 'file', url: r.url, title: r.title }); setMsg(''); } catch (e) { setMsg(e.message); }
    setBusy(false); if (fileRef.current) fileRef.current.value = '';
  };
  const src = info.source;
  return (
    <div className="pp">
      <div className="pp-row">
        <b className="pp-l">Now</b>
        <span className={`dot ${info.playing ? 'on' : ''}`} />
        <span className="np-title">{src ? `${src.kind === 'youtube' ? '▶ ' : '🎵 '}${info.title || src.title || 'Track'}` : 'No music yet'}</span>
        <Viz music={music} />
        <button className="btn ghost sm" onClick={() => music.setVolume(info.volume, !info.muted)}>{info.muted ? '🔇' : '🔊'}</button>
        <input className="volrange" type="range" min="0" max="1" step="0.01" value={info.volume} onChange={(e) => music.setVolume(+e.target.value, false)} aria-label="My volume" />
      </div>
      {isHost ? (
        <>
          <div className="pp-row"><b className="pp-l">Play</b>
            <button className="btn ghost sm" onClick={() => net.music('prev')}>⏮</button>
            <button className="btn primary sm" disabled={!src} onClick={() => net.music(info.playing ? 'pause' : 'play')}>{info.playing ? '⏸ Pause' : '▶ Play'}</button>
            <button className="btn ghost sm" onClick={() => net.music('next')}>⏭</button>
            <div className="chips tight">
              {TRACK_IDS.map((id) => <button key={id} className={`chip ${src?.kind === 'synth' && src.id === id ? 'on' : ''}`} onClick={() => setSource({ kind: 'synth', id, title: TRACKS[id].title })}>🎵 {TRACKS[id].title}</button>)}
            </div>
          </div>
          <div className="pp-row"><b className="pp-l">Yours</b>
            <input className="input sm grow" placeholder="Paste a YouTube link" value={yt} onChange={(e) => setYt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addYT()} />
            <button className="btn ghost sm" onClick={addYT}>▶ YouTube</button>
            <label className={`btn ghost sm filebtn ${busy ? 'dis' : ''}`}>⬆ Upload audio<input ref={fileRef} type="file" accept="audio/*" hidden disabled={busy} onChange={(e) => upload(e.target.files?.[0])} /></label>
          </div>
          {(msg || info.error) && <p className={msg === 'Uploading…' ? 'muted small' : 'error'}>{msg || info.error}</p>}
        </>
      ) : <p className="muted small">The host picks the music. Volume is just for you.</p>}
    </div>
  );
}

/** Host settings + people. */
export function PeoplePanel({ net, room, people, you, isHost }) {
  const [name, setName] = useState(room?.name || '');
  return (
    <div className="pp">
      {isHost && (
        <div className="pp-row"><b className="pp-l">Name</b>
          <input className="input sm grow" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && net.admin({ name })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        </div>
      )}
      <div className="pp-row"><b className="pp-l">People</b>
        <ul className="plist wrap">
          {people.map((p) => (
            <li key={p.id}><span>{p.isHost ? '👑 ' : ''}{p.name}{p.id === you?.id ? ' (you)' : ''}{p.connected ? '' : ' (away)'}</span>
              {isHost && p.id !== you?.id && <button className="btn ghost sm" onClick={() => confirm(`Remove ${p.name}?`) && net.kick(p.id)}>Kick</button>}</li>
          ))}
        </ul>
      </div>
      {isHost && <p className="muted small">Tip: drag anyone on the dance floor to move them.</p>}
    </div>
  );
}
