import React, { useCallback, useEffect, useState } from 'react';
import DrawingCanvas, { CANVAS_W, CANVAS_H } from './components/DrawingCanvas.jsx';
import RigEditor from './components/RigEditor.jsx';
import CharacterView from './components/CharacterView.jsx';
import LiveStage from './components/LiveStage.jsx';
import PartySetup from './components/PartySetup.jsx';
import PartyRoom from './components/PartyRoom.jsx';
import ExampleGallery, { renderStrokes } from './components/ExampleGallery.jsx';
import { analyzeMask, maskFromRGBA } from './lib/rig.js';
import { createCharacter, demoAngles } from './lib/character.js';
import { deleteCharacter, listCharacters, newId, saveCharacter } from './lib/storage.js';

const STEPS = [
  { id: 'draw', label: 'Draw' },
  { id: 'rig', label: 'Rig check' },
  { id: 'name', label: 'Name' },
  { id: 'stage', label: 'Move' },
];
const NAME_IDEAS = ['Mochi', 'Pixel', 'Kiki', 'Shadow', 'Nova', 'Bean'];

function Logo() {
  return (
    <div className="logo">
      <svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">
        <rect x="2" y="2" width="36" height="36" rx="10" fill="#ffd23f" stroke="#1b1b2f" strokeWidth="3" />
        <circle cx="20" cy="12" r="4.2" fill="#fff" stroke="#1b1b2f" strokeWidth="2.6" />
        <path d="M20 17v9M20 20l-7 5M20 20l8-6M20 26l-5 8M20 26l6 8" stroke="#1b1b2f" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      </svg>
      <span>DoodleDance</span>
    </div>
  );
}

function Steps({ screen }) {
  const idx = STEPS.findIndex((s) => s.id === screen);
  if (idx < 0) return null;
  return (
    <ol className="steps">
      {STEPS.map((s, i) => (
        <li key={s.id} className={i === idx ? 'cur' : i < idx ? 'done' : ''}><b>{i < idx ? '✓' : i + 1}</b>{s.label}</li>
      ))}
    </ol>
  );
}

