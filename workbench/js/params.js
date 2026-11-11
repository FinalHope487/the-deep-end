// The one list of look parameters. One table for each preset kind (a file in looks/<kind>/*.json).
// An entry: { key, label, group, kind, min, max, step | options, default, level }
//   kind: 'range' (min, max, step) | 'colour' ([r, g, b], 0..1, sRGB) | 'select' (options: array of values) | 'toggle' (true or false)
//   level: 'common' (always shown) | 'advanced' (shown when the panel switch "advanced" is on)
//   default: used when a preset file has no value for the key (see fillDefaults), and checked by feel-check.mjs.
// A new parameter needs ONE new entry here plus the place that reads the value. The panel (js/panel.js) has no code for a key.
// The order of the entries is the order in the panel; a group appears where its first entry is.

const r = (key, label, group, min, max, step, def, level = 'common') => ({ key, label, group, kind: 'range', min, max, step, default: def, level });
const c = (key, label, group, def, level = 'common') => ({ key, label, group, kind: 'colour', default: def, level });
const s = (key, label, group, options, def, level = 'common') => ({ key, label, group, kind: 'select', options, default: def, level });

export const PARAMS = {
  light: [
    c('sunColor', 'Sun colour', 'sun', [1, 1, 1]),
    r('sunStrength', 'Sun strength', 'sun', 0, 8, 0.05, 2),
    c('skyTop', 'Sky top colour', 'sky', [0.6, 0.7, 0.9]),
    c('skyHorizon', 'Sky horizon colour', 'sky', [0.9, 0.9, 0.95]),
    r('skyStrength', 'Sky strength', 'sky', 0, 3, 0.05, 1),
    r('bounceGain', 'Bounce gain', 'bounce', 0, 4, 0.05, 1),
    r('ambientFloor', 'Ambient floor', 'bounce', 0, 0.2, 0.005, 0, 'advanced'),
    r('exposure', 'Exposure', 'exposure', 0.2, 3, 0.05, 1),
    r('shadowSoftness', 'Shadow softness', 'shadow', 0, 10, 0.5, 3, 'advanced'),
    s('shadowMapSize', 'Shadow map size', 'shadow', [512, 1024, 2048, 4096], 2048, 'advanced'),
  ],
  water: [
    c('tint', 'Tint colour', 'colour', [0.8, 0.9, 1]),
    r('tintWeight', 'Tint weight', 'colour', 0, 1, 0.01, 1),
    r('ambientTint', 'Ambient tint', 'colour', 0, 1, 0.01, 1, 'advanced'),
    r('skyMix', 'Sky mix', 'colour', 0, 1, 0.01, 0, 'advanced'),
    r('absorption', 'Absorption', 'clarity', 0, 40, 0.1, 1),
    r('haze', 'Haze', 'clarity', 0, 1, 0.01, 0),
    r('reflection', 'Reflection strength', 'reflection', 0, 2, 0.05, 1),
    r('f0', 'Reflection at face-on (f0)', 'reflection', 0, 1, 0.01, 0.1),
    r('reflectionScale', 'Reflection resolution', 'reflection', 0.05, 1, 0.05, 0.6, 'advanced'),
    r('distort', 'Reflection distortion', 'reflection', 0, 0.3, 0.005, 0.07, 'advanced'),
    s('rippleStyle', 'Ripple style', 'ripple shape', ['noise', 'waves', 'mixed'], 'noise'),
    r('rippleScale', 'Ripple scale', 'ripple shape', 0.5, 12, 0.1, 2.2),
    r('rippleAmp', 'Ripple height', 'ripple shape', 0, 0.4, 0.005, 0.07),
    r('rippleSpeed', 'Ripple speed', 'motion', 0, 3, 0.05, 0.6),
    r('glint', 'Glint strength', 'glints', 0, 3, 0.05, 0.5),
    r('glintSize', 'Glint tightness', 'glints', 8, 600, 1, 160, 'advanced'),
  ],
  material: [
    c('wall', 'Wall colour', 'colour', [0.9, 0.9, 0.9]),
    c('ceiling', 'Ceiling colour', 'colour', [0.9, 0.9, 0.9]),
    c('floor', 'Floor colour', 'colour', [0.8, 0.8, 0.8]),
    c('groutColor', 'Grout colour', 'colour', [0.7, 0.7, 0.7]),
    r('tileSize', 'Tile size (m)', 'tile', 0.1, 1, 0.01, 0.3),
    r('groutWidth', 'Grout width (m)', 'tile', 0, 0.05, 0.001, 0.012),
    r('roughness', 'Roughness', 'surface', 0, 1, 0.01, 0.5),
    r('bump', 'Grout depth', 'surface', 0, 3, 0.05, 1, 'advanced'),
  ],
  feel: [
    r('walkSpeed', 'Walk speed (m/s)', 'pace', 0.5, 6, 0.1, 2.2),
    r('accel', 'Speed up (m/s^2)', 'pace', 2, 60, 1, 10),
    r('decel', 'Slow down (m/s^2)', 'pace', 2, 60, 1, 12),
    r('radius', 'Body radius (m)', 'body', 0.15, 0.4, 0.01, 0.25, 'advanced'),
    r('eyeHeight', 'Eye height (m)', 'body', 1.2, 1.9, 0.01, 1.6),
    r('stepHeight', 'Step height (m)', 'body', 0.05, 0.6, 0.01, 0.35, 'advanced'),
    r('stepSmooth', 'Step smoothing (s)', 'body', 0, 0.4, 0.01, 0.1, 'advanced'),
    r('lookSensitivity', 'Look sensitivity', 'look', 0.3, 3, 0.05, 1),
    r('bobAmp', 'Bob height (m)', 'bob', 0, 0.06, 0.001, 0.02),
    r('bobFreq', 'Bob speed (Hz)', 'bob', 0.5, 3, 0.05, 1.9),
  ],
};

