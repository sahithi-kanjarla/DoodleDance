// Explicit character skeleton. LEFT/RIGHT are SCREEN-side of the drawing
// (LEFT = smaller x). The webcam is treated as a mirror, so the user's left
// body side drives the character's screen-left limbs.

export const JOINT_NAMES = [
  'HEAD', 'NECK', 'PELVIS',
  'LEFT_SHOULDER', 'LEFT_ELBOW', 'LEFT_WRIST',
  'RIGHT_SHOULDER', 'RIGHT_ELBOW', 'RIGHT_WRIST',
  'LEFT_HIP', 'LEFT_KNEE', 'LEFT_ANKLE',
  'RIGHT_HIP', 'RIGHT_KNEE', 'RIGHT_ANKLE',
];

// Bones that carry artwork. `a`->`b` is the segment pixels get bound to.
// `pivot` is the joint the piece rotates around. `parent` is used only for
// the small overlap that hides cracks at bent joints.
export const BONES = [
  { id: 'head',  parent: 'torso', pivot: 'NECK' },
  { id: 'torso', parent: null,    pivot: 'PELVIS', a: 'NECK', b: 'PELVIS' },
  { id: 'uaL', parent: 'torso', pivot: 'LEFT_SHOULDER',  a: 'LEFT_SHOULDER',  b: 'LEFT_ELBOW' },
  { id: 'laL', parent: 'uaL',   pivot: 'LEFT_ELBOW',     a: 'LEFT_ELBOW',     b: 'LEFT_WRIST' },
  { id: 'uaR', parent: 'torso', pivot: 'RIGHT_SHOULDER', a: 'RIGHT_SHOULDER', b: 'RIGHT_ELBOW' },
  { id: 'laR', parent: 'uaR',   pivot: 'RIGHT_ELBOW',    a: 'RIGHT_ELBOW',    b: 'RIGHT_WRIST' },
  { id: 'ulL', parent: 'torso', pivot: 'LEFT_HIP',       a: 'LEFT_HIP',       b: 'LEFT_KNEE' },
  { id: 'llL', parent: 'ulL',   pivot: 'LEFT_KNEE',      a: 'LEFT_KNEE',      b: 'LEFT_ANKLE' },
  { id: 'ulR', parent: 'torso', pivot: 'RIGHT_HIP',      a: 'RIGHT_HIP',      b: 'RIGHT_KNEE' },
  { id: 'llR', parent: 'ulR',   pivot: 'RIGHT_KNEE',     a: 'RIGHT_KNEE',     b: 'RIGHT_ANKLE' },
];

export const BONE_IDS = BONES.map((b) => b.id);

// back-to-front
export const DRAW_ORDER = ['llL', 'ulL', 'llR', 'ulR', 'torso', 'uaL', 'laL', 'uaR', 'laR', 'head'];

// Which MediaPipe landmarks drive each limb bone (person's left -> character LEFT).
export const LM = {
  NOSE: 0, L_EAR: 7, R_EAR: 8,
  L_SH: 11, R_SH: 12, L_ELB: 13, R_ELB: 14, L_WR: 15, R_WR: 16,
  L_HIP: 23, R_HIP: 24, L_KNEE: 25, R_KNEE: 26, L_ANK: 27, R_ANK: 28,
};

export const LIMB_DRIVERS = {
  uaL: [LM.L_SH, LM.L_ELB],  laL: [LM.L_ELB, LM.L_WR],
  uaR: [LM.R_SH, LM.R_ELB],  laR: [LM.R_ELB, LM.R_WR],
  ulL: [LM.L_HIP, LM.L_KNEE], llL: [LM.L_KNEE, LM.L_ANK],
  ulR: [LM.R_HIP, LM.R_KNEE], llR: [LM.R_KNEE, LM.R_ANK],
};

export const ANGLE_KEYS = ['torso', 'head', 'uaL', 'laL', 'uaR', 'laR', 'ulL', 'llL', 'ulR', 'llR'];
