import { renderStrokes } from '../components/ExampleGallery.jsx';
import { CANVAS_W, CANVAS_H } from '../components/DrawingCanvas.jsx';

/** Turn a built-in example into the same "saved character" shape the app stores. */
export function exampleToSaved(ex) {
  const canvas = renderStrokes(ex.strokes, CANVAS_W);
  const rgba = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, CANVAS_W, CANVAS_H).data;
  let minx = CANVAS_W, miny = CANVAS_H, maxx = 0, maxy = 0;
  for (let i = 0; i < CANVAS_W * CANVAS_H; i++) {
    if (rgba[i * 4 + 3] < 40) continue;
    const x = i % CANVAS_W, y = (i / CANVAS_W) | 0;
    if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  return {
    id: 'ex-' + ex.id, name: ex.name, artwork: canvas.toDataURL('image/png'), size: { w: CANVAS_W, h: CANVAS_H },
    rig: { joints: ex.joints, headRadius: ex.headRadius, strokeWidth: 7, bbox: { minx, miny, maxx, maxy } },
  };
}
