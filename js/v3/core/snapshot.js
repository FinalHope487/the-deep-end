// Snapshot: the canonical answer to one world query (Spaces plus their
// Traversals), identified by the query and guarded by a structural digest.
import {
  Fail, run, requireObject, isPlain, str, listOf, record, version, bounds, pattern,
  objectId, uniqueIds, checkOrdered, nested, readOwn,
} from './check.js';
import { canonicalJson, sha256Hex } from './hash.js';
import { makeQueryKey, makeSnapshotId } from './ids.js';
import { validateSpace, checkWater } from './space.js';
import { validateTraversal, checkLinkIds } from './traversal.js';

const DIGEST_RE = /^[0-9a-f]{64}$/;

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
    const idPath = `/traversals/${i}/spaceId`;
    if (!Object.hasOwn(raw, 'spaceId')) throw new Fail('MISSING_FIELD', idPath);
    // raw: no getter may run; the id is typed before it is looked up, so BAD_REF means a well-formed id with no Space
    const space = bySpace.get(objectId('s')(readOwn(raw, 'spaceId', `/traversals/${i}`), idPath));
    if (!space) throw new Fail('BAD_REF', idPath);
    return nested((t) => validateTraversal(t, space, options))(raw, `/traversals/${i}`);
  });
  uniqueIds(out.traversals, '/traversals', (t) => t.spaceId);
  checkOrdered(out.traversals, '/traversals', (t) => t.spaceId);
  // ids are unique and each names a Space here, so equal counts mean every Space has its one Traversal
  if (out.traversals.length !== out.spaces.length) throw new Fail('BAD_REF', '/traversals');
  checkLinkIds(out.traversals.map((traversal, i) => ({ traversal, path: `/traversals/${i}` })));
  checkWater(out.spaces.map((space, i) => ({ space, path: `/spaces/${i}` })));
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
