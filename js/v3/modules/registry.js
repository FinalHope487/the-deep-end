// Static module registry: the one value that says which generation modules exist.
// Modules never register themselves; a composition file builds the registry from
// explicit imports (see registry-config.js), so adding or replacing a module is a
// source edit that the builder and the import-boundary tests can see.
import { Fail, run, requireObject, deepFreeze } from '../core/check.js';
import { validateModuleDescriptor, readModuleEntry } from '../core/module.js';

// Validates one module list. `seen` tracks slots and module IDs across both lists:
// a slot belongs to exactly one module, whatever its kind.
function registryList(modules, kind, seen) {
  const list = `${kind}s`;
  if (!Array.isArray(modules)) throw new Fail('BAD_TYPE', `/${list}`);
  return modules.map((entry, i) => {
    const path = `/${list}/${i}`;
    const { descriptor, generate } = readModuleEntry(entry, path);
    const checked = validateModuleDescriptor(descriptor);
    if (!checked.ok) throw new Fail(checked.code, `${path}/descriptor${checked.path === '/' ? '' : checked.path}`);
    if (typeof generate !== 'function') throw new Fail('BAD_TYPE', `${path}/generate`);
    const d = checked.value;
    if (d.kind !== kind) throw new Fail('BAD_FIELD', `${path}/descriptor/kind`);
    if (seen.slots.has(d.slotId)) throw new Fail('DUP_SLOT', `${path}/descriptor/slotId`);
    if (seen.moduleIds.has(d.moduleId)) throw new Fail('DUP_MODULE', `${path}/descriptor/moduleId`);
    seen.slots.add(d.slotId);
    seen.moduleIds.add(d.moduleId);
    return Object.freeze({ descriptor: deepFreeze(d), generate });
  });
}

// createRegistry({ regions, landmarks }) -> Result<frozen { regions, landmarks }>.
// Each module is { descriptor: ModuleDescriptor, generate(ctx) }.
export function createRegistry(modules) {
  requireObject(modules, 'createRegistry');
  return run(() => {
    const seen = { slots: new Set(), moduleIds: new Set() };
    const regions = registryList(modules.regions, 'region', seen);
    const landmarks = registryList(modules.landmarks, 'landmark', seen);
    return Object.freeze({ regions: Object.freeze(regions), landmarks: Object.freeze(landmarks) });
  });
}
