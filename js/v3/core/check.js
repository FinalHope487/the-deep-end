// Strict-validation toolkit shared by every contract validator.
// Checkers throw Fail; public validators wrap them with run() so callers see
// {ok:true,value} or {ok:false,code,path}. Non-object arguments are programmer
// errors and throw TypeError (requireObject).
import { FORMAT_VERSION } from './constants.js';
import { isLocalKey, parseWorldObjectId } from './ids.js';

export class Fail extends Error {
  constructor(code, path) {
    super(`${code} at ${path || '/'}`);
    this.code = code;
    this.path = path || '/';
  }
}

export const at = (path, key) => `${path}/${key}`;

// Sets an own data property. Plain assignment of the key `__proto__` would change the prototype and lose the
// key, which breaks lossless transport of parsed JSON and dictionaries keyed by caller-chosen ids.
export function setOwn(object, key, value) {
  return Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
}

export function run(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    if (error instanceof Fail) return { ok: false, code: error.code, path: error.path };
    throw error;
  }
}

export function requireObject(value, name) {
  if (value === null || typeof value !== 'object') {
    throw new TypeError(`${name}: expected an object`);
  }
}

export function isPlain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function num(value, path) {
  if (typeof value !== 'number') throw new Fail('BAD_TYPE', path);
  if (!Number.isFinite(value)) throw new Fail('BAD_RANGE', path);
  return value === 0 ? 0 : value;
}

export function int(value, path, min = -Infinity, max = Infinity) {
  const n = num(value, path);
  if (!Number.isInteger(n) || n < min || n > max) throw new Fail('BAD_RANGE', path);
  return n;
}

export function str(value, path) {
  if (typeof value !== 'string') throw new Fail('BAD_TYPE', path);
  return value;
}

export function bool(value, path) {
  if (typeof value !== 'boolean') throw new Fail('BAD_TYPE', path);
  return value;
}

export function oneOf(value, path, allowed) {
  if (typeof value !== 'string') throw new Fail('BAD_TYPE', path);
  if (!allowed.includes(value)) throw new Fail('BAD_FIELD', path);
  return value;
}

export function literal(expected) {
  return (value, path) => {
    if (value !== expected) throw new Fail('BAD_FIELD', path);
    return value;
  };
}

export function pattern(re) {
  return (value, path) => {
    if (typeof value !== 'string') throw new Fail('BAD_TYPE', path);
    if (!re.test(value)) throw new Fail('BAD_FIELD', path);
    return value;
  };
}

export function list(value, path, itemFn) {
  if (!Array.isArray(value)) throw new Fail('BAD_TYPE', path);
  const out = [];
  for (let i = 0; i < value.length; i++) {
    if (!(i in value)) throw new Fail('BAD_TYPE', at(path, i));
    out.push(itemFn(value[i], at(path, i), i));
  }
  return out;
}

export const listOf = (itemFn) => (value, path) => list(value, path, itemFn);

// A local id (volumeId, nodeId, slotId ...): the localKey charset of rev4 section 8.
export function localKey(value, path) {
  if (typeof value !== 'string') throw new Fail('BAD_TYPE', path);
  if (!isLocalKey(value)) throw new Fail('BAD_FIELD', path);
  return value;
}

export const nullable = (fn) => (value, path) => (value === null ? null : fn(value, path));

// The own properties of a plain object as [key, value] pairs, read without running caller code. Only enumerable
// string-keyed data properties exist: an accessor is BAD_TYPE; a symbol or non-enumerable key would hide from
// every later key check, so it is `hiddenCode`.
export function ownData(value, path, hiddenCode = 'UNKNOWN_FIELD') {
  const entries = [];
  for (const key of Reflect.ownKeys(value)) {
    const d = typeof key === 'string' ? Object.getOwnPropertyDescriptor(value, key) : null;
    if (!d || !d.enumerable) throw new Fail(hiddenCode, at(path, String(key)));
    if (!('value' in d)) throw new Fail('BAD_TYPE', at(path, key));
    entries.push([key, d.value]);
  }
  return entries;
}

// One own data property of an object that has not been validated yet; undefined when absent, BAD_TYPE for an accessor.
export function readOwn(value, key, path) {
  const d = Object.getOwnPropertyDescriptor(value, key);
  if (!d) return undefined;
  if (!('value' in d)) throw new Fail('BAD_TYPE', at(path, key));
  return d.value;
}

