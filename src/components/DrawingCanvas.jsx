import React, { useCallback, useEffect, useRef, useState } from 'react';

export const CANVAS_W = 640;
export const CANVAS_H = 640;

const COLORS = ['#1b1b2f', '#e63946', '#f4a261', '#f2c200', '#2a9d8f', '#3a86ff', '#7b2cbf', '#ff6fb5', '#8d6e63'];

/**
 * Paint-bucket: fill the closed shape under (x,y) with `color`, painted BEHIND the existing lines.
 * Returns false when nothing was filled (clicked a line, or the shape is not closed).
 */
export function floodFill(ctx, x, y, color) {
  const W = CANVAS_W, H = CANVAS_H;
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  const open = (i) => d[i * 4 + 3] < 140;
  let sx = Math.round(x), sy = Math.round(y), start = -1;
  for (let r = 0; r <= 3 && start < 0; r++) {
    for (let dy = -r; dy <= r && start < 0; dy++) for (let dx = -r; dx <= r; dx++) {
      const px = sx + dx, py = sy + dy; if (px < 0 || py < 0 || px >= W || py >= H) continue;
      if (open(py * W + px)) { start = py * W + px; break; }
    }
  }
  if (start < 0) return false;
  const seen = new Uint8Array(W * H), stack = [start]; seen[start] = 1;
  let count = 0, border = false;
  const region = [];
  while (stack.length) {
    const i = stack.pop(); region.push(i); count++;
    const px = i % W, py = (i / W) | 0;
    if (px === 0 || py === 0 || px === W - 1 || py === H - 1) border = true;
    if (px > 0 && !seen[i - 1] && open(i - 1)) { seen[i - 1] = 1; stack.push(i - 1); }
    if (px < W - 1 && !seen[i + 1] && open(i + 1)) { seen[i + 1] = 1; stack.push(i + 1); }
    if (py > 0 && !seen[i - W] && open(i - W)) { seen[i - W] = 1; stack.push(i - W); }
    if (py < H - 1 && !seen[i + W] && open(i + W)) { seen[i + W] = 1; stack.push(i + W); }
  }
  if (border || count > W * H * 0.45) return false;               // leaks to the outside = shape not closed
  // grow 2px under the anti-aliased line edges so no white halo shows between fill and line
  const mask = new Uint8Array(W * H);
  for (const i of region) {
    const px = i % W, py = (i / W) | 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const qx = px + dx, qy = py + dy; if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
      mask[qy * W + qx] = 1;
    }
  }
  const out = ctx.createImageData(W, H), o = out.data;
  const n = parseInt(color.slice(1), 16), R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255;
  for (let i = 0; i < W * H; i++) if (mask[i]) { o[i * 4] = R; o[i * 4 + 1] = G; o[i * 4 + 2] = B; o[i * 4 + 3] = 255; }
  const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
  tmp.getContext('2d').putImageData(out, 0, 0);
  ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.drawImage(tmp, 0, 0); ctx.restore();
  return true;
}

/** The same drawing without any paint-bucket fills: this is what the auto-rig analyses. */
export function renderInk(strokes) {
  const c = document.createElement('canvas'); c.width = CANVAS_W; c.height = CANVAS_H;
  const g = c.getContext('2d', { willReadFrequently: true });
  strokes.forEach((s) => { if (s.tool !== 'fill') paintStroke(g, s); });
  return c;
}

export function paintStroke(ctx, s) {
  if (s.tool === 'fill') { floodFill(ctx, s.x, s.y, s.color); return; }
  ctx.save();
  ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const p = s.points;
  if (p.length === 1) {
    ctx.beginPath(); ctx.arc(p[0].x, p[0].y, s.size / 2, 0, Math.PI * 2); ctx.fill();
  } else if (p.length > 1) {
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
      ctx.quadraticCurveTo(p[i].x, p[i].y, mx, my);
    }
    ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
    ctx.stroke();
  }
  ctx.restore();
}

