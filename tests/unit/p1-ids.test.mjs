// Check IDs: P1-A03 (AR-06)
// Required exports:
// ids.js: makeWorldObjectId(kind, seed, fingerprint, localKey) -> string;
//   parseWorldObjectId(text) -> Result<{kind,seed,configFingerprint,localKey}>;
//   encodeCoordinate(integer) -> string; decodeCoordinate(text) -> Result<number>;
//   validateUniqueLocalKeys(keys) -> Result<keys>;
//   validateSnapshotId(text) -> Result<string>;
//   makeQueryKey(worldId, bounds) -> 16 lowercase hex;
//   makeSnapshotId(queryKey) -> string;
//   validateRequestId(text) -> Result<string>;
//   makeConfigFingerprint(input) -> 12 lowercase hex;
//   makeLineageId(input) -> 12 lowercase hex.
// hash.js: sha256Hex(text) -> 64 lowercase hex;
//   canonicalJson(value) -> compact, key-sorted JSON string.
// Invalid ID input to a validator returns {ok:false,code,path};
// invalid arguments to the make/encode helpers fail loudly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeWorldObjectId, parseWorldObjectId, encodeCoordinate,
  decodeCoordinate, validateUniqueLocalKeys, validateSnapshotId,
  makeQueryKey, makeSnapshotId, validateRequestId,
  makeConfigFingerprint, makeLineageId,
} from '../../js/v3/core/ids.js';
import { sha256Hex, canonicalJson } from '../../js/v3/core/hash.js';

function ok(result) {
  assert.equal(result?.ok, true, JSON.stringify(result));
  return result.value;
}
function bad(result, code) {
  assert.equal(result?.ok, false, JSON.stringify(result));
  assert.equal(result.code, code);
  assert.equal(typeof result.path, 'string');
}
const fp = 'abcdef012345';
const testBounds = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 10, y: 5, z: 10 },
};
function input() {
  return {
    seed: 42, generatorFormat: 1,
    structuralConfig: { cellSize: 64, maxSpaceExtent: 64 },
    journeyConfig: { regionSlotIds: ['region01'], landmarkSlotIds: [],
      exitSlotId: 'exit01', segments: [12, 18], objectiveIds: [] },
    modules: [{ kind: 'region', slotId: 'region01',
      moduleId: 'test.region', moduleVersion: 1 }],
    adapters: [{ adapterId: 'test.geometry', adapterVersion: 1 }],
  };
}

test('[P1-A03] five world-object kinds share a stable versioned format', () => {
  for (const kind of ['w', 'r', 'l', 's', 'f']) {
    const id = makeWorldObjectId(kind, 42, fp, 'region01.item_2~x');
    assert.equal(id, `${kind}:v1:0000002a-${fp}:region01.item_2~x`);
    assert.deepEqual(ok(parseWorldObjectId(id)), {
      kind, seed: 42, configFingerprint: fp, localKey: 'region01.item_2~x',
    });
  }
});

test('[P1-A03] seed zero, max unsigned-32 and normalized negative zero', () => {
  assert.equal(makeWorldObjectId('w', 0, fp, 'root'),
    `w:v1:00000000-${fp}:root`);
  assert.equal(makeWorldObjectId('w', 4294967295, fp, 'root'),
    `w:v1:ffffffff-${fp}:root`);
  assert.equal(makeWorldObjectId('w', -0, fp, 'root'),
    `w:v1:00000000-${fp}:root`);
  for (const seed of [-1, 1.5, 4294967296, Infinity, NaN]) {
    assert.throws(() => makeWorldObjectId('w', seed, fp, 'root'));
  }
});

test('[P1-A03] local keys and unknown version or kind are rejected', () => {
  for (const tail of ['bad/path', 'with space', 'with:colon', '']) {
    assert.equal(parseWorldObjectId(`w:v1:0000002a-${fp}:${tail}`).ok, false);
  }
  assert.equal(parseWorldObjectId(`x:v1:0000002a-${fp}:root`).ok, false);
  assert.equal(parseWorldObjectId(`w:v2:0000002a-${fp}:root`).ok, false);
  assert.equal(parseWorldObjectId(`w:v1:0000002a-${fp.toUpperCase()}:root`).ok, false);
  assert.throws(() => makeWorldObjectId('w', 42, fp, 'bad/path'));
});

test('[P1-A03] signed coordinates use n/p, with zero encoded p0', () => {
  for (const [number, encoded] of [
    [-12, 'n12'], [-1, 'n1'], [0, 'p0'], [-0, 'p0'], [1, 'p1'], [120, 'p120'],
  ]) {
    assert.equal(encodeCoordinate(number), encoded);
    assert.equal(ok(decodeCoordinate(encoded)), Object.is(number, -0) ? 0 : number);
  }
  for (const badText of ['n0', 'p-1', 'n-1', 'p01', 'x1', '']) {
    assert.equal(decodeCoordinate(badText).ok, false);
  }
  assert.throws(() => encodeCoordinate(1.5));
});

test('[P1-A03] local ID sets reject duplicates without touching other scopes', () => {
  assert.deepEqual(ok(validateUniqueLocalKeys(['node.a', 'node.b'])),
    ['node.a', 'node.b']);
  bad(validateUniqueLocalKeys(['node.a', 'node.a']), 'DUP_ID');
  assert.equal(validateUniqueLocalKeys(['bad/path']).ok, false);
});

