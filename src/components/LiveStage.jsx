import React, { useCallback, useEffect, useRef, useState } from 'react';
import CharacterView from './CharacterView.jsx';
import { DEMOS, demoAngles } from '../lib/character.js';
import { activity } from '../lib/retarget.js';
import { PoseTracker, PREVIEW_LINES } from '../lib/pose.js';

const GROUPS = [
  { label: 'Left arm', keys: ['uaL', 'laL'], cls: 'l' },
  { label: 'Right arm', keys: ['uaR', 'laR'], cls: 'r' },
  { label: 'Left leg', keys: ['ulL', 'llL'], cls: 'l' },
  { label: 'Right leg', keys: ['ulR', 'llR'], cls: 'r' },
];

export default function LiveStage({ character, onBack }) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const trackerRef = useRef(null);
  const streamRef = useRef(null);
  const latest = useRef(null);
  const lastVideoTime = useRef(-1);
  const fpsRef = useRef({ n: 0, t: performance.now(), v: 0 });
  const [status, setStatus] = useState('idle'); // idle | loading | running | error
  const [error, setError] = useState('');
  const [demo, setDemo] = useState('dance');
  const [follow, setFollow] = useState({ followPosition: true, followScale: true });
  const [meters, setMeters] = useState({});
  const [fps, setFps] = useState(0);
  const [person, setPerson] = useState(false);
  const followRef = useRef(follow); followRef.current = follow;
  const statusRef = useRef(status); statusRef.current = status;
  const demoRef = useRef(demo); demoRef.current = demo;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    latest.current = null;
    setStatus('idle'); setPerson(false);
  }, []);

  useEffect(() => () => { stop(); trackerRef.current?.close(); }, [stop]);

  const start = async () => {
    setError(''); setStatus('loading');
    try {
      if (!trackerRef.current) trackerRef.current = new PoseTracker();
      await trackerRef.current.init(); // downloads the BlazePose model on first use
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      v.srcObject = stream;
      await v.play();
      trackerRef.current.calibrate();
      setStatus('running');
    } catch (e) {
      console.error(e);
      setError(e?.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access in your browser and try again.'
        : `Could not start tracking: ${e?.message || e}`);
      stop(); setStatus('error');
    }
  };

  // Called every render frame by CharacterView.
  const getAngles = useCallback((t) => {
    if (statusRef.current !== 'running') return demoAngles(demoRef.current, t);
    const v = videoRef.current, tr = trackerRef.current;
    if (v && tr && v.currentTime !== lastVideoTime.current) {
      lastVideoTime.current = v.currentTime;
      const det = tr.detect(v, performance.now(), followRef.current);
      const f = fpsRef.current; f.n++;
      const now = performance.now();
      if (now - f.t > 1000) { f.v = f.n; f.n = 0; f.t = now; }
      if (det) { latest.current = det.angles; drawPreview(det.landmarks); }
      else { latest.current = null; clearPreview(); }
    }
    return latest.current || {};
  }, []);

  const clearPreview = () => {
    const o = overlayRef.current; if (o) o.getContext('2d').clearRect(0, 0, o.width, o.height);
  };
  const drawPreview = (lms) => {
    const o = overlayRef.current; if (!o) return;
    const c = o.getContext('2d');
    c.clearRect(0, 0, o.width, o.height);
    c.lineWidth = 3; c.lineCap = 'round';
    const col = (i) => (i === 11 || i === 13 || i === 15 || i === 23 || i === 25 || i === 27 ? '#2f7cff' : '#ff8a1f');
    for (const [a, b] of PREVIEW_LINES) {
      const A = lms[a], B = lms[b];
      if ((A.visibility ?? 1) < 0.4 || (B.visibility ?? 1) < 0.4) continue;
      c.strokeStyle = col(a === 11 && b === 12 ? 11 : b);
      c.beginPath(); c.moveTo(A.x * o.width, A.y * o.height); c.lineTo(B.x * o.width, B.y * o.height); c.stroke();
    }
  };

  // Activity meters + fps (8 Hz), proving each limb group is driven separately.
  const onFrame = useCallback((angles) => { latest.current = latest.current; return angles; }, []);
  useEffect(() => {
    const id = setInterval(() => {
      const a = statusRef.current === 'running' ? latest.current : demoAngles(demoRef.current, performance.now() / 1000);
      const act = activity(character.rest, a || {});
      const m = {};
      GROUPS.forEach((g) => { m[g.label] = Math.min(1, Math.max(...g.keys.map((k) => act[k])) / 1.4); });
      setMeters(m);
      setFps(fpsRef.current.v);
      setPerson(statusRef.current === 'running' && !!latest.current);
    }, 125);
    return () => clearInterval(id);
  }, [character]);

  const running = status === 'running';

  return (
    <div className="live">
      <div className="card stage-card">
        <CharacterView character={character} getAngles={getAngles} onFrame={onFrame} />
        <div className="stage-badge">
          {running ? (person ? '● Tracking' : '○ Step into view') : 'Preview mode'}
        </div>
      </div>

      <aside className="card tools">
        <h3>{character.name}</h3>

        <div className={`cam ${running ? 'on' : ''}`}>
          <div className="cam-inner">
            <video ref={videoRef} playsInline muted className="cam-video" />
            <canvas ref={overlayRef} width="320" height="240" className="cam-overlay" />
            {!running && <div className="cam-empty">{status === 'loading' ? 'Loading BlazePose model…' : 'Camera is off'}</div>}
          </div>
          <p className="muted small">Your video never leaves this device — only joint angles are used.</p>
        </div>

        {!running ? (
          <button className="btn primary wide big" onClick={start} disabled={status === 'loading'}>
            {status === 'loading' ? 'Starting…' : '📷 Start camera'}
          </button>
        ) : (
          <div className="row">
            <button className="btn ghost" onClick={() => trackerRef.current.calibrate()}>Recalibrate</button>
            <button className="btn ghost" onClick={stop}>Stop camera</button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {running && <p className="muted small">Stand back so your whole body is visible, then press Recalibrate. {fps ? `${fps} fps` : ''}</p>}

        <label className="toggle"><input type="checkbox" checked={follow.followPosition}
          onChange={(e) => setFollow({ ...follow, followPosition: e.target.checked })} /><span>Follow my position</span></label>
        <label className="toggle"><input type="checkbox" checked={follow.followScale}
          onChange={(e) => setFollow({ ...follow, followScale: e.target.checked })} /><span>Scale when I move closer</span></label>

        <h4>Limb activity</h4>
        <div className="meters">
          {GROUPS.map((g) => (
            <div key={g.label} className="meter">
              <span>{g.label}</span>
              <div className="bar"><i className={g.cls} style={{ width: `${Math.round((meters[g.label] || 0) * 100)}%` }} /></div>
            </div>
          ))}
        </div>

        {!running && (
          <>
            <h4>Self-test (no camera needed)</h4>
            <div className="chips">
              {DEMOS.map((d) => (
                <button key={d.id} className={`chip ${demo === d.id ? 'on' : ''}`} onClick={() => setDemo(d.id)}>{d.label}</button>
              ))}
            </div>
          </>
        )}
        <div className="spacer" />
        <button className="btn ghost wide" onClick={() => { stop(); onBack(); }}>← Back to characters</button>
      </aside>
    </div>
  );
}
