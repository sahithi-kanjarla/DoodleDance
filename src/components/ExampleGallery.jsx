import React, { useMemo } from 'react';
import { EXAMPLES } from '../lib/examples.js';
import { paintStroke } from './DrawingCanvas.jsx';

export function renderStrokes(strokes, size = 640) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  strokes.forEach((s) => paintStroke(ctx, s));
  return c;
}

const TILTS = [-1.6, 1.2, -0.8, 1.8, -1.2, 0.9, -1.8, 1.4];

export default function ExampleGallery({ onUse, onRemix, title = 'Too lazy to draw? Borrow a friend.' }) {
  const thumbs = useMemo(() => EXAMPLES.map((e) => renderStrokes(e.strokes, 640).toDataURL('image/png')), []);
  return (
    <section className="gallery">
      <div className="gallery-head">
        <h2>{title}</h2>
        <p className="muted">Pre-rigged and ready to wiggle. Use as is, or remix in the editor.</p>
      </div>
      <div className="gallery-grid">
        {EXAMPLES.map((e, i) => (
          <article className="ex" key={e.id} style={{ '--tilt': `${TILTS[i % TILTS.length]}deg` }}>
            <div className="ex-thumb"><img src={thumbs[i]} alt={e.name} /></div>
            <div className="ex-meta">
              <b>{e.name}</b>
              <span className="muted small">{e.tagline}</span>
              <div className="row">
                <button className="btn primary sm" onClick={() => onUse(e)}>Use me</button>
                <button className="btn ghost sm" onClick={() => onRemix(e)}>Remix</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
