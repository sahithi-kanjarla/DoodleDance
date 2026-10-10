import React, { useEffect, useRef } from 'react';
import { drawCharacter } from '../lib/character.js';

function drawStage(ctx, w, h) {
  ctx.fillStyle = '#bde7ff'; ctx.fillRect(0, 0, w, h);             // sky
  const fy = h * 0.8;
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(0, fy, w, h - fy);        // floor
  ctx.fillStyle = '#1b1b2f'; ctx.fillRect(0, fy - 3, w, 6);         // floor edge
  ctx.fillStyle = '#f6b800';
  for (let x = -((fy) % 80); x < w; x += 80) ctx.fillRect(x, fy + 20, 40, 10);
  ctx.fillStyle = '#ffffff';                                        // clouds
  [[0.18, 0.18], [0.74, 0.12], [0.55, 0.3]].forEach(([cx, cy]) => {
    const x = w * cx, y = h * cy, u = Math.max(8, w / 40);
    ctx.beginPath(); ctx.arc(x, y, u * 1.6, 0, 6.3); ctx.arc(x + u * 2, y + u * 0.3, u * 1.3, 0, 6.3); ctx.arc(x - u * 1.8, y + u * 0.4, u * 1.1, 0, 6.3); ctx.fill();
  });
}

/**
 * Renders one character on a stage. `getAngles(tSeconds)` is called every frame
 * and returns bone angles (see retarget.solve).
 */
export default function CharacterView({ character, getAngles, className = '', onFrame }) {
  const ref = useRef(null);
  const live = useRef({ getAngles, onFrame });
  live.current = { getAngles, onFrame };

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    const t0 = performance.now();
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(2, Math.round(r.width * dpr));
      canvas.height = Math.max(2, Math.round(r.height * dpr));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    const frame = (now) => {
      const w = canvas.width, h = canvas.height;
      const dpr = w / Math.max(1, canvas.getBoundingClientRect().width);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawStage(ctx, w, h);

      const b = character.bbox, P = character.rig.joints.PELVIS;
      const bh = b.maxy - b.miny + 1;
      const k = (h * 0.58) / bh;
      const cx = (b.minx + b.maxx) / 2, cy = (b.miny + b.maxy) / 2;
      const place = { x: w / 2 + k * (P.x - cx), y: h * 0.5 + k * (P.y - cy), k };

      // ground shadow under the feet
      const footY = place.y + k * (b.maxy - P.y);
      ctx.fillStyle = 'rgba(27,27,47,.22)';
      ctx.beginPath(); ctx.ellipse(w / 2, footY + 6 * dpr, k * bh * 0.2, 9 * dpr, 0, 0, Math.PI * 2); ctx.fill();

      const angles = live.current.getAngles((now - t0) / 1000) || {};
      drawCharacter(ctx, character, angles, place);
      live.current.onFrame?.(angles);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [character]);

  return <canvas ref={ref} className={`stage-canvas ${className}`} />;
}
