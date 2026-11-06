// Reviewer-owned red-first tests for P1 Slice 4: real APIs, real build and package.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeWorld, queryWorld } from '../../js/v3/core/world.js';
import { createDefaultRegistry } from '../../js/v3/modules/registry-config.js';
import { createDefaultAdapters } from '../../js/v3/modules/adapters.js';
import { DEFAULT_STRUCTURAL_CONFIG } from '../../js/v3/modules/world-config.js';
import { DEFAULT_JOURNEY_CONFIG } from '../../js/v3/modules/journey-config.js';
import { buildP1Summary } from '../../js/v3/diagnostic/view.js';
import { P1_REPO, command, successful, createScratch, packageScratch,
  manifestOf } from '../fixtures/v3/s4-fixture.mjs';

const BOUNDS = {
  min: { x: 0, y: -2, z: 0 }, max: { x: 32, y: 8, z: 16 },
};
function value(result) {
  assert.equal(result?.ok, true, JSON.stringify(result));
  return result.value;
}
function realWorld(seed) {
  const registry = value(createDefaultRegistry());
  const modules = [...registry.regions, ...registry.landmarks].map(({ descriptor: d }) => ({
    kind: d.kind, slotId: d.slotId, moduleId: d.moduleId,
    moduleVersion: d.moduleVersion,
  }));
  const config = {
    seed, generatorFormat: 1,
    structuralConfig: DEFAULT_STRUCTURAL_CONFIG,
    journeyConfig: DEFAULT_JOURNEY_CONFIG,
    modules, adapters: [],
  };
  const built = value(composeWorld(config, registry, createDefaultAdapters()));
  const snapshot = value(queryWorld(built.context, BOUNDS));
  return { descriptor: built.descriptor, snapshot };
}

test('[P1-V01] summary is pure and derived from real composeWorld/queryWorld', () => {
  const a = realWorld(42);
  const b = realWorld(61);
  const original = JSON.stringify(a);
  const first = buildP1Summary(a.descriptor, a.snapshot);
  const second = buildP1Summary(a.descriptor, a.snapshot);
  const different = buildP1Summary(b.descriptor, b.snapshot);
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first), [
    'seed', 'worldId', 'moduleCount', 'spaceCount', 'structuralDigest',
  ]);
  assert.equal(first.seed, 42);
  assert.equal(first.worldId, a.descriptor.worldId);
  assert.equal(first.moduleCount, a.descriptor.modules.length);
  assert.equal(first.moduleCount, 5);
  assert.equal(first.spaceCount, a.snapshot.spaces.length);
  assert.equal(first.spaceCount, 5);
  assert.equal(first.structuralDigest, a.snapshot.structuralDigest);
  assert.match(first.structuralDigest, /^[0-9a-f]{64}$/);
  assert.notEqual(first.worldId, different.worldId);
  assert.notEqual(first.structuralDigest, different.structuralDigest);
  assert.equal(JSON.stringify(a), original, 'summary mutated the real P1 inputs');
  assert.ok(Object.isFrozen(first));
  assert.throws(() => buildP1Summary(null, a.snapshot), TypeError);
  assert.throws(() => buildP1Summary(a.descriptor, { ...a.snapshot,
    worldId: different.worldId }), TypeError);
});

test('[P1-A09] actual diagnostic entry builds under the accepted CLI and HTML tag', () => {
  const out = mkdtempSync(join(tmpdir(), 'p1-s4-bundle-'));
  try {
    const built = command(process.execPath, [join(P1_REPO, 'tools/build.mjs'),
      '--root', P1_REPO, '--out', out,
      '--entry', 'js/v3/entry/main.js',
      '--html', 'js/v3/diagnostic/index.html'], P1_REPO);
    successful(built);
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    assert.match(html, /\/\/ ---- v3\/entry\/main\.js ----/);
    assert.match(html, /\/\/ ---- v3\/diagnostic\/view\.js ----/);
    assert.match(html, /\/\/ ---- v3\/core\/world\.js ----/);
    assert.match(html, /createDefaultRegistry/);
    assert.match(html, /composeWorld\(/);
    assert.match(html, /queryWorld\(/);
    assert.doesNotMatch(html, /\/\/ ---- main\.js ----/,
      'P1 must not bundle the v1 entry');
    assert.doesNotMatch(html, /\/\/ ---- v3\/core\/contracts\.js ----/,
      'contracts.js uses unsupported export-from re-exports');
    assert.equal((html.match(/<script type="importmap">/g) || []).length, 1);
    assert.equal((html.match(/<title>/g) || []).length, 1);
    assert.ok(existsSync(join(out, 'js/v3/core/world.js')));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('[P1-A09] p1/p1-rK package real commits; p0 remains the default target', () => {
  const scratch = createScratch();
  try {
    successful(packageScratch(scratch.repo, 'p1-r1'));
    successful(packageScratch(scratch.repo, 'p1', ['--match', 'p1-r1']));
    successful(packageScratch(scratch.repo, 'p0-r1'));
    const candidate = manifestOf(scratch.repo, 'p1-r1');
    const frozen = manifestOf(scratch.repo, 'p1');
    const legacy = manifestOf(scratch.repo, 'p0-r1');
    assert.equal(candidate.commit, scratch.commit);
    assert.equal(frozen.commit, scratch.commit);
    assert.equal(candidate.payloadHash, frozen.payloadHash,
      'p1 freeze must match candidate bytes excluding manifest');
    assert.notEqual(candidate.payloadHash, legacy.payloadHash);
    const artifact = join(scratch.repo, 'versions', 'p1-r1');
    const html = readFileSync(join(artifact, 'index.html'), 'utf8');
    assert.match(html, /id="p1-status"/);
    assert.match(html, /\/\/ ---- v3\/entry\/main\.js ----/);
    assert.doesNotMatch(html, /\/\/ ---- main\.js ----/);
    assert.equal((html.match(/<script type="importmap">/g) || []).length, 1);
    assert.match(html, /\.\/vendor\/three-0\.170\.0\.module\.min\.js/);
    assert.ok(existsSync(join(artifact, 'js/gen2-s2-worker.js')));
    assert.ok(existsSync(join(artifact, 'audio')));
    assert.ok(existsSync(join(artifact, 'vendor/three-0.170.0.module.min.js')));
    const p0 = readFileSync(join(scratch.repo, 'versions/p0-r1/index.html'), 'utf8');
    assert.match(p0, /\/\/ ---- main\.js ----/);
    assert.doesNotMatch(p0, /\/\/ ---- v3\/entry\/main\.js ----/);
    assert.equal(existsSync(join(scratch.repo, 'versions/p0-r1/js/v3')), false);
    const unsupported = packageScratch(scratch.repo, 'p2');
    assert.equal(unsupported.status, 1,
      'unimplemented phase must not silently package a P0 page');
    assert.equal(existsSync(join(scratch.repo, 'versions/p2')), false);
  } finally {
    scratch.cleanup();
  }
});
