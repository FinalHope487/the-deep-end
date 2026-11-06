// Traversal: how to move through one Space. Surfaces refer to Space volumes
// (the Space owns the geometry); links may point into another Space and are
// resolved later by validateResolved.
import {
  Fail, run, requireObject, str, oneOf, listOf, record, version, uniqueIds, objectId,
} from './check.js';

const face = (v, p) => oneOf(v, p, ['bottom', 'top', 'side']);
const endpoint = (v, p) => record(v, p, { spaceId: objectId('s'), nodeId: str });

export function validateTraversal(value, space) {
  requireObject(value, 'validateTraversal');
  requireObject(space, 'validateTraversal(space)');
  return run(() => {
    const out = record(value, '', {
      formatVersion: version, spaceId: objectId('s'),
      nodes: listOf((v, p) => record(v, p, {
        nodeId: str, volumeId: str, levelId: str, surfaceId: str })),
      surfaces: listOf((v, p) => record(v, p, {
        surfaceId: str, kind: (k, pt) => oneOf(k, pt, ['walkable', 'climbable']),
        supportRef: (r, pt) => record(r, pt, { volumeId: str, face }) })),
      links: listOf((v, p) => record(v, p, {
        linkId: str, from: endpoint, to: endpoint,
        kind: (k, pt) => oneOf(k, pt, ['walk', 'step', 'climb', 'portal']),
        direction: (d, pt) => oneOf(d, pt, ['both', 'forward']) })),
      blockedVolumeIds: listOf(str),
    });
    if (out.spaceId !== space.spaceId) throw new Fail('BAD_REF', '/spaceId');
    const volumes = new Set(space.volumes.map((v) => v.volumeId));
    const levels = new Set(space.levels.map((l) => l.levelId));
    uniqueIds(out.nodes, '/nodes', (n) => n.nodeId);
    uniqueIds(out.surfaces, '/surfaces', (s) => s.surfaceId);
    uniqueIds(out.links, '/links', (l) => l.linkId);
    uniqueIds(out.blockedVolumeIds, '/blockedVolumeIds');
    const surfaces = new Set(out.surfaces.map((s) => s.surfaceId));
    const nodes = new Set(out.nodes.map((n) => n.nodeId));
    out.surfaces.forEach((s, i) => {
      if (!volumes.has(s.supportRef.volumeId)) {
        throw new Fail('BAD_REF', `/surfaces/${i}/supportRef/volumeId`);
      }
    });
    out.nodes.forEach((n, i) => {
      if (!volumes.has(n.volumeId)) throw new Fail('BAD_REF', `/nodes/${i}/volumeId`);
      if (!levels.has(n.levelId)) throw new Fail('BAD_REF', `/nodes/${i}/levelId`);
      if (!surfaces.has(n.surfaceId)) throw new Fail('BAD_REF', `/nodes/${i}/surfaceId`);
    });
    out.blockedVolumeIds.forEach((id, i) => {
      if (!volumes.has(id)) throw new Fail('BAD_REF', `/blockedVolumeIds/${i}`);
    });
    out.links.forEach((link, i) => {
      if (link.from.spaceId !== out.spaceId) throw new Fail('BAD_REF', `/links/${i}/from/spaceId`);
      if (!nodes.has(link.from.nodeId)) throw new Fail('BAD_REF', `/links/${i}/from/nodeId`);
      // A cross-Space target is resolved later (validateResolved).
      if (link.to.spaceId === out.spaceId && !nodes.has(link.to.nodeId)) {
        throw new Fail('BAD_REF', `/links/${i}/to/nodeId`);
      }
    });
    return out;
  });
}

// Resolves every link endpoint, including cross-Space targets, across a set of
// snapshots. Each snapshot must already pass validateSnapshot; this adds the
// check no single Space can do.
export function validateResolved(snapshots) {
  if (!Array.isArray(snapshots)) throw new TypeError('validateResolved: expected an array');
  return run(() => {
    const nodesBySpace = new Map();
    for (const snapshot of snapshots) {
      for (const t of snapshot.traversals) {
        nodesBySpace.set(t.spaceId, new Set(t.nodes.map((n) => n.nodeId)));
      }
    }
    snapshots.forEach((snapshot, i) => snapshot.traversals.forEach((t, j) => {
      t.links.forEach((link, k) => {
        for (const end of ['from', 'to']) {
          const nodes = nodesBySpace.get(link[end].spaceId);
          if (!nodes || !nodes.has(link[end].nodeId)) {
            throw new Fail('BAD_REF', `/${i}/traversals/${j}/links/${k}/${end}`);
          }
        }
      });
    }));
    return snapshots;
  });
}