export default function DrawingCanvas({ initialStrokes, onStrokesChange, onAnalyze }) {
  const canvasRef = useRef(null);
  const strokes = useRef(initialStrokes ? [...initialStrokes] : []);
  const redo = useRef([]);
  const current = useRef(null);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(6);
  const [msg, setMsg] = useState('');
  const [, bump] = useState(0);
  const rerender = () => bump((n) => n + 1);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    strokes.current.forEach((s) => paintStroke(ctx, s));
  }, []);

  useEffect(() => { redraw(); }, [redraw]);

  const commit = () => { onStrokesChange?.([...strokes.current]); rerender(); };

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * CANVAS_W) / r.width, y: ((e.clientY - r.top) * CANVAS_H) / r.height };
  };

  const down = (e) => {
    e.preventDefault();
    if (tool === 'fill') {
      const p = pos(e), ctx = canvasRef.current.getContext('2d');
      if (floodFill(ctx, p.x, p.y, color)) { strokes.current.push({ tool: 'fill', color, x: p.x, y: p.y }); redo.current = []; setMsg(''); redraw(); commit(); }
      else setMsg('Nothing to fill there. Click inside a CLOSED shape (like the head circle). If the paint would spill out, close the gap first.');
      return;
    }
    canvasRef.current.setPointerCapture(e.pointerId);
    current.current = { tool, color, size, points: [pos(e)] };
    paintStroke(canvasRef.current.getContext('2d'), current.current);
  };
  const move = (e) => {
    const s = current.current;
    if (!s) return;
    const p = pos(e);
    const last = s.points[s.points.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 1.2) return;
    s.points.push(p);
    // incremental straight segment while drawing; smoothed on release
    paintStroke(canvasRef.current.getContext('2d'), { ...s, points: [last, p] });
  };
  const up = () => {
    const s = current.current;
    if (!s) return;
    current.current = null;
    strokes.current.push(s);
    redo.current = [];
    redraw();
    commit();
  };

  const undo = useCallback(() => {
    const s = strokes.current.pop();
    if (s) { redo.current.push(s); redraw(); commit(); }
    // eslint-disable-next-line
  }, []);
  const redoFn = useCallback(() => {
    const s = redo.current.pop();
    if (s) { strokes.current.push(s); redraw(); commit(); }
    // eslint-disable-next-line
  }, []);
  const clear = () => {
    if (!strokes.current.length) return;
    strokes.current = []; redo.current = []; redraw(); commit();
  };

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      e.shiftKey ? redoFn() : undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redoFn]);

  const analyze = () => {
    const out = document.createElement('canvas');
    out.width = CANVAS_W; out.height = CANVAS_H;
    out.getContext('2d').drawImage(canvasRef.current, 0, 0);
    onAnalyze(out, [...strokes.current], renderInk(strokes.current));
  };

  const hasInk = strokes.current.some((s) => s.tool === 'pen');

  return (
    <div className="creator">
      <div className="card canvas-card">
        <div className="warnbar">⚠️ <b>Don't let hands or feet touch any other line</b> (head, body, the other arm or leg). Touching parts get glued together and the arm or leg ends up <b>broken</b> when you move. Leave a small gap, even for hands near the body.</div>
        <div className="canvas-wrap">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className={`draw-canvas ${tool}`}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
          {!hasInk && (
            <div className="canvas-hint">
              <b>Draw yourself. Any pose. Go wild.</b>
              <span>Closed circle for the head, separate lines for arms and legs. Keep hands apart from other parts.</span>
            </div>
          )}
        </div>
      </div>

      <aside className="card tools">
        <h3>Tools</h3>
        <div className="seg">
          <button className={tool === 'pen' ? 'on' : ''} onClick={() => setTool('pen')}>✏️ Pen</button>
          <button className={tool === 'fill' ? 'on' : ''} onClick={() => setTool('fill')}>🪣 Fill</button>
          <button className={tool === 'eraser' ? 'on' : ''} onClick={() => setTool('eraser')}>🧽 Oops</button>
        </div>
        {tool === 'fill' && <p className="note">Pick a colour, then click inside a closed shape (head, hat, belly…) to colour it in. One click!</p>}
        {msg && <p className="error">{msg}</p>}

        <label className="lbl">Brush size <span>{size}px</span></label>
        <input type="range" min="2" max="24" value={size} onChange={(e) => setSize(+e.target.value)} />
        <div className="size-preview">
          <i style={{ width: size, height: size, background: tool !== 'eraser' ? color : '#cfd3e6' }} />
        </div>

        <label className="lbl">Color</label>
        <div className="swatches">
          {COLORS.map((c) => (
            <button key={c} className={`sw ${color === c && tool !== 'eraser' ? 'on' : ''}`} style={{ background: c }}
              onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen'); }} aria-label={`Color ${c}`} />
          ))}
          <label className="sw custom" title="Custom color">+
            <input type="color" value={color} onChange={(e) => { setColor(e.target.value); if (tool === 'eraser') setTool('pen'); }} />
          </label>
        </div>

        <div className="row">
          <button className="btn ghost" onClick={undo} disabled={!strokes.current.length}>↶ Undo</button>
          <button className="btn ghost" onClick={redoFn} disabled={!redo.current.length}>↷ Redo</button>
        </div>
        <button className="btn ghost wide" onClick={clear} disabled={!strokes.current.length}>Clear canvas</button>

        <div className="spacer" />
        <button className="btn primary wide big" onClick={analyze} disabled={!hasInk}>
          Rig my doodle →
        </button>
        <div className="tips">
          <b>📝 Draw it clearly so it dances well</b>
          <ul>
            <li>Keep <b>hands and feet away</b> from the head, body and other limbs. Touching lines get stuck together when you move.</li>
            <li>Leave a little <b>gap between arms/legs and the body</b> outline (a limb can start at the shoulder or hip).</li>
            <li>Close the <b>head circle</b> completely. It's how we find the head, and it lets you Fill the face.</li>
            <li>Simple lines are best: 2 arms, 2 legs, one body. Decorations (hair, hats) are fine on the head.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