export default function App() {
  const [screen, setScreen] = useState('home');
  const [library, setLibrary] = useState([]);
  const [strokes, setStrokes] = useState([]);
  const [draft, setDraft] = useState(null);      // { artwork(canvas), rgba, w, h, analysis, rig }
  const [character, setCharacter] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [partyIntent, setPartyIntent] = useState(null);   // {mode:'create'|'join', code?}
  const [session, setSession] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setLibrary(listCharacters());
    const m = location.pathname.match(/^\/party\/([A-Za-z0-9]{6})\/?$/);
    if (m) { setPartyIntent({ mode: 'join', code: m[1].toUpperCase() }); setScreen('party-setup'); }
  }, []);

  const goHome = (msg = '') => { setSession(null); setPartyIntent(null); setNotice(typeof msg === 'string' ? msg : ''); history.replaceState(null, '', '/'); setScreen('home'); };
  const startParty = (intent) => { setPartyIntent(intent); setScreen('party-setup'); };
  const enterParty = (s) => { setSession(s); setScreen('party-room'); };

  const analyze = useCallback((canvas, nextStrokes, inkCanvas) => {
    const rgba = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, CANVAS_W, CANVAS_H).data;
    // the rig is found from the line art only (colour fills would look like giant blobs)
    const inkRgba = (inkCanvas || canvas).getContext('2d', { willReadFrequently: true }).getImageData(0, 0, CANVAS_W, CANVAS_H).data;
    const analysis = analyzeMask(maskFromRGBA(inkRgba, CANVAS_W, CANVAS_H), CANVAS_W, CANVAS_H);
    if (analysis.empty) { alert('The canvas looks empty — draw a figure first.'); return; }
    setStrokes(nextStrokes);
    setDraft({ artwork: canvas, rgba, inkRgba, w: CANVAS_W, h: CANVAS_H, analysis, rig: null });
    setScreen('rig');
  }, []);

  const reanalyze = () => {
    const analysis = analyzeMask(maskFromRGBA(draft.inkRgba || draft.rgba, draft.w, draft.h), draft.w, draft.h);
    setDraft({ ...draft, analysis: { ...analysis } });
  };

  const toName = async (rig) => {
    setBusy(true);
    const saved = {
      id: newId(), name: '', artwork: draft.artwork.toDataURL('image/png'),
      size: { w: draft.w, h: draft.h },
      rig: { joints: rig.joints, headRadius: rig.headRadius, strokeWidth: rig.strokeWidth, bbox: rig.bbox },
    };
    const ch = await createCharacter(saved);
    setCharacter({ ...ch, savedRaw: saved });
    setName(presetName);
    setBusy(false);
    setScreen('name');
  };

  const save = () => {
    const finalName = name.trim() || 'Mochi';
    const raw = { ...character.savedRaw, name: finalName, createdAt: Date.now() };
    setLibrary(saveCharacter(raw));
    setCharacter({ ...character, name: finalName, savedRaw: raw });
    if (partyIntent) { setLastSaved(raw.id); setScreen('party-setup'); return; }
    setScreen('stage');
  };

  const play = async (saved) => {
    setBusy(true);
    setCharacter({ ...(await createCharacter(saved)), savedRaw: saved });
    setBusy(false);
    setScreen('stage');
  };

  const useExample = (ex) => {
    const canvas = renderStrokes(ex.strokes, CANVAS_W);
    const rgba = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, CANVAS_W, CANVAS_H).data;
    let minx = CANVAS_W, miny = CANVAS_H, maxx = 0, maxy = 0;
    for (let i = 0; i < CANVAS_W * CANVAS_H; i++) {
      if (rgba[i * 4 + 3] < 40) continue;
      const x = i % CANVAS_W, y = (i / CANVAS_W) | 0;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    const analysis = { joints: ex.joints, headRadius: ex.headRadius, strokeWidth: 7, bbox: { minx, miny, maxx, maxy }, warnings: [], method: 'example', headMethod: 'example', confidence: 1, skeleton: [] };
    setStrokes(ex.strokes);
    setPresetName(ex.name);
    setDraft({ artwork: canvas, rgba, w: CANVAS_W, h: CANVAS_H, analysis, rig: null, example: true });
    setScreen('rig');
  };
  const startNew = () => { setPresetName(''); setStrokes([]); setDraft(null); setScreen('draw'); };
  const drawForParty = () => { startNew(); };
  const remix = (ex) => { setStrokes(ex.strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }))); setDraft(null); setScreen('draw'); };

  

  useEffect(() => { document.body.classList.toggle('in-room', screen === 'party-room'); }, [screen]);

  return (
    <div className="app">
      {screen !== 'party-room' && <header className="top">
        <button className="logo-btn" onClick={() => (screen === 'party-room' ? (confirm('Leave the party?') && goHome()) : goHome())}><Logo /></button>
        <Steps screen={screen} />
        <span className="top-spacer" />
      </header>}

      <main className="main">
        {screen === 'home' && (
          <section className="home">
            <div className="hero">
              <span className="eyebrow">Draw it. Wiggle it. Party.</span>
              <h1>Turn your <em>doodle</em> into a dancing fool.</h1>
              <p>
                Scribble a stick figure in any pose. We rig your exact drawing and your webcam makes it dance.
                Your hair, your face, your questionable hat — all yours.
              </p>
              <div className="hero-btns">
                <button className="btn primary big" onClick={() => { setPartyIntent(null); startNew(); }}>✏️ Draw a character</button>
                <button className="btn big yellow" onClick={() => startParty({ mode: 'create' })}>🎉 Host a party</button>
              </div>
              <form className="joinrow" onSubmit={(e) => { e.preventDefault(); if (joinCode.length === 6) startParty({ mode: 'join', code: joinCode }); }}>
                <input className="input sm code-input" maxLength={6} placeholder="PARTY CODE" value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())} />
                <button className="btn ghost" disabled={joinCode.length !== 6}>🔗 Join</button>
              </form>
              {notice && <p className="error">{notice}</p>}
            </div>

            <ExampleGallery onUse={useExample} onRemix={remix} />

            <div className="lib-head"><h2>Your characters</h2></div>
            {library.length === 0 ? (
              <div className="card empty">Nobody here yet. Draw someone (or borrow a friend above).</div>
            ) : (
              <div className="grid">
                {library.map((c) => (
                  <div className="card char" key={c.id}>
                    <div className="thumb"><img src={c.artwork} alt={c.name} /></div>
                    <div className="char-meta">
                      <b>{c.name}</b>
                      <div className="row">
                        <button className="btn primary sm" onClick={() => play(c)} disabled={busy}>Play</button>
                        <button className="btn ghost sm" onClick={() => setLibrary(deleteCharacter(c.id))}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="card roadmap">
              <h3>Party time</h3>
              <p className="muted">
                Host a party, copy the invite link, and everyone appears on the same dance floor as their own doodle.
                Pick from 10 themes, set the lights, and play synced music (built-in tracks, an uploaded file, or a YouTube link).
              </p>
            </div>
          </section>
        )}

        {screen === 'draw' && (
          <section>
            <div className="page-head"><h1>Create Your Character</h1><p className="muted">Draw yourself in any pose. Keep arms, legs and hands clear of each other so you can dance properly.</p></div>
            <DrawingCanvas initialStrokes={strokes} onStrokesChange={setStrokes} onAnalyze={analyze} />
            <ExampleGallery onUse={useExample} onRemix={remix} title="Or skip the drawing" />
          </section>
        )}

        {screen === 'rig' && draft && (
          <section>
            <div className="page-head"><h1>Check the skeleton</h1><p className="muted">We guessed where your joints are. Drag any dot that's in the wrong spot.</p>
            <div className="warnbar">Arm or leg looks cut, short or glued to something? That happens when a hand or foot touches another line. <button className="btn sm ghost" onClick={() => setScreen('draw')}>← Back to drawing</button> and leave a small gap, or drag the dots to fix it.</div></div>
            <RigEditor key={draft.analysis.joints.HEAD.x + '-' + draft.analysis.headRadius + '-' + (draft.analysis.skeleton?.length || 0)}
              draft={draft} onBack={() => setScreen('draw')} onReanalyze={reanalyze} onContinue={toName} />
          </section>
        )}

        {screen === 'name' && character && (
          <section className="name-step">
            <div className="card name-card">
              <div className="name-preview">
                <CharacterView character={{ ...character, name: name.trim() || 'Your character' }} getAngles={(t) => demoAngles('dance', t)} />
              </div>
              <div className="name-form">
                <h1>Name your weirdo</h1>
                <p className="muted">This is the tag floating above your head at the party.</p>
                <input className="input" autoFocus maxLength={16} placeholder="e.g. Mochi" value={name}
                  onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
                <div className="chips">
                  {NAME_IDEAS.map((n) => <button key={n} className="chip" onClick={() => setName(n)}>{n}</button>)}
                </div>
                <button className="btn primary big" onClick={save}>Save & wiggle →</button>
                <button className="btn ghost" onClick={() => setScreen('rig')}>← Back to rig</button>
              </div>
            </div>
          </section>
        )}

        {screen === 'stage' && character && (
          <section>
            <div className="page-head"><h1>Now move!</h1><p className="muted">Start the camera and your doodle copies you. Left arm moves the left arm. Right moves the right. Revolutionary.</p></div>
            <LiveStage character={character} onBack={() => setScreen('home')} />
          </section>
        )}

        {screen === 'party-setup' && partyIntent && (
          <PartySetup intent={partyIntent} library={library} preselect={lastSaved} onDraw={drawForParty} onBack={goHome} onEnter={enterParty} />
        )}
        {screen === 'party-room' && session && <PartyRoom session={session} onExit={goHome} />}
      </main>
    </div>
  );
}
