// ModuleDescriptor: pure JSON identity and feature specs of one module slot.
// Lives in its own file so world.js can validate registries without importing
// the contracts.js entry point (which re-exports world.js).
import {
  run, requireObject, str, int, listOf, record, version, oneOf, vec3, jsonObject, extChecker,
} from './check.js';

export function validateModuleDescriptor(value, options = {}) {
  requireObject(value, 'validateModuleDescriptor');
  return run(() => record(value, '', {
    formatVersion: version, moduleId: str, moduleVersion: (v, p) => int(v, p, 1),
    kind: (v, p) => oneOf(v, p, ['region', 'landmark']), slotId: str,
    featureSpecs: listOf((v, p) => record(v, p, {
      type: str, params: jsonObject, anchor: vec3, ownerId: str })),
  }, { ext: extChecker(options) }));
}