// Not a preset: switches of the viewer itself. Shown in the panel group "diagnostics".
export const DIAGNOSTICS = [
  { key: 'stats', label: 'Frame time (mean, p99)', group: 'diagnostics', kind: 'toggle', default: false, level: 'common' },
];

// Kinds that must name every key in the file (a missing key is an error, not a default). M2 architecture section 4.
export const STRICT = new Set(['feel']);

// A copy of the preset with the table default for every key that the file leaves out. Strict kinds are returned as they are.
export function fillDefaults(kind, preset) {
  if (STRICT.has(kind)) return preset;
  const out = { ...preset };
  for (const e of PARAMS[kind]) if (out[e.key] === undefined) out[e.key] = e.default;
  return out;
}

// Problems of a whole preset as read from a file (before fillDefaults): a strict kind must name every key; every key present must be valid.
export function checkPreset(kind, preset) {
  const out = [], known = new Set(PARAMS[kind].map((e) => e.key));
  for (const k of Object.keys(preset)) if (!known.has(k)) out.push(`${kind} preset: key "${k}" is not in the table`);
  for (const e of PARAMS[kind]) {
    if (preset[e.key] === undefined) { if (STRICT.has(kind)) out.push(`${kind} preset: missing key "${e.key}"`); } else out.push(...checkValue(e, preset[e.key]));
  }
  return out;
}

// Problems of one value against its entry; an empty list means the value is valid.
export function checkValue(e, v) {
  if (e.kind === 'range') return typeof v === 'number' && Number.isFinite(v) ? (v < e.min || v > e.max ? [`${e.key} = ${v} is outside ${e.min}..${e.max}`] : []) : [`${e.key} is not a number`];
  if (e.kind === 'colour') return Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && x >= 0 && x <= 1) ? [] : [`${e.key} must be [r, g, b] with 0..1`];
  if (e.kind === 'select') return e.options.includes(v) ? [] : [`${e.key} = ${v} is not one of ${e.options.join(', ')}`];
  if (e.kind === 'toggle') return typeof v === 'boolean' ? [] : [`${e.key} must be true or false`];
  return [`${e.key}: unknown kind "${e.kind}"`];
}
