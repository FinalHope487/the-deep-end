// Worker message contract and the pure owner-state rules (no real Worker here).
// Requests are one of init / query / cancel; replies carry exactly one of
// result or error. requestId never enters any geometry hash.
import {
  Fail, run, requireObject, isPlain, int, str, oneOf, literal, pattern, record,
  version, bounds, objectId, nested, deepFreeze, setOwn,
} from './check.js';
import { JOB_TYPES, PROTOCOL_VERSION } from './constants.js';
import { isFingerprint, makeQueryKey, makeSnapshotId, validateRequestId } from './ids.js';
import { validateSnapshot } from './snapshot.js';
import { validateWorld } from './world.js';

const bad = (code, path = '/') => ({ ok: false, code, path });

const requestIdField = (v, p) => {
  const r = validateRequestId(v);
  if (!r.ok) throw new Fail(r.code, p);
  return v;
};

const workerFingerprintField = (v, p) => {
  if (typeof v !== 'string') throw new Fail('BAD_TYPE', p);
  if (!isFingerprint(v)) throw new Fail('BAD_FIELD', p);
  return v;
};

const QUERY_KEY = pattern(/^[0-9a-f]{16}$/);

const COMMON = {
  formatVersion: version, protocolVersion: literal(PROTOCOL_VERSION),
  requestId: requestIdField, jobType: (v, p) => oneOf(v, p, JOB_TYPES),
  worldId: objectId('w'), configFingerprint: workerFingerprintField,
  generationEpoch: (v, p) => int(v, p, 0),
};

function jobTypeOf(value, allowed) {
  if (!isPlain(value)) throw new Fail('BAD_TYPE', '/');
  if (!Object.hasOwn(value, 'jobType')) throw new Fail('MISSING_FIELD', '/jobType');
  const jobType = oneOf(value.jobType, '/jobType', allowed);
  return jobType;
}

export function validateWorkerRequest(value) {
  requireObject(value, 'validateWorkerRequest');
  return run(() => {
    const jobType = jobTypeOf(value, JOB_TYPES);
    const variant = {
      init: { descriptor: nested(validateWorld) },
      query: { queryBounds: bounds, queryKey: QUERY_KEY },
      cancel: { targetRequestId: requestIdField },
    }[jobType];
    const out = record(value, '', { ...COMMON, ...variant });
    if (jobType === 'init') {
      if (out.descriptor.worldId !== out.worldId
        || out.descriptor.configFingerprint !== out.configFingerprint) {
        throw new Fail('BAD_REF', '/descriptor');
      }
    }
    if (jobType === 'query' && out.queryKey !== makeQueryKey(out.worldId, out.queryBounds)) {
      throw new Fail('BAD_QUERY_KEY', '/queryKey');
    }
    return out;
  });
}

const errorShape = (v, p) => record(v, p, { code: str }, { message: str });

export function validateWorkerReply(value) {
  requireObject(value, 'validateWorkerReply');
  return run(() => {
    const jobType = jobTypeOf(value, ['init', 'query']);
    const required = jobType === 'query' ? { ...COMMON, queryKey: QUERY_KEY } : { ...COMMON };
    const out = record(value, '', required, { result: (x) => x, error: errorShape });
    const hasResult = Object.hasOwn(out, 'result');
    if (hasResult && Object.hasOwn(out, 'error')) throw new Fail('BAD_FIELD', '/error');
    if (!hasResult && !Object.hasOwn(out, 'error')) throw new Fail('MISSING_FIELD', '/result');
    if (hasResult && jobType === 'init') {
      out.result = record(out.result, '/result', { worldId: objectId('w') });
      if (out.result.worldId !== out.worldId) throw new Fail('BAD_REF', '/result/worldId');
    } else if (hasResult) {
      out.result = nested(validateSnapshot)(out.result, '/result');
      if (out.result.worldId !== out.worldId) throw new Fail('BAD_REF', '/result/worldId');
      if (out.result.snapshotId !== makeSnapshotId(out.queryKey)) {
        throw new Fail('BAD_QUERY_KEY', '/result/snapshotId');
      }
    }
    return out;
  });
}

// ownerState = {worldId, configFingerprint, epoch,
//   pending:{[requestId]:{jobType, queryKey|null, epoch, cancelled}}}.
// Every function returns a new frozen state and never edits its input.
function ownerMismatch(state, message) {
  if (message.worldId !== state.worldId) return bad('WORLD_MISMATCH', '/worldId');
  if (message.configFingerprint !== state.configFingerprint) {
    return bad('CONFIG_MISMATCH', '/configFingerprint');
  }
  if (message.generationEpoch !== state.epoch) return bad('STALE_EPOCH', '/generationEpoch');
  return null;
}

function nextState(state, overrides = {}) {
  const pending = {};
  for (const [id, entry] of Object.entries(state.pending)) setOwn(pending, id, { ...entry });
  for (const [id, entry] of Object.entries(overrides)) setOwn(pending, id, entry);
  return deepFreeze({
    worldId: state.worldId, configFingerprint: state.configFingerprint,
    epoch: state.epoch, pending,
  });
}

export function beginRequest(state, request) {
  requireObject(state, 'beginRequest');
  const checked = validateWorkerRequest(request);
  if (!checked.ok) return checked;
  const req = checked.value;
  if (req.jobType === 'cancel') return bad('BAD_FIELD', '/jobType');
  const mismatch = ownerMismatch(state, req);
  if (mismatch) return mismatch;
  if (Object.hasOwn(state.pending, req.requestId)) return bad('DUP_ID', '/requestId');
  return {
    ok: true,
    value: nextState(state, {
      [req.requestId]: {
        jobType: req.jobType, queryKey: req.queryKey ?? null,
        epoch: req.generationEpoch, cancelled: false,
      },
    }),
  };
}

export function applyCancel(state, request) {
  requireObject(state, 'applyCancel');
  const checked = validateWorkerRequest(request);
  if (!checked.ok) return checked;
  const req = checked.value;
  if (req.jobType !== 'cancel') return bad('BAD_FIELD', '/jobType');
  const mismatch = ownerMismatch(state, req);
  if (mismatch) return mismatch;
  const target = state.pending[req.targetRequestId];
  const overrides = Object.hasOwn(state.pending, req.targetRequestId)
    ? { [req.targetRequestId]: { ...target, cancelled: true } } : {};
  return { ok: true, value: nextState(state, overrides) };
}

export function acceptReply(state, reply) {
  requireObject(state, 'acceptReply');
  const checked = validateWorkerReply(reply);
  if (!checked.ok) return checked;
  const msg = checked.value;
  const reject = (reason) => ({ ok: true, value: { accept: false, reason } });
  if (!Object.hasOwn(state.pending, msg.requestId)) return reject('UNKNOWN_REQUEST');
  const entry = state.pending[msg.requestId];
  if (msg.worldId !== state.worldId) return reject('WORLD_MISMATCH');
  if (msg.configFingerprint !== state.configFingerprint) return reject('CONFIG_MISMATCH');
  if (msg.generationEpoch !== state.epoch || msg.generationEpoch !== entry.epoch) {
    return reject('STALE_EPOCH');
  }
  if (msg.jobType !== entry.jobType) return reject('JOB_MISMATCH');
  if ((msg.queryKey ?? null) !== entry.queryKey) return reject('QUERY_KEY_MISMATCH');
  if (entry.cancelled) return reject('CANCELLED');
  return { ok: true, value: { accept: true, reason: null } };
}
