import React, { useEffect, useMemo, useRef, useState } from 'react';
import { bindPixels } from '../lib/binding.js';
import { BONE_IDS } from '../lib/skeleton.js';

const BONE_COLORS = {
  head: '#ff4fa3', torso: '#7b61ff',
  uaL: '#2f7cff', laL: '#00b3ff', uaR: '#ff8a1f', laR: '#ffc400',
  ulL: '#14b87a', llL: '#6ee05a', ulR: '#e8453c', llR: '#ff9aa2',
};
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const LINKS = [
  ['HEAD', 'NECK', 'c'], ['NECK', 'PELVIS', 'c'],
  ['NECK', 'LEFT_SHOULDER', 'dL'], ['LEFT_SHOULDER', 'LEFT_ELBOW', 'L'], ['LEFT_ELBOW', 'LEFT_WRIST', 'L'],
  ['NECK', 'RIGHT_SHOULDER', 'dR'], ['RIGHT_SHOULDER', 'RIGHT_ELBOW', 'R'], ['RIGHT_ELBOW', 'RIGHT_WRIST', 'R'],
  ['PELVIS', 'LEFT_HIP', 'dL'], ['LEFT_HIP', 'LEFT_KNEE', 'L'], ['LEFT_KNEE', 'LEFT_ANKLE', 'L'],
  ['PELVIS', 'RIGHT_HIP', 'dR'], ['RIGHT_HIP', 'RIGHT_KNEE', 'R'], ['RIGHT_KNEE', 'RIGHT_ANKLE', 'R'],
];
const LINK_COLOR = { c: '#7b61ff', L: '#2f7cff', R: '#ff8a1f', dL: '#2f7cff', dR: '#ff8a1f' };

const NICE = (n) => n.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');