test('[P1-A03] query and snapshot IDs are derived, not counter-based', () => {
  const worldId = 'w:v1:0000002a-69b8b1b2746b:root';
  const queryKey = makeQueryKey(worldId, testBounds);
  assert.equal(queryKey, '5e6296db1aae891f');
  assert.match(queryKey, /^[0-9a-f]{16}$/);
  assert.equal(makeQueryKey(worldId, structuredClone(testBounds)), queryKey);
  const snap = makeSnapshotId(queryKey);
  assert.equal(snap, `snap:v1:${queryKey}`);
  assert.equal(ok(validateSnapshotId(snap)), snap);
  assert.equal(validateSnapshotId('snap:v2:5e6296db1aae891f').ok, false);
  assert.equal(validateSnapshotId('snap:v1:zzzzzzzzzzzzzzzz').ok, false);
});

test('[P1-A03] request IDs are opaque ASCII with a 64-character cap', () => {
  assert.equal(ok(validateRequestId('req-42_.')), 'req-42_.');
  assert.equal(ok(validateRequestId('a'.repeat(64))), 'a'.repeat(64));
  assert.equal(validateRequestId('').ok, false);
  assert.equal(validateRequestId('a'.repeat(65)).ok, false);
  assert.equal(validateRequestId('\u6e2c').ok, false);
});

test('[P1-A03] structural fingerprints include the entire frozen identity', () => {
  const original = input();
  const hash = makeConfigFingerprint(original);
  assert.equal(hash, '69b8b1b2746b');
  assert.match(hash, /^[0-9a-f]{12}$/);
  const reordered = structuredClone(original);
  reordered.structuralConfig = { maxSpaceExtent: 64, cellSize: 64 };
  assert.equal(makeConfigFingerprint(reordered), hash);
  for (const alter of [
    (x) => { x.journeyConfig.segments[0]++; },
    (x) => { x.journeyConfig.exitSlotId = 'exit02'; },
    (x) => { x.modules[0].kind = 'landmark'; },
    (x) => { x.modules[0].moduleVersion++; },
    (x) => { x.adapters[0].adapterVersion++; },
    (x) => { x.structuralConfig.cellSize = 32; },
  ]) {
    const changed = input();
    alter(changed);
    assert.notEqual(makeConfigFingerprint(changed), hash);
  }
  const atmospheric = { ...original, atmosphere: { fog: 0.7 } };
  assert.equal(makeConfigFingerprint(atmospheric), hash);
});

test('[P1-A03] module and adapter list input order cannot alter fingerprint', () => {
  const a = input();
  a.modules.push({ kind: 'landmark', slotId: 'landmark01',
    moduleId: 'test.landmark', moduleVersion: 2 });
  a.adapters.push({ adapterId: 'test.water', adapterVersion: 1 });
  const b = structuredClone(a);
  b.modules.reverse();
  b.adapters.reverse();
  assert.equal(makeConfigFingerprint(a), makeConfigFingerprint(b));
  assert.notEqual(makeConfigFingerprint(a), makeConfigFingerprint(input()));
});

test('[P1-A03] progress lineage ignores module version but tracks journey slots', () => {
  const base = { seed: 42, generatorFormat: 1,
    regionSlotIds: ['region01'], landmarkSlotIds: [], exitSlotId: 'exit01' };
  assert.equal(makeLineageId(base), 'af19d74f82a2');
  const slotsChanged = { ...base, regionSlotIds: ['region02'] };
  assert.notEqual(makeLineageId(slotsChanged), makeLineageId(base));
});

test('[P1-A03] synchronous SHA-256 matches known vectors and padding edges', () => {
  const pairs = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['a'.repeat(55), '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318'],
    ['a'.repeat(56), 'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a'],
    ['a'.repeat(57), 'f13b2d724659eb3bf47f2dd6af1accc87b81f09f59f2b75e5c0bed6589dfe8c6'],
    ['a'.repeat(63), '7d3e74a05d7db15bce4ad9ec0658ea98e3f06eeecf16b4c6fff2da457ddc2f34'],
    ['a'.repeat(64), 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb'],
    ['a'.repeat(65), '635361c48bb9eab14198e76ea8ab7f1a41685d6ad62aa9146d301d4f17eb0ae0'],
    ['\ud83d\ude00', 'f0443a342c5ef54783a111b51ba56c938e474c32324d90c3a60c9c8e3a37e2d9'],
    ['a'.repeat(1048576), '9bc1b2a288b26af7257a36277ae3816a7d4f16e89c1e7e77d0a5c48bad62b360'],
  ];
  for (const [message, expected] of pairs) assert.equal(sha256Hex(message), expected);
});

test('[P1-A03] canonical JSON sorts keys, normalizes -0 and rejects invalids', () => {
  assert.equal(canonicalJson({ z: -0, a: { y: -0, x: [true, null, 4] } }),
    '{"a":{"x":[true,null,4],"y":0},"z":0}');
  assert.equal(canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }));
  const cyclic = {};
  cyclic.self = cyclic;
  const sparse = [];
  sparse[2] = 3;
  for (const value of [
    { x: Infinity }, { x: NaN }, { x: undefined },
    { x: () => 1 }, { x: cyclic }, { x: sparse },
    { x: new Date() },
  ]) {
    assert.throws(() => canonicalJson(value));
  }
});
