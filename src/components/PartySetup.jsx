import React, { useEffect, useMemo, useState } from 'react';
import { EXAMPLES } from '../lib/examples.js';
import { exampleToSaved } from '../lib/exampleSaved.js';
import { partyExists } from '../lib/net.js';

const NICKS = ['Disco Dave', 'Wiggles', 'Captain Groove', 'Noodle', 'Sir Bops-a-lot'];

/** Create or join a party: pick a name and which character to bring. */
export default function PartySetup({ intent, library, preselect, onDraw, onEnter, onBack }) {
  const joining = intent.mode === 'join';
  const [code, setCode] = useState(intent.code || '');
  const [partyName, setPartyName] = useState('');
  const [nick, setNick] = useState(() => { try { return localStorage.getItem('mp_nick') || ''; } catch { return ''; } });
  const [pick, setPick] = useState(preselect || null);
  const [info, setInfo] = useState(null);       // null=unknown, false=missing, {name,players,full}
  const examples = useMemo(() => EXAMPLES.map((e) => ({ ex: e, saved: exampleToSaved(e) })), []);

  useEffect(() => {
    if (!joining || code.length !== 6) { setInfo(null); return; }
    let live = true;
    partyExists(code.toUpperCase()).then((r) => { if (live) setInfo(r || false); });
    return () => { live = false; };
  }, [joining, code]);

  const all = [...library.map((s) => ({ key: s.id, saved: s, mine: true })), ...examples.map((e) => ({ key: e.saved.id, saved: e.saved }))];
  const chosen = all.find((o) => o.key === pick) || null;
  const ready = chosen && nick.trim() && (!joining || (code.length === 6 && info && !info.full));

  const go = () => {
    try { localStorage.setItem('mp_nick', nick.trim()); } catch { /* ignore */ }
    onEnter({ mode: intent.mode, code: code.toUpperCase(), partyName: partyName.trim(), userName: nick.trim(), saved: chosen.saved });
  };

  return (
    <section className="psetup">
      <div className="page-head">
        <h1>{joining ? 'Join the party' : 'Throw a party'}</h1>
        <p className="muted">{joining ? 'Pick who you are, then walk in.' : 'You will be the host: you pick the theme, lights and music.'}</p>
      </div>

      <div className="psetup-grid">
        <div className="card pform">
          {joining ? (
            <>
              <label className="lbl">Party code</label>
              <input className="input code-input" maxLength={6} value={code} placeholder="ABC123"
                onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())} />
              {code.length === 6 && info === false && <p className="error">No party with that code. Check the link?</p>}
              {info && <p className="ok">🎉 <b>{info.name}</b> — {info.players} here{info.full ? ' (full!)' : ''}</p>}
            </>
          ) : (
            <>
              <label className="lbl">Party name</label>
              <input className="input" maxLength={40} value={partyName} placeholder="Friday Wiggle Night" onChange={(e) => setPartyName(e.target.value)} />
            </>
          )}
          <label className="lbl">Your name at the party</label>
          <input className="input" maxLength={20} value={nick} placeholder="e.g. Noodle" onChange={(e) => setNick(e.target.value)} />
          <div className="chips">{NICKS.map((n) => <button key={n} className="chip" onClick={() => setNick(n)}>{n}</button>)}</div>
          <div className="spacer" />
          <button className="btn primary big wide" disabled={!ready} onClick={go}>{joining ? 'Walk in →' : 'Open the doors →'}</button>
          <button className="btn ghost wide" onClick={onBack}>← Back</button>
        </div>

        <div className="card pchars">
          <div className="pchars-head">
            <h3>Who are you bringing?</h3>
            <button className="btn ghost sm" onClick={onDraw}>✏️ Draw a new one</button>
          </div>
          <div className="pick-grid">
            {all.map((o) => (
              <button key={o.key} className={`pick ${pick === o.key ? 'on' : ''}`} onClick={() => setPick(o.key)}>
                <img src={o.saved.artwork} alt="" />
                <span>{o.saved.name}{o.mine ? '' : ' ★'}</span>
              </button>
            ))}
          </div>
          <p className="muted small">★ = ready-made characters. Your own drawings show first.</p>
        </div>
      </div>
    </section>
  );
}
