// P1 diagnostic entry. Build with --entry js/v3/entry/main.js.
import { composeWorld, queryWorld } from '../core/world.js';
import { createDefaultRegistry } from '../modules/registry-config.js';
import { createDefaultAdapters } from '../modules/adapters.js';
import { DEFAULT_STRUCTURAL_CONFIG } from '../modules/world-config.js';
import { DEFAULT_JOURNEY_CONFIG } from '../modules/journey-config.js';
import { buildP1Summary, renderP1Diagnostic } from '../diagnostic/view.js';

const P1_DEFAULT_SEED = 42;
const P1_QUERY_BOUNDS = Object.freeze({
  min: Object.freeze({ x: 0, y: -2, z: 0 }),
  max: Object.freeze({ x: 32, y: 8, z: 16 }),
});

function parseP1Seed() {
  const raw = new URLSearchParams(location.search).get('seed');
  if (raw === null) return P1_DEFAULT_SEED;
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    const error = new RangeError('seed must be a decimal uint32');
    error.code = 'P1_INVALID_SEED';
    throw error;
  }
  const seed = Number(raw);
  if (!Number.isSafeInteger(seed) || seed > 4294967295) {
    const error = new RangeError('seed must be between 0 and 4294967295');
    error.code = 'P1_INVALID_SEED';
    throw error;
  }
  return seed;
}

function requireP1Result(result, stage) {
  if (result?.ok === true) return result.value;
  const error = new Error(`${stage}: ${result?.code ?? 'UNKNOWN'} at ${result?.path ?? '/'}`);
  error.code = result?.code ?? 'P1_BOOT_FAILED';
  throw error;
}

window.__deependV3 = { ready: false, error: null, summary: null };
renderP1Diagnostic(window.__deependV3);
try {
  const seed = parseP1Seed();
  const registry = requireP1Result(createDefaultRegistry(), 'registry');
  const modules = [...registry.regions, ...registry.landmarks].map(({ descriptor }) => ({
    kind: descriptor.kind,
    slotId: descriptor.slotId,
    moduleId: descriptor.moduleId,
    moduleVersion: descriptor.moduleVersion,
  }));
  const config = {
    seed,
    generatorFormat: 1,
    structuralConfig: DEFAULT_STRUCTURAL_CONFIG,
    journeyConfig: DEFAULT_JOURNEY_CONFIG,
    modules,
    adapters: [],
  };
  const world = requireP1Result(
    composeWorld(config, registry, createDefaultAdapters()), 'composeWorld');
  const snapshot = requireP1Result(
    queryWorld(world.context, P1_QUERY_BOUNDS), 'queryWorld');
  const summary = buildP1Summary(world.descriptor, snapshot);
  window.__deependV3 = { ready: true, error: null, summary };
} catch (error) {
  window.__deependV3 = {
    ready: false,
    error: { code: error?.code || 'P1_BOOT_FAILED', message: String(error?.message || error) },
    summary: null,
  };
}
renderP1Diagnostic(window.__deependV3);
