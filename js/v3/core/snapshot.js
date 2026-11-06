// Snapshot: the canonical answer to one world query (Spaces plus their
// Traversals), identified by the query and guarded by a structural digest.
import {
  Fail, run, requireObject, isPlain, str, listOf, record, version, bounds, pattern,
  objectId, uniqueIds, checkOrdered, nested,
} from './check.js';
import { canonicalJson, sha256Hex } from './hash.js';
import { makeQueryKey, makeSnapshotId } from './ids.js';
import { validateSpace } from './space.js';
import { validateTraversal } from './traversal.js';

const DIGEST_RE = /^[0-9a-f]{64}$/;

// Shared water bodies must agree on level and anchor space across Spaces.
function checkWater(spaces) {
  const groups = new Map();
  spaces.forEach((space, i) => space.features.forEach((feature, j) => {
    if (feature.waterBodyId === null) return;
    const entry = { feature, path: `/spaces/${i}/features/${j}/params` };
    if (!groups.has(feature.waterBodyId)) groups.set(feature.waterBodyId, []);
    groups.get(feature.waterBodyId).push(entry);
  }));
  for (const members of groups.values()) {
    const first = members[0].feature.params;
    for (const { feature, path } of members) {
      if (feature.params.levelY !== first.levelY) throw new Fail('BAD_WATER_LEVEL', `${path}/levelY`);
    }
    for (const { feature, path } of members) {
      if (feature.params.anchorSpaceId !== first.anchorSpaceId) {
        throw new Fail('BAD_WATER_ANCHOR', `${path}/anchorSpaceId`);
      }
    }
  }
}

// The digest covers the validated (canonical) Spaces and Traversals, never raw generator output.
export const snapshotDigest = ({ worldId, spaces, traversals }) => sha256Hex(canonicalJson({ worldId, spaces, traversals }));

// Every check except the digest. queryWorld validates first and derives the digest from the result.
export function checkSnapshotBody(value, options = {}) {
  const out = record(value, '', {
    formatVersion: version, worldId: objectId('w'), queryBounds: bounds,
    snapshotId: str, spaces: listOf(nested((s) => validateSpace(s, options))),
    traversals: listOf(plainObject), structuralDigest: pattern(DIGEST_RE),
  });
  const expectedId = makeSnapshotId(makeQueryKey(out.worldId, out.queryBounds));
  if (out.snapshotId !== expectedId) throw new Fail('BAD_QUERY_KEY', '/snapshotId');
  uniqueIds(out.spaces, '/spaces', (s) => s.spaceId);
  checkOrdered(out.spaces, '/spaces', (s) => s.spaceId);
  out.spaces.forEach((space, i) => {
    if (space.worldId !== out.worldId) throw new Fail('BAD_REF', `/spaces/${i}/worldId`);
  });
  const bySpace = new Map(out.spaces.map((s) => [s.spaceId, s]));
  out.traversals = out.traversals.map((raw, i) => {
    const space = bySpace.get(raw.spaceId);
    if (!space) throw new Fail('BAD_REF', `/traversals/${i}/spaceId`);
    return nested((t) => validateTraversal(t, space, options))(raw, `/traversals/${i}`);
  });
  uniqueIds(out.traversals, '/traversals', (t) => t.spaceId);
  checkOrdered(out.traversals, '/traversals', (t) => t.spaceId);
  checkWater(out.spaces);
  return out;
}

export function validateSnapshot(value, options = {}) {
  requireObject(value, 'validateSnapshot');
  return run(() => {
    const out = checkSnapshotBody(value, options);
    if (snapshotDigest(out) !== out.structuralDigest) throw new Fail('BAD_DIGEST', '/structuralDigest');
    return out;
  });
}

function plainObject(value, path) {
  if (!isPlain(value)) throw new Fail('BAD_TYPE', path);
  return value;
}
