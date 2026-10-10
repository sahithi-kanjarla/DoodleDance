import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PartyClient } from '../lib/net.js';
import { MusicController } from '../lib/music.js';
import { PartyScene, anglesToArray } from '../lib/partyScene.js';
import { createCharacter } from '../lib/character.js';
import { PoseTracker } from '../lib/pose.js';
import { EMOTES } from '../../shared/constants.js';
import { EMOTE_INFO } from '../lib/emotes.js';
import { ThemePanel, MusicPanel, PeoplePanel } from './PartyPanels.jsx';
import { PREVIEW_LINES } from '../lib/pose.js';

const ERRORS = {
  'no-such-party': 'That party does not exist (or everyone left and it closed).',
  'server-busy': 'The server is full right now. Try again in a few minutes.',
  'party-full': 'This party is full (12 max).',
  'bad-character': 'Your character could not be sent. Try re-saving it.',
  'rejoin-failed': 'You were disconnected for too long. Rejoin from the link.',
};

const SIZES = ['s', 'm', 'l', 'xl'];

/** True on phones and short landscape screens, where the labeled bars do not fit. */
function useSmall(q = '(max-width: 900px), (max-height: 480px) and (max-width: 950px)') {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q), f = () => setM(mq.matches);
    mq.addEventListener('change', f); return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
}

