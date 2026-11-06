// Static module registry: the one value that says which generation modules exist.
// Modules never register themselves; a composition file builds the registry from
// explicit imports (see registry-config.js), so adding or replacing a module is a
// source edit that the builder and the import-boundary tests can see.
import { Fail, run, requireObject, deepFreeze, list, readOwn } from '../core/check.js';
import { validateModuleDescriptor, readModuleEntry } from '../core/module.js';

// Validates one module list of the registry envelope, read as own data (no getter runs, no hole passes).
// `seen` tracks slots and module IDs across both lists: a slot belongs to exactly one module, whatever its kind.
function registryList(modules, kind, seen, options) {
  const name = `${kind}s`;
  return list(readOwn(modules, name, ''), `/${name}`, (entry, path) => {
    const { descriptor, generate } = readModuleEntry(entry, path);
    const checked = validateModuleDescriptor(descriptor, options);
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
// Each module is { descriptor: ModuleDescriptor, generate(ctx) }. `options.extAdapters` is the registered
// namespace table for a descriptor's `ext` (rev4:35); without it a descriptor with `ext` content is rejected.
export function createRegistry(modules, options = {}) {
  requireObject(modules, 'createRegistry');
  requireObject(options, 'createRegistry(options)');
  return run(() => {
    const seen = { slots: new Set(), moduleIds: new Set() };
    const regions = registryList(modules, 'region', seen, options);
    const landmarks = registryList(modules, 'landmark', seen, options);
    return Object.freeze({ regions: Object.freeze(regions), landmarks: Object.freeze(landmarks) });
  });
}
