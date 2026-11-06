// Stable identifiers: <kind>:v1:<8hex seed>-<12hex fingerprint>:<localKey>.
// Validators return {ok,value}|{ok:false,code,path}; make/encode helpers throw
// on invalid arguments.
import { SEED_MAX, QUERY_VERSION } from './constants.js';
import { canonicalJson, sha256Hex } from './hash.js';

const KIND_RE = /^[wrlsf]$/;
const LOCAL_KEY_RE = /^[A-Za-z0-9_.~-]+$/;
const FINGERPRINT_RE = /^[0-9a-f]{12}$/;
const QUERY_KEY_RE = /^[0-9a-f]{16}$/;
const WORLD_OBJECT_RE = /^([wrlsf]):v1:([0-9a-f]{8})-([0-9a-f]{12}):([A-Za-z0-9_.~-]+)$/;
const SNAPSHOT_RE = /^snap:v1:[0-9a-f]{16}$/;
const COORD_RE = /^([np])(0|[1-9][0-9]*)$/;

const ok = (value) => ({ ok: true, value });
const fail = (code, path = '/') => ({ ok: false, code, path });

export const isLocalKey = (text) => typeof text === 'string' && LOCAL_KEY_RE.test(text);
export const isFingerprint = (text) => typeof text === 'string' && FINGERPRINT_RE.test(text);
export const isQueryKey = (text) => typeof text === 'string' && QUERY_KEY_RE.test(text);

function assertSeed(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > SEED_MAX) {
    throw new RangeError(`seed must be an integer in 0..${SEED_MAX}`);
  }
}

export function makeWorldObjectId(kind, seed, configFingerprint, localKey) {
  if (typeof kind !== 'string' || !KIND_RE.test(kind)) throw new RangeError('bad id kind');
  assertSeed(seed);
  if (!isFingerprint(configFingerprint)) throw new RangeError('bad config fingerprint');
  if (!isLocalKey(localKey)) throw new RangeError('bad local key');
  return `${kind}:v1:${(seed + 0).toString(16).padStart(8, '0')}-${configFingerprint}:${localKey}`;
}

export function parseWorldObjectId(text) {
  if (typeof text !== 'string') return fail('BAD_TYPE');
  const m = WORLD_OBJECT_RE.exec(text);
  if (!m) return fail('BAD_FIELD');
  return ok({ kind: m[1], seed: parseInt(m[2], 16), configFingerprint: m[3], localKey: m[4] });
}

export function encodeCoordinate(value) {
  if (!Number.isSafeInteger(value)) throw new RangeError('coordinate must be a safe integer');
  return value < 0 ? `n${-value}` : `p${value + 0}`;
}

export function decodeCoordinate(text) {
  if (typeof text !== 'string') return fail('BAD_TYPE');
  const m = COORD_RE.exec(text);
  if (!m || (m[1] === 'n' && m[2] === '0')) return fail('BAD_FIELD');
  const magnitude = Number(m[2]);
  if (!Number.isSafeInteger(magnitude)) return fail('BAD_RANGE');
  return ok(m[1] === 'n' ? -magnitude : magnitude);
}

export function validateUniqueLocalKeys(keys) {
  if (!Array.isArray(keys)) return fail('BAD_TYPE');
  const seen = new Set();
  for (let i = 0; i < keys.length; i++) {
    if (!isLocalKey(keys[i])) return fail('BAD_FIELD', `/${i}`);
    if (seen.has(keys[i])) return fail('DUP_ID', `/${i}`);
    seen.add(keys[i]);
  }
  return ok(keys);
}

export function makeQueryKey(worldId, bounds) {
  if (typeof worldId !== 'string') throw new TypeError('worldId must be a string');
  return sha256Hex(canonicalJson({ worldId, queryBounds: bounds, queryVersion: QUERY_VERSION }))
    .slice(0, 16);
}

export function makeSnapshotId(queryKey) {
  if (!isQueryKey(queryKey)) throw new RangeError('bad query key');
  return `snap:v1:${queryKey}`;
}

export function validateSnapshotId(text) {
  if (typeof text !== 'string') return fail('BAD_TYPE');
  return SNAPSHOT_RE.test(text) ? ok(text) : fail('BAD_FIELD');
}

export function validateRequestId(text) {
  if (typeof text !== 'string') return fail('BAD_TYPE');
  if (text.length < 1 || text.length > 64) return fail('BAD_RANGE');
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x21 || c > 0x7e) return fail('BAD_FIELD');
  }
  return ok(text);
}

function byKey(...keys) {
  return (a, b) => {
    for (const k of keys) {
      if (a[k] < b[k]) return -1;
      if (a[k] > b[k]) return 1;
    }
    return 0;
  };
}

// Frozen geometry identity: seed, generator format, structural config, journey
// config, module list and adapter list. Atmosphere and other runtime data never
// enter the hash. Module and adapter list order is normalized.
export function makeConfigFingerprint(input) {
  const modules = input.modules
    .map(({ kind, slotId, moduleId, moduleVersion }) => ({ kind, slotId, moduleId, moduleVersion }))
    .sort(byKey('kind', 'slotId', 'moduleId'));
  const adapters = input.adapters
    .map(({ adapterId, adapterVersion }) => ({ adapterId, adapterVersion }))
    .sort(byKey('adapterId'));
  return sha256Hex(canonicalJson({
    seed: input.seed, generatorFormat: input.generatorFormat,
    structuralConfig: input.structuralConfig, journeyConfig: input.journeyConfig,
    modules, adapters,
  })).slice(0, 12);
}

// Progress lineage ignores module versions but tracks the journey slots.
export function makeLineageId(input) {
  return sha256Hex(canonicalJson({
    seed: input.seed, generatorFormat: input.generatorFormat,
    regionSlotIds: input.regionSlotIds, landmarkSlotIds: input.landmarkSlotIds,
    exitSlotId: input.exitSlotId,
  })).slice(0, 12);
}
