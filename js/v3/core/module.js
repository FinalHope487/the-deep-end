// ModuleDescriptor: pure JSON identity and feature specs of one module slot.
// Lives in its own file so world.js can validate registries without importing
// the contracts.js entry point (which re-exports world.js).
import {
  Fail, run, requireObject, isPlain, readOwn, str, int, listOf, record, version, oneOf, vec3, jsonObject,
  extChecker, localKey,
} from './check.js';

// The parts of a registry entry `{descriptor, generate}`, read as own data: a missing or malformed entry is a
// failed Result with its path, never a TypeError, and no getter runs. The caller checks `generate`.
export function readModuleEntry(entry, path) {
  if (!isPlain(entry)) throw new Fail('BAD_TYPE', path);
  if (!Object.hasOwn(entry, 'descriptor')) throw new Fail('MISSING_FIELD', `${path}/descriptor`);
  const descriptor = readOwn(entry, 'descriptor', path);
  if (!isPlain(descriptor)) throw new Fail('BAD_TYPE', `${path}/descriptor`);
  return { descriptor, generate: readOwn(entry, 'generate', path) };
}

export function validateModuleDescriptor(value, options = {}) {
  requireObject(value, 'validateModuleDescriptor');
  return run(() => record(value, '', {
    formatVersion: version, moduleId: str, moduleVersion: (v, p) => int(v, p, 1),
    kind: (v, p) => oneOf(v, p, ['region', 'landmark']), slotId: localKey,
    featureSpecs: listOf((v, p) => record(v, p, {
      type: str, params: jsonObject, anchor: vec3, ownerId: str })),
  }, { ext: extChecker(options) }));
}
