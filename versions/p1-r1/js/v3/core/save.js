// Save: codec and shape only. No storage access lives in core.
// Progress is keyed by slot ids and local find keys so it survives module
// replacement; lineageId says which saves belong to the same journey.
import {
  Fail, run, requireObject, isPlain, int, num, bool, oneOf, literal, pattern, nullable,
  record, version, vec3, objectId, sortedUniqueStrings, jsonObject, localKey, readOwn,
} from './check.js';
import { BASE_PHASE_IDS, EXIT_STATES, FALLBACK_REASONS, SEED_MAX } from './constants.js';
import { canonicalJson } from './hash.js';
import { isFingerprint, parseWorldObjectId } from './ids.js';

const LOAD_FAIL_CODES = ['WORLD_MISMATCH', 'BAD_FIELD', 'BAD_JSON', 'BAD_VERSION'];

const fingerprint = (v, p) => {
  if (typeof v !== 'string') throw new Fail('BAD_TYPE', p);
  if (!isFingerprint(v)) throw new Fail('BAD_FIELD', p);
  return v;
};

export const progressShape = (value, path) => record(value, path, {
  visitedSlotIds: sortedUniqueStrings(localKey),
  foundKeys: sortedUniqueStrings(pattern(/^[A-Za-z0-9_.~-]+$/)),
  exitState: (v, p) => oneOf(v, p, EXIT_STATES),
  lastFreePosition: nullable(vec3),
}, { ext: jsonObject });

export function validateSave(value) {
  requireObject(value, 'validateSave');
  return run(() => {
    const out = record(value, '', {
      formatVersion: version, phaseId: (v, p) => oneOf(v, p, BASE_PHASE_IDS), worldId: objectId('w'),
      lineageId: pattern(/^[0-9a-f]{12}$/), seed: (v, p) => int(v, p, 0, SEED_MAX),
      configFingerprint: fingerprint,
      player: (v, p) => record(v, p, { position: vec3, yaw: num }),
      progress: progressShape,
    });
    const id = parseWorldObjectId(out.worldId).value;
    if (id.seed !== out.seed) throw new Fail('BAD_REF', '/seed');
    if (id.configFingerprint !== out.configFingerprint) throw new Fail('BAD_REF', '/configFingerprint');
    return out;
  });
}

// Canonical text of a valid save (sorted keys, unknown ext namespaces kept).
export function encodeSave(value) {
  const checked = validateSave(value);
  return checked.ok ? { ok: true, value: canonicalJson(checked.value) } : checked;
}

export function decodeSave(text) {
  if (typeof text !== 'string') throw new TypeError('decodeSave: expected a string');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, code: 'BAD_JSON', path: '/' };
  }
  if (!isPlain(parsed)) return { ok: false, code: 'BAD_FIELD', path: '/' };
  const checked = validateSave(parsed);
  if (checked.ok || checked.code === 'BAD_VERSION') return checked;
  return { ok: false, code: 'BAD_FIELD', path: checked.path };
}

// Loader result contract (fixed in P1, implemented later): shape only.
export function validateLoadResult(value) {
  requireObject(value, 'validateLoadResult');
  return run(() => {
    if (isPlain(value) && readOwn(value, 'ok', '') === false) { // readOwn: a getter must not run before record()
      return record(value, '', {
        ok: literal(false), code: (v, p) => oneOf(v, p, LOAD_FAIL_CODES) });
    }
    return record(value, '', {
      ok: literal(true),
      value: (v, p) => record(v, p, {
        progress: progressShape, position: vec3, worldChanged: bool,
        fallbackReason: nullable((r, pt) => oneOf(r, pt, FALLBACK_REASONS)),
      }),
    });
  });
}