export default function PartyRoom({ session, onExit }) {
  const canvasRef = useRef(null), ytRef = useRef(null), videoRef = useRef(null);
  const netRef = useRef(null), musicRef = useRef(null), sceneRef = useRef(null), trackerRef = useRef(null);
  const camRef = useRef(false), latest = useRef(null), lastVT = useRef(-1), streamRef = useRef(null);
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState('');
  const [you, setYou] = useState(null);
  const [code, setCode] = useState(session.code || '');
  const [room, setRoom] = useState(null);
  const [phase, setPhase] = useState({ phase: 'lobby', at: 0 });
  const [people, setPeople] = useState([]);
  const [musicInfo, setMusicInfo] = useState({ source: null, playing: false, title: '', needsGesture: true, volume: 0.8, muted: false });
  const [cam, setCam] = useState('off');           // off | loading | on
  const [camErr, setCamErr] = useState('');
  const [count, setCount] = useState(null);
  const [copied, setCopied] = useState(false);
  const [pop, setPop] = useState(null);          // 'theme' | 'music' | 'people' | null
  const [selfSize, setSelfSize] = useState('l');   // s | m | l | xl | hide
  const [isFs, setIsFs] = useState(false);
  const rootRef = useRef(null), overlayRef = useRef(null);
  const [, force] = useState(0);
  const small = useSmall();
  const [menu, setMenu] = useState(null);          // small screens: 'emotes' | 'more' | null
  if (!musicRef.current) musicRef.current = new MusicController({ getServerNow: () => netRef.current?.serverNow() ?? Date.now(), onChange: setMusicInfo });

  const drawSkeleton = (lms) => {
    const o = overlayRef.current; if (!o) return; const c = o.getContext('2d');
    c.clearRect(0, 0, o.width, o.height); if (!lms) return;
    c.lineWidth = 5; c.lineCap = 'round';
    for (const [a, b] of PREVIEW_LINES) {
      const A = lms[a], B = lms[b]; if ((A.visibility ?? 1) < 0.4 || (B.visibility ?? 1) < 0.4) continue;
      c.strokeStyle = [11, 13, 15, 23, 25, 27].includes(b) ? '#2f7cff' : '#ff8a1f';
      c.beginPath(); c.moveTo(A.x * o.width, A.y * o.height); c.lineTo(B.x * o.width, B.y * o.height); c.stroke();
    }
  };

  // ------------------------------------------------------------ connect
  useEffect(() => {
    const music = musicRef.current; music.attachYouTubeHost(ytRef.current);
    const scene = new PartyScene(canvasRef.current, { getEnergy: () => music.energy(), onMove: (id, x, y) => netRef.current?.move(id, x, y) });
    sceneRef.current = scene; scene.start();
    scene.localSource = () => {
      if (!camRef.current) return null;
      const v = videoRef.current, tr = trackerRef.current;
      if (v && tr && v.currentTime !== lastVT.current) {
        lastVT.current = v.currentTime;
        const det = tr.detect(v, performance.now(), { followPosition: true, followScale: true });
        latest.current = det ? det.angles : null;
        drawSkeleton(det?.landmarks);
      }
      return latest.current;
    };

    const addActor = async (p) => {
      try {
        const ch = await createCharacter({ id: p.id, name: p.name, artwork: p.character.artwork, size: p.character.size, rig: p.character.rig });
        scene.removeActor(p.id);
        scene.addActor({ id: p.id, name: p.name, character: ch, x: p.x, y: p.y, connected: p.connected });
      } catch (e) { console.error('character failed', e); }
    };
    const upsert = (p) => setPeople((l) => [...l.filter((q) => q.id !== p.id), { id: p.id, name: p.name, x: p.x, y: p.y, isHost: p.isHost, connected: p.connected }]);

    const net = new PartyClient({
      status: (st) => { setStatus(st); if (st === 'unreachable') setError('UNREACHABLE'); },
      welcome: (m) => {
        setYou(m.you); setCode(m.code); setRoom(m.room); setPhase({ phase: m.room.phase, at: m.room.phaseAt });
        scene.localId = m.you.id; scene.dragEnabled = m.you.isHost; scene.setSettings(m.room);
        for (const id of [...scene.actors.keys()]) scene.removeActor(id);
        setPeople(m.participants.map(({ character, ...p }) => p)); m.participants.forEach(addActor);
        music.setState(m.room.music);
        history.replaceState(null, '', `/party/${m.code}`);
      },
      joined: ({ participant }) => { upsert(participant); addActor(participant); },
      left: ({ id }) => { scene.removeActor(id); setPeople((l) => l.filter((p) => p.id !== id)); },
      presence: ({ id, connected }) => { scene.setPresence(id, connected); setPeople((l) => l.map((p) => (p.id === id ? { ...p, connected } : p))); },
      host: ({ id }) => {
        setPeople((l) => l.map((p) => ({ ...p, isHost: p.id === id })));
        setYou((y) => { if (y && y.id === id) { scene.dragEnabled = true; return { ...y, isHost: true }; } return y; });
      },
      pose: (m) => scene.setPose(m.id, m),
      emote: (m) => scene.emote(m.id, m.kind),
      settings: (m) => { setRoom((r) => ({ ...r, ...m.settings })); scene.setSettings(m.settings); },
      phase: (m) => setPhase({ phase: m.phase, at: m.at }),
      music: (m) => music.setState(m.music),
      move: (m) => { scene.setPos(m.id, m.x, m.y); setPeople((l) => l.map((p) => (p.id === m.id ? { ...p, x: m.x, y: m.y } : p))); },
      kicked: () => onExit('The host removed you from the party.'),
      error: (m) => { if (m.error === 'host-only') return; setError(ERRORS[m.error] || m.error); },
    });
    netRef.current = net;
    const user = { name: session.userName, character: { artwork: session.saved.artwork, size: session.saved.size, name: session.userName, rig: session.saved.rig } };
    if (session.mode === 'join') net.join(session.code, user); else net.create(session.partyName || 'Untitled Party', user);

    // ~20 Hz pose stream (angles only)
    const poseTimer = setInterval(() => {
      const a = latest.current;
      if (camRef.current && a) net.pose(anglesToArray(a), a.scale ?? 1, a.dx ?? 0, a.dy ?? 0);
    }, 50);
    const tick = setInterval(() => force((n) => n + 1), 1000);                // refresh latency etc.
    const unlockOnce = () => { music.unlock(); window.removeEventListener('pointerdown', unlockOnce); };
    window.addEventListener('pointerdown', unlockOnce);

    return () => {
      clearInterval(poseTimer); clearInterval(tick); window.removeEventListener('pointerdown', unlockOnce);
      streamRef.current?.getTracks().forEach((t) => t.stop()); trackerRef.current?.close();
      net.leave(); music.destroy(); scene.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------ countdown / GO
  const lastCount = useRef(null);
  useEffect(() => {
    const id = setInterval(() => {
      const net = netRef.current; if (!net || phase.phase !== 'live' || !phase.at) { setCount(null); lastCount.current = null; return; }
      const left = phase.at - net.serverNow();
      let c = null;
      if (left > 0) c = String(Math.ceil(left / 1000)); else if (left > -1200) c = 'PARTY!';
      if (c === 'PARTY!' && lastCount.current !== 'PARTY!') { const s = sceneRef.current; for (let i = 0; i < 4; i++) s.particles.burst('confetti', s.w * (0.15 + i * 0.23), s.h * 0.45); }
      lastCount.current = c; setCount(c);
    }, 100);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => { sceneRef.current?.setMusicPlaying(musicInfo.playing); }, [musicInfo.playing]);

  // emote hotkeys 1–8
  useEffect(() => {
    const k = (e) => { if (/input|textarea/i.test(e.target.tagName)) return; const i = +e.key - 1; if (i >= 0 && i < EMOTES.length) netRef.current?.emote(EMOTES[i]); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);

  // ------------------------------------------------------------ camera
  const startCam = async () => {
    setCamErr(''); setCam('loading');
    try {
      if (!trackerRef.current) trackerRef.current = new PoseTracker();
      await trackerRef.current.init();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
      streamRef.current = stream; const v = videoRef.current; v.srcObject = stream; await v.play();
      trackerRef.current.calibrate(); camRef.current = true; setCam('on');
    } catch (e) {
      setCamErr(e?.name === 'NotAllowedError' ? 'Camera blocked. Allow it in your browser, or just use emotes!' : `Camera problem: ${e?.message || e}`);
      setCam('off');
    }
  };
  const stopCam = () => {
    camRef.current = false; latest.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null; setCam('off');
  };

  const link = code ? `${location.origin}/party/${code}` : '';
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { prompt('Copy this link', link); } };
  const net = netRef.current;
  const isHost = !!you?.isHost;
  const unlock = useCallback(() => musicRef.current?.unlock(), []);
  const live = phase.phase === 'live';

  const toggleFs = () => { if (document.fullscreenElement) document.exitFullscreen(); else rootRef.current?.requestFullscreen?.().catch(() => {}); };
  useEffect(() => {
    const f = () => setIsFs(!!document.fullscreenElement);
    const k = (e) => { if (/input|textarea/i.test(e.target.tagName)) return; if (e.key === 'f' || e.key === 'F') toggleFs(); if (e.key === 'Escape') setPop(null); };
    document.addEventListener('fullscreenchange', f); window.addEventListener('keydown', k);
    return () => { document.removeEventListener('fullscreenchange', f); window.removeEventListener('keydown', k); };
  }, []);
  const togglePop = (n) => setPop((p) => (p === n ? null : n));

  if (error) return (
    <section className="card party-error"><h2>😬 Oops</h2>
      {error === 'UNREACHABLE'
        ? <p>Can't reach the party server. Parties need it running next to the app: stop everything, then run <b>npm run dev</b> (it starts both). If you deployed it, check the server is running.</p>
        : <p>{error}</p>}
      <button className="btn primary" onClick={() => onExit()}>Back home</button></section>
  );

  const presentCount = people.filter((p) => p.connected).length;
  return (
    <div className={`room ${isFs ? 'fs' : ''}`} ref={rootRef}>
      <div className="rbar top">
        {small ? (<>
        <div className="rbrand">🕺 <b>DoodleDance</b></div>
        <div className="rtitle"><b>{room?.name || 'Connecting…'}</b>
          <span>{status === 'online' ? `${presentCount} here · ${live ? 'LIVE' : 'lobby'}` : status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</span></div>
        {code && <><span className="code sm">{code}</span>
          <button className="ib" onClick={copy} title="Copy invite link" aria-label="Copy invite link">{copied ? '✓' : '🔗'}</button></>}
        </>) : (<>
        <div className="rbrand">🕺 <b>DoodleDance</b></div>
        <div className="rtitle"><b>{room?.name || 'Connecting…'}</b>
          <span>{status === 'online' ? `${presentCount} here · ${live ? 'LIVE' : 'lobby'}` : status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</span></div>
        <div className="rspace" />
        {code && <><span className="code sm">{code}</span><button className="btn primary sm" onClick={copy}>{copied ? '✓ Copied' : '🔗 Invite'}</button></>}
        <button className="btn ghost sm" onClick={toggleFs} title="Full screen (F)">{isFs ? '🗗 Exit full screen' : '⛶ Full screen'}</button>
        <button className="btn ghost sm danger" onClick={() => onExit()}>Leave</button>
        </>)}
      </div>

      <div className="rmid">
      <div className="rstage">
        <canvas ref={canvasRef} className="pstage-canvas" />
        {!live && status === 'online' && <div className="banner">🛋️ Lobby — {isHost ? 'press “Start party” when everyone is in' : 'waiting for the host to start the party'}</div>}
        {count && <div className={`count ${count === 'PARTY!' ? 'go' : ''}`} key={count}>{count}</div>}
        {status !== 'online' && <div className="overlay">{status === 'reconnecting' ? 'Reconnecting…' : 'Opening the doors…'}</div>}
        {isHost && !pop && <div className="hint">Drag anyone to move them</div>}
        {musicInfo.needsGesture && musicInfo.source && musicInfo.playing && <button className="btn primary unlockbtn" onClick={unlock}>🔊 Tap to hear the music</button>}


        <div className={`selfview ${selfSize} ${cam === 'off' || selfSize === 'hide' ? 'gone' : ''}`}>
          <video ref={videoRef} playsInline muted className="selfvideo" />
          <canvas ref={overlayRef} width="640" height="480" className="selfoverlay" />
          {cam === 'loading' && <div className="cam-empty">Loading BlazePose…</div>}
          <div className="selfctl">
            <button onClick={() => setSelfSize(SIZES[Math.max(0, SIZES.indexOf(selfSize) - 1)])} title="Smaller">−</button>
            <button onClick={() => setSelfSize(SIZES[Math.min(SIZES.length - 1, SIZES.indexOf(selfSize) + 1)])} title="Bigger">＋</button>
            <button onClick={() => trackerRef.current?.calibrate()} title="Recalibrate">⟳</button>
            <button onClick={() => setSelfSize('hide')} title="Hide">✕</button>
          </div>
        </div>
        <div className={`yt-dock ${musicInfo.source?.kind === 'youtube' ? 'show' : ''}`}>
          <div className="yt-mount" ref={ytRef} />
          {/* The shield stops clicks reaching the iframe: a local pause would be undone by the sync loop.
              The host's click is sent to the server so everyone pauses/plays together. */}
          <div className={`yt-shield ${isHost ? 'host' : ''}`} title={isHost ? (musicInfo.playing ? 'Pause for everyone' : 'Play for everyone') : 'The host controls the music'}
            onClick={() => { if (isHost && net) net.music(musicInfo.playing ? 'pause' : 'play'); }}>
            {isHost && <span className="yt-ico">{musicInfo.playing ? '⏸' : '▶'}</span>}
          </div>
        </div>
      </div>

      {pop && (
        <aside className="side">
          <div className="side-head"><h3>{pop === 'theme' ? '🎨 Theme & lights' : pop === 'music' ? '🎵 Music' : '👥 People'}</h3>
            <button className="side-x" onClick={() => setPop(null)} aria-label="Close">✕</button></div>
          <div className="side-body">
            {pop === 'theme' && isHost && room && <ThemePanel net={net} room={room} />}
            {pop === 'music' && <MusicPanel net={net} isHost={isHost} music={musicRef.current} info={musicInfo} />}
            {pop === 'people' && <PeoplePanel net={net} room={room} people={people} you={you} isHost={isHost} />}
          </div>
        </aside>
      )}
      </div>

      {small && menu === 'emotes' && (
        <div className="emote-pop" role="menu">
          {EMOTES.map((k) => <button key={k} className="emote2" onClick={() => { net?.emote(k); setMenu(null); }} title={EMOTE_INFO[k].label} aria-label={EMOTE_INFO[k].label}>{EMOTE_INFO[k].emoji}</button>)}
        </div>
      )}
      {small && menu === 'more' && (
        <div className="more-pop" role="menu">
          <button onClick={() => setMenu('emotes')}>😀 Emotes</button>
          <button onClick={() => { togglePop('people'); setMenu(null); }}>👥 People ({presentCount})</button>
          {isHost && <button onClick={() => { togglePop('theme'); setMenu(null); }}>🎨 Theme &amp; lights</button>}
          <button onClick={() => { toggleFs(); setMenu(null); }}>{isFs ? '🗗 Exit full screen' : '⛶ Full screen'}</button>
        </div>
      )}
      <div className="rbar bottom">
        {small ? (<>
        {cam === 'on'
          ? <button className="ib lg on" onClick={() => (selfSize === 'hide' ? setSelfSize('l') : stopCam())} title={selfSize === 'hide' ? 'Show my camera' : 'Turn camera off'} aria-label="Camera">📷</button>
          : <button className="ib lg" onClick={startCam} disabled={cam === 'loading'} title="Start camera" aria-label="Start camera">{cam === 'loading' ? '⏳' : '📷'}</button>}
        <button className={`ib lg ${pop === 'music' ? 'on' : ''}`} onClick={() => togglePop('music')} title="Music" aria-label="Music">🎵</button>
        {isHost && <button className={`pill ${live ? 'live' : ''}`} onClick={() => net.phase(live ? 'lobby' : 'live')}>{live ? '⏹ End party' : '🎉 Start party'}</button>}
        <button className={`ib lg ${menu ? 'on' : ''}`} onClick={() => setMenu(menu ? null : 'more')} title="More" aria-label="More options">⋯</button>
        <button className="ib lg leave" onClick={() => onExit()} title="Leave party" aria-label="Leave party">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="#fff" transform="rotate(135 12 12)" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.6 21 3 13.4 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z" /></svg>
        </button>
        </>) : (<>
        <div className="emotes2">
          {EMOTES.map((k, i) => <button key={k} className="emote2" onClick={() => net?.emote(k)} title={`${EMOTE_INFO[k].label} (${i + 1})`}>{EMOTE_INFO[k].emoji}</button>)}
        </div>
        <div className="rsep" />
        {cam === 'on'
          ? <button className="tb on" onClick={() => (selfSize === 'hide' ? setSelfSize('l') : stopCam())}>📷 <span>{selfSize === 'hide' ? 'Show me' : 'Camera on'}</span></button>
          : <button className="tb" onClick={startCam} disabled={cam === 'loading'}>📷 <span>{cam === 'loading' ? 'Loading…' : 'Start camera'}</span></button>}
        {isHost && <button className={`tb ${pop === 'theme' ? 'on' : ''}`} onClick={() => togglePop('theme')}>🎨 <span>Theme</span></button>}
        <button className={`tb ${pop === 'music' ? 'on' : ''}`} onClick={() => togglePop('music')}>🎵 <span>Music</span></button>
        <button className={`tb ${pop === 'people' ? 'on' : ''}`} onClick={() => togglePop('people')}>👥 <span>{isHost ? 'People' : `People (${presentCount})`}</span></button>
        {isHost && <button className={`tb go ${live ? 'live' : ''}`} onClick={() => net.phase(live ? 'lobby' : 'live')}>{live ? '⏹ End party' : '🎉 Start party'}</button>}
        </>)}
        {camErr && <span className="camerr">{camErr}</span>}
      </div>
    </div>
  );
}
