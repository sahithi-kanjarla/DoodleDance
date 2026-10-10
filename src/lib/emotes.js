// Emotes never swap the character: they override a few bone angles (and nudge the body)
// of YOUR drawing for a moment. Keys not mentioned keep following the live pose / idle sway.
const U = -Math.PI / 2, D = Math.PI / 2, s = Math.sin;

export const EMOTE_INFO = {
  wave: { emoji: '👋', label: 'Wave', dur: 2.2 }, jump: { emoji: '🦘', label: 'Jump', dur: 0.9 }, clap: { emoji: '👏', label: 'Clap', dur: 2 },
  dance: { emoji: '🕺', label: 'Dance', dur: 3.2 }, heart: { emoji: '❤️', label: 'Heart', dur: 2 }, confetti: { emoji: '🎉', label: 'Confetti', dur: 1.8 },
  laugh: { emoji: '😂', label: 'Laugh', dur: 1.8 }, surprised: { emoji: '😲', label: 'Surprise', dur: 1.3 },
};

const ease = (x) => Math.min(1, x * 6) * Math.min(1, (1 - x) * 6);        // fade in/out of the override

/** → { a: {angle overrides}, dy: body offset in torso lengths, k: 0..1 blend } */
export function emotePose(kind, t) {
  const info = EMOTE_INFO[kind]; if (!info) return null;
  const x = t / info.dur; if (x < 0 || x > 1) return null;
  const k = ease(x);
  let a = {}, dy = 0, dx = 0;
  switch (kind) {
    case 'wave': a = { uaR: U + 0.35, laR: U + 0.35 + 0.7 * s(t * 14), uaL: D + 0.18, laL: D + 0.1 }; break;
    case 'jump': dy = -0.9 * 4 * x * (1 - x); a = { uaL: U - 0.9, laL: U - 1.0, uaR: U + 0.9, laR: U + 1.0, ulL: D + 0.28, llL: D + 0.5, ulR: D - 0.28, llR: D - 0.5 }; break;
    case 'clap': { const o = 0.5 + 0.5 * s(t * 16); a = { uaL: D + 0.55, laL: -0.9 + 0.5 * o, uaR: D - 0.55, laR: -Math.PI + 0.9 - 0.5 * o, torso: U + 0.04 * s(t * 8) }; break; }
    case 'dance': { const p = 0.5 + 0.5 * s(t * 7), q = 0.5 + 0.5 * s(t * 7 + Math.PI); a = { torso: U + 0.14 * s(t * 3.5), head: 0.22 * s(t * 3.5 + 1), uaL: U - 0.5 - 0.5 * p, laL: U - 0.5 - 0.5 * p + 0.5 * s(t * 12), uaR: U + 0.5 + 0.5 * q, laR: U + 0.5 + 0.5 * q - 0.5 * s(t * 12), ulL: D + 0.3 * p, llL: D + 0.6 * p, ulR: D - 0.3 * q, llR: D - 0.6 * q }; dy = -0.08 * Math.abs(s(t * 7)); break; }
    case 'heart': a = { uaL: U - 0.55, laL: U + 0.95, uaR: U + 0.55, laR: U - 0.95, head: 0.1 * s(t * 5) }; dy = -0.03 * s(t * 8); break;
    case 'confetti': a = { uaL: U - 0.7, laL: U - 0.75, uaR: U + 0.7, laR: U + 0.75 }; dy = -0.12 * Math.abs(s(t * 9)); break;
    case 'laugh': a = { torso: U + 0.07 * s(t * 30), head: -0.35 + 0.08 * s(t * 30), uaL: D + 0.3, laL: D + 0.9, uaR: D - 0.3, laR: D - 0.9 }; dy = -0.05 * Math.abs(s(t * 15)); break;
    case 'surprised': a = { head: -0.15, uaL: U - 1.2, laL: U - 1.35, uaR: U + 1.2, laR: U + 1.35, ulL: D + 0.18, llL: D + 0.18, ulR: D - 0.18, llR: D - 0.18 }; dy = -0.2 * Math.max(0, 1 - x * 4); break;
    default: return null;
  }
  return { a, dy, dx, k };
}

/** Blend emote overrides over the base pose (angles lerp so entry/exit are smooth). */
export function applyEmote(base, em) {
  if (!em) return base;
  const out = { ...base };
  for (const [key, v] of Object.entries(em.a)) {
    const b = base[key];
    out[key] = b == null || em.k >= 1 ? v : b + angDiff(b, v) * em.k;
  }
  out.dy = (base.dy || 0) + em.dy * em.k;
  return out;
}
export function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
