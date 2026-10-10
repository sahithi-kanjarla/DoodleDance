// Webcam pose -> compact, character-agnostic bone angles.
// landmarksToAngles() is pure (testable in Node); PoseTracker wraps MediaPipe.
//
// The webcam is treated as a MIRROR: the person's LEFT landmarks drive the
// character's screen-LEFT limbs. Each limb bone is driven only by its own two
// landmarks, so limbs can never cross-contaminate.

import { LM, LIMB_DRIVERS } from './skeleton.js';

// ---- One Euro filter (smooths jitter, stays responsive on fast moves) ----
class OneEuro {
  constructor(minCutoff = 1.4, beta = 0.35, dCutoff = 1) {
    Object.assign(this, { minCutoff, beta, dCutoff, x: null, dx: 0, t: null });
  }
  static alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(v, t) {
    if (this.x === null) { this.x = v; this.t = t; return v; }
    const dt = Math.max(1e-3, (t - this.t) / 1000);
    this.t = t;
    const dRaw = (v - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dRaw - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (v - this.x);
    return this.x;
  }
}

export function createPoseState() {
  return { filters: {}, last: {}, calib: null, scaleSmoothed: 1 };
}

const VIS = 0.45;

/**
 * @param lms  MediaPipe normalized landmarks (33)
 * @param vw,vh video size in px (so angles are not distorted by aspect ratio)
 * @param state createPoseState()
 * @param opts {followPosition, followScale}
 * @returns angles {torso, head, uaL..llR, scale, dx, dy, tracked} (null = not visible)
 */
export function landmarksToAngles(lms, vw, vh, t, state, opts = {}) {
  const get = (idx) => {
    const l = lms[idx];
    if (!l || (l.visibility ?? 1) < VIS) return null;
    const f = (state.filters[idx] ||= { x: new OneEuro(), y: new OneEuro() });
    // mirrored x so the view behaves like a mirror
    return { x: f.x.filter((1 - l.x) * vw, t), y: f.y.filter(l.y * vh, t) };
  };
  const angle = (a, b) => (a && b ? Math.atan2(b.y - a.y, b.x - a.x) : null);
  const keep = (key, v) => {
    if (v === null) return state.last[key] ?? null; // hold last value when occluded
    state.last[key] = v;
    return v;
  };

  const P = {};
  Object.values(LM).forEach((i) => { P[i] = get(i); });

  const out = {};
  for (const [bone, [i, j]] of Object.entries(LIMB_DRIVERS)) out[bone] = keep(bone, angle(P[i], P[j]));

  const mid = (a, b) => (a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null);
  const shM = mid(P[LM.L_SH], P[LM.R_SH]);
  const hipM = mid(P[LM.L_HIP], P[LM.R_HIP]);
  out.torso = keep('torso', angle(hipM, shM));
  // head roll from the ear line (left ear -> right ear, mirrored space)
  out.head = keep('head', angle(P[LM.L_EAR], P[LM.R_EAR]));

  out.scale = 1; out.dx = 0; out.dy = 0;
  if (shM && hipM) {
    const len = Math.hypot(shM.x - hipM.x, shM.y - hipM.y);
    if (!state.calib && len > 20) state.calib = { len, x: hipM.x, y: hipM.y };
    if (state.calib) {
      if (opts.followScale !== false) {
        const s = Math.min(1.8, Math.max(0.5, len / state.calib.len));
        state.scaleSmoothed += 0.15 * (s - state.scaleSmoothed);
        out.scale = state.scaleSmoothed;
      }
      if (opts.followPosition !== false) {
        out.dx = Math.max(-3, Math.min(3, (hipM.x - state.calib.x) / state.calib.len));
        out.dy = Math.max(-3, Math.min(3, (hipM.y - state.calib.y) / state.calib.len));
      }
    }
  }
  out.tracked = !!(shM && hipM);
  return out;
}

export function calibrateNow(state) { state.calib = null; state.scaleSmoothed = 1; }

// ---------------------------------------------------------------------------
// MediaPipe Pose Landmarker (BlazePose GHUM "full" model), runs in-browser.
const VERSION = '0.10.21';
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

export class PoseTracker {
  constructor() { this.landmarker = null; this.state = createPoseState(); }

  async init() {
    if (this.landmarker) return;
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    const make = (delegate) => PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try { this.landmarker = await make('GPU'); } catch { this.landmarker = await make('CPU'); }
  }

  /** Returns {angles, landmarks} or null when nobody is detected. */
  detect(video, nowMs, opts) {
    if (!this.landmarker || video.readyState < 2 || !video.videoWidth) return null;
    const res = this.landmarker.detectForVideo(video, nowMs);
    const lms = res.landmarks && res.landmarks[0];
    if (!lms) return null;
    const angles = landmarksToAngles(lms, video.videoWidth, video.videoHeight, nowMs, this.state, opts);
    return { angles, landmarks: lms };
  }

  calibrate() { calibrateNow(this.state); }
  close() { this.landmarker?.close(); this.landmarker = null; }
}

// Skeleton connections for the small camera preview overlay.
export const PREVIEW_LINES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
];
