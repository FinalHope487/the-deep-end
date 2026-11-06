// Implementer-owned tests for slice 3 choices that the reviewer tests do not pin
// (docs/decisions/2026-11-06-v3-p1-slice3-builder-registry.md): landmark anchor
// formula, landmark slot and pin checks, and the shipped default composition.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeWorld, queryWorld } from '../../js/v3/core/world.js';
import { resolveJourneyAnchors } from '../../js/v3/core/journey.js';
import { createRegistry } from '../../js/v3/modules/registry.js';
import { createDefaultRegistry } from '../../js/v3/modules/registry-config.js';
import { createDefaultAdapters } from '../../js/v3/modules/adapters.js';
import { DEFAULT_STRUCTURAL_CONFIG } from '../../js/v3/modules/world-config.js';
import { DEFAULT_JOURNEY_CONFIG } from '../../js/v3/modules/journey-config.js';
import { stubRegion } from '../../js/v3/modules/regions/stub-region.js';
import { stubLandmark } from '../../js/v3/modules/landmarks/stub-landmark.js';

const ok = (r) => { assert.equal(r?.ok, true, JSON.stringify(r)); return r.value; };
const pin = (m) => ({ kind: m.descriptor.kind, slotId: m.descriptor.slotId,
  moduleId: m.descriptor.moduleId, moduleVersion: m.descriptor.moduleVersion });
const copy = (x) => JSON.parse(JSON.stringify(x));

function build({ regions, landmarks, segments, landmarkSlotIds, modules, rawRegistry }) {
  const registry = rawRegistry ?? ok(createRegistry({ regions, landmarks }));
  const config = {
    seed: 7, generatorFormat: 1, structuralConfig: copy(DEFAULT_STRUCTURAL_CONFIG),
    journeyConfig: { regionSlotIds: regions.map((r) => r.descriptor.slotId),
      landmarkSlotIds: landmarkSlotIds ?? landmarks.map((l) => l.descriptor.slotId),
      exitSlotId: 'exit01', segments, objectiveIds: [] },
    modules: modules ?? [...regions, ...landmarks].map(pin), adapters: [] };
  return composeWorld(config, registry, createDefaultAdapters());
}
const REGIONS = ['region01', 'region02'].map((s) => stubRegion(s));

test('[P1-A07] landmark anchors sit on the spine at (i+1)/(n+1) of its length, after exit', () => {
  const landmarks = ['landmark01', 'landmark02'].map((s) => stubLandmark(s));
  const { context } = ok(build({ regions: REGIONS, landmarks, segments: [30, 60, 90] }));
  const anchors = ok(resolveJourneyAnchors(context)).anchors;
  assert.deepEqual(anchors.map((a) => [a.kind, a.slotId]), [
    ['start', 'start'], ['region', 'region01'], ['region', 'region02'], ['exit', 'exit01'],
    ['landmark', 'landmark01'], ['landmark', 'landmark02']]);
  assert.deepEqual(anchors.filter((a) => a.kind === 'landmark').map((a) => a.position.x), [60, 120]);
  assert.ok(Object.isFrozen(context.landmarks));
});

test('[P1-A05] composeWorld rejects a landmark slot equal to a region slot (hand-built registry)', () => {
  // createRegistry already returns DUP_SLOT here; composeWorld guards registries built by hand.
  const landmarks = [stubLandmark('region01')];
  const built = build({ regions: REGIONS, landmarks, segments: [1, 1, 1],
    rawRegistry: { regions: REGIONS, landmarks } });
  assert.deepEqual([built.ok, built.code], [false, 'DUP_ID']);
});

test('[P1-A05] every landmark slot needs a pinned module that matches the registry', () => {
  const landmarks = [stubLandmark('landmark01')];
  const base = { regions: REGIONS, landmarks, segments: [1, 1, 1] };
  const unpinned = build({ ...base, modules: REGIONS.map(pin) });
  assert.deepEqual([unpinned.ok, unpinned.code], [false, 'BAD_REF']);
  const stale = build({ ...base, modules: [...REGIONS.map(pin),
    { ...pin(landmarks[0]), moduleVersion: 2 }] });
  assert.deepEqual([stale.ok, stale.code], [false, 'BAD_REF']);
  const missing = build({ ...base, landmarkSlotIds: ['landmark01', 'landmark02'] });
  assert.deepEqual([missing.ok, missing.code], [false, 'BAD_REF']);
});

test('[P1-A07] the shipped default composition builds a world and queries real Spaces', () => {
  const registry = ok(createDefaultRegistry());
  const modules = [...registry.regions, ...registry.landmarks].map(pin);
  const built = ok(composeWorld({
    seed: 61, generatorFormat: 1, structuralConfig: copy(DEFAULT_STRUCTURAL_CONFIG),
    journeyConfig: copy(DEFAULT_JOURNEY_CONFIG), modules, adapters: [] },
  registry, createDefaultAdapters()));
  assert.deepEqual(built.descriptor.regionSlotIds, DEFAULT_JOURNEY_CONFIG.regionSlotIds);
  const snapshot = ok(queryWorld(built.context, { min: { x: 0, y: -2, z: 0 }, max: { x: 40, y: 8, z: 20 } }));
  const kinds = snapshot.spaces.map((s) => s.ownerKind).sort();
  assert.deepEqual(kinds, ['landmark', 'region', 'region', 'region', 'region']);
  const anchors = ok(resolveJourneyAnchors(built.context)).anchors;
  assert.equal(anchors.filter((a) => a.kind === 'landmark').length, DEFAULT_JOURNEY_CONFIG.landmarkSlotIds.length);
});