export function record(value, path, required, optional = {}) {
  if (!isPlain(value)) throw new Fail('BAD_TYPE', path);
  ownData(value, path);
  // an absent version is as unreadable as a wrong one (rev3:25)
  if (Object.hasOwn(required, 'formatVersion') && value.formatVersion !== FORMAT_VERSION) {
    throw new Fail('BAD_VERSION', at(path, 'formatVersion'));
  }
  for (const key of Object.keys(required)) {
    if (!Object.hasOwn(value, key)) throw new Fail('MISSING_FIELD', at(path, key));
  }
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(required, key) && !Object.hasOwn(optional, key)) {
      throw new Fail('UNKNOWN_FIELD', at(path, key));
    }
  }
  const out = {};
  for (const [key, fn] of Object.entries(required)) out[key] = fn(value[key], at(path, key));
  for (const [key, fn] of Object.entries(optional)) {
    if (Object.hasOwn(value, key)) out[key] = fn(value[key], at(path, key));
  }
  return out;
}

export const version = literal(FORMAT_VERSION);

// A world-object id of the given kind (w, r, l, s, f).
export function objectId(kind) {
  return (value, path) => {
    if (typeof value !== 'string') throw new Fail('BAD_TYPE', path);
    const parsed = parseWorldObjectId(value);
    if (!parsed.ok || parsed.value.kind !== kind) throw new Fail('BAD_FIELD', path);
    return value;
  };
}

// Two ids must share seed and fingerprint (same world).
export function sameWorld(a, b, path) {
  const pa = parseWorldObjectId(a).value;
  const pb = parseWorldObjectId(b).value;
  if (pa.seed !== pb.seed || pa.configFingerprint !== pb.configFingerprint) {
    throw new Fail('BAD_REF', path);
  }
}

export function vec3(value, path) {
  return record(value, path, { x: num, y: num, z: num });
}

export function bounds(value, path) {
  const out = record(value, path, { min: vec3, max: vec3 });
  for (const axis of ['x', 'y', 'z']) {
    if (!(out.max[axis] > out.min[axis])) throw new Fail('BAD_RANGE', path);
  }
  return out;
}

// JSON-only value (used by free-form params and Save extension namespaces).
export const json = (value, path) => jsonIn(value, path, new Set());

// `active` holds the containers being copied: a reference shared by two branches is fine, a cycle is BAD_TYPE.
function jsonIn(value, path, active) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return num(value, path);
  const container = Array.isArray(value) || isPlain(value);
  if (!container) throw new Fail('BAD_TYPE', path);
  if (active.has(value)) throw new Fail('BAD_TYPE', path);
  active.add(value);
  try {
    if (Array.isArray(value)) return list(value, path, (item, p) => jsonIn(item, p, active));
    const out = {};
    for (const [key, v] of ownData(value, path, 'BAD_TYPE')) setOwn(out, key, jsonIn(v, at(path, key), active));
    return out;
  } finally {
    active.delete(value);
  }
}

export function jsonObject(value, path) {
  if (!isPlain(value)) throw new Fail('BAD_TYPE', path);
  return json(value, path);
}

// Optional `ext` object keyed by namespace. A strict consumer rejects a
// namespace without an adapter; a transport consumer keeps it untouched.
export function extChecker(options = {}) {
  const adapters = options.extAdapters ?? {};
  const strict = (options.mode ?? 'strict') === 'strict';
  return (value, path) => {
    if (!isPlain(value)) throw new Fail('BAD_TYPE', path);
    const out = {};
    for (const [ns, raw] of ownData(value, path)) {
      const p = at(path, ns);
      if (Object.hasOwn(adapters, ns)) setOwn(out, ns, json(adapters[ns].validate(json(raw, p), p), p));
      else if (strict) throw new Fail('UNKNOWN_FIELD', p);
      else setOwn(out, ns, json(raw, p));
    }
    return out;
  };
}

// Rejects duplicate values of key(item); path points at the offending index.
export function uniqueIds(items, path, key = (item) => item) {
  const seen = new Set();
  items.forEach((item, i) => {
    const id = key(item);
    if (seen.has(id)) throw new Fail('DUP_ID', at(path, i));
    seen.add(id);
  });
  return items;
}

// Rejects items not in ascending key(item) order (UTF-16 code unit order); path points at the first
// item that sorts before its predecessor. Callers run uniqueIds first when ids must also differ.
export function checkOrdered(items, path, key = (item) => item) {
  for (let i = 1; i < items.length; i++) {
    if (key(items[i - 1]) > key(items[i])) throw new Fail('BAD_FIELD', at(path, i));
  }
  return items;
}

// Sorted unique string set.
export function sortedUniqueStrings(itemFn = str) {
  return (value, path) => {
    const items = list(value, path, itemFn);
    uniqueIds(items, path);
    return checkOrdered(items, path);
  };
}

// Adapts a Result-returning validator to a throwing checker with a nested path.
export const nested = (validator) => (value, path) => {
  if (!isPlain(value)) throw new Fail('BAD_TYPE', path);
  const result = validator(value);
  if (!result.ok) throw new Fail(result.code, path + (result.path === '/' ? '' : result.path));
  return result.value;
};

export function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}