export default function RigEditor({ draft, onBack, onReanalyze, onContinue }) {
  const { analysis, artwork } = draft;
  const [joints, setJoints] = useState(analysis.joints);
  const [headR, setHeadR] = useState(analysis.headRadius);
  const [labels, setLabels] = useState(true);
  const [showBinding, setShowBinding] = useState(false);
  const baseRef = useRef(null);
  const bindRef = useRef(null);
  const svgRef = useRef(null);
  const W = draft.w, H = draft.h;

  useEffect(() => { setJoints(analysis.joints); setHeadR(analysis.headRadius); }, [analysis]);

  useEffect(() => {
    const ctx = baseRef.current.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(artwork, 0, 0);
  }, [artwork, W, H]);

  // "Show binding": paint each artwork pixel with the colour of the bone it is attached to.
  useEffect(() => {
    if (!showBinding) return undefined;
    const t = setTimeout(() => {
      const rig = { joints, headRadius: headR };
      const assign = bindPixels(draft.rgba, W, H, rig);
      const img = new ImageData(W, H);
      for (let i = 0; i < W * H; i++) {
        const b = assign[i];
        if (b === 255) continue;
        const [r, g, bl] = hex(BONE_COLORS[BONE_IDS[b]]);
        img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = bl;
        img.data[i * 4 + 3] = Math.max(120, draft.rgba[i * 4 + 3]);
      }
      bindRef.current.getContext('2d').putImageData(img, 0, 0);
    }, 120);
    return () => clearTimeout(t);
  }, [showBinding, joints, headR, draft.rgba, W, H]);

  const toSvg = (e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: Math.max(0, Math.min(W, p.x)), y: Math.max(0, Math.min(H, p.y)) };
  };

  const startDrag = (e) => { e.currentTarget.setPointerCapture(e.pointerId); e.stopPropagation(); };
  const dragJoint = (name) => (e) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const p = toSvg(e);
    setJoints((j) => ({ ...j, [name]: { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 } }));
  };
  const dragHeadRadius = (e) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const p = toSvg(e);
    setHeadR(Math.max(8, Math.round(Math.hypot(p.x - joints.HEAD.x, p.y - joints.HEAD.y) * 10) / 10));
  };

  const dirty = useMemo(
    () => JSON.stringify(joints) !== JSON.stringify(analysis.joints) || headR !== analysis.headRadius,
    [joints, headR, analysis],
  );
  const names = Object.keys(joints);

  return (
    <div className="creator">
      <div className="card canvas-card">
        <div className="rig-title">
          <h2>Character Rig</h2>
          <span className={`pill ${analysis.warnings.length ? 'warn' : 'ok'}`}>
            {analysis.warnings.length ? 'Needs a quick check' : 'Looks good'}
          </span>
        </div>
        <div className="canvas-wrap rig-wrap">
          <canvas ref={baseRef} width={W} height={H} className="layer" style={{ opacity: showBinding ? 0.15 : 1 }} />
          <canvas ref={bindRef} width={W} height={H} className="layer" style={{ display: showBinding ? 'block' : 'none' }} />
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="layer overlay">
            {LINKS.map(([a, b, kind]) => (
              <line key={a + b} x1={joints[a].x} y1={joints[a].y} x2={joints[b].x} y2={joints[b].y}
                stroke={LINK_COLOR[kind]} strokeWidth={kind[0] === 'd' ? 2 : 3.5}
                strokeDasharray={kind[0] === 'd' ? '5 5' : undefined} strokeLinecap="round" opacity={0.85} />
            ))}
            <circle cx={joints.HEAD.x} cy={joints.HEAD.y} r={headR} fill="rgba(255,79,163,.07)"
              stroke="#ff4fa3" strokeWidth="2" strokeDasharray="6 5" />
            <circle cx={joints.HEAD.x + headR} cy={joints.HEAD.y} r="6" className="handle"
              onPointerDown={startDrag} onPointerMove={dragHeadRadius} />
            {names.map((n) => (
              <g key={n}>
                <circle cx={joints[n].x} cy={joints[n].y} r="9" className={`joint ${n.startsWith('LEFT') ? 'l' : n.startsWith('RIGHT') ? 'r' : 'c'}`}
                  onPointerDown={startDrag} onPointerMove={dragJoint(n)} />
                {labels && (
                  <text x={joints[n].x + (n.startsWith('LEFT') ? -14 : 14)} y={joints[n].y + 4}
                    textAnchor={n.startsWith('LEFT') ? 'end' : 'start'} className="jl">{NICE(n)}</text>
                )}
              </g>
            ))}
          </svg>
        </div>
      </div>

      <aside className="card tools">
        <h3>Check your rig</h3>
        <p className="muted small">
          Drag any dot to correct it. <b className="blue">Blue</b> = left side, <b className="orange">orange</b> = right side
          (as you see the drawing). The pink handle resizes the head.
        </p>

        {analysis.warnings.length > 0 && (
          <ul className="warnings">{analysis.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        )}

        <label className="toggle"><input type="checkbox" checked={showBinding} onChange={(e) => setShowBinding(e.target.checked)} />
          <span>Show which bone each line belongs to</span></label>
        <label className="toggle"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />
          <span>Joint labels</span></label>

        {showBinding && (
          <div className="legend">
            {BONE_IDS.map((b) => <span key={b}><i style={{ background: BONE_COLORS[b] }} />{b}</span>)}
          </div>
        )}
        <p className="muted small">
          Hair, eyes and hats should be <b style={{ color: BONE_COLORS.head }}>pink</b> (head). If an arm or leg has a stray color, move its elbow/knee.
        </p>

        <div className="spacer" />
        <button className="btn ghost wide" onClick={() => { setJoints(analysis.joints); setHeadR(analysis.headRadius); }} disabled={!dirty}>Reset my edits</button>
        <button className="btn ghost wide" onClick={onReanalyze}>↻ Re-analyze</button>
        <button className="btn ghost wide" onClick={onBack}>← Edit drawing</button>
        <button className="btn primary wide big" onClick={() => onContinue({ ...analysis, joints, headRadius: headR })}>
          Looks right — continue →
        </button>
      </aside>
    </div>
  );
}
