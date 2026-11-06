// Traversal: how to move through one Space. Surfaces refer to Space volumes
// (the Space owns the geometry); links may point into another Space and are
// resolved later by validateResolved.
import {
  Fail, run, requireObject, str, oneOf, listOf, record, version, uniqueIds, objectId,
  extChecker,
} from './check.js';
import { supportRefShape } from './space.js';

const endpoint = (v, p) => record(v, p, { spaceId: objectId('s'), nodeId: str });

// Walkable support is solid.top or open.bottom (adapter faces are resolved by
// the volume's shape adapter and are not checked here).
const SUPPORT_VOLUME_KIND = { top: 'solid', bottom: 'open' };

export function validateTraversal(value, space, options = {}) {
  requireObject(value, 'validateTraversal');
  requireObject(space, 'validateTraversal(space)');
  return run(() => {
    const out = record(value, '', {
      formatVersion: version, spaceId: objectId('s'),
      nodes: listOf((v, p) => record(v, p, {
        nodeId: str, volumeId: str, levelId: str, surfaceId: str })),
      surfaces: listOf((v, p) => record(v, p, {
        surfaceId: str, kind: (k, pt) => oneOf(k, pt, ['walkable', 'scenic', 'blocked']),
        supportRef: supportRefShape })),
      links: listOf((v, p) => record(v, p, {
        linkId: str, from: endpoint, to: endpoint,
        kind: (k, pt) => oneOf(k, pt, ['walk', 'step', 'ladder', 'transition']),
        direction: (d, pt) => oneOf(d, pt, ['both', 'forward']) })),
      blockedVolumeIds: listOf(str),
    }, { ext: extChecker(options) });
    if (out.spaceId !== space.spaceId) throw new Fail('BAD_REF', '/spaceId');
    const volumeKinds = new Map(space.volumes.map((v) => [v.volumeId, v.kind]));
    const levels = new Set(space.levels.map((l) => l.levelId));
    uniqueIds(out.nodes, '/nodes', (n) => n.nodeId);
    uniqueIds(out.surfaces, '/surfaces', (s) => s.surfaceId);
    uniqueIds(out.links, '/links', (l) => l.linkId);
    uniqueIds(out.blockedVolumeIds, '/blockedVolumeIds');
    const surfaces = new Set(out.surfaces.map((s) => s.surfaceId));
    const nodes = new Set(out.nodes.map((n) => n.nodeId));
    out.surfaces.forEach((s, i) => {
      const ref = s.supportRef;
      const base = `/surfaces/${i}/supportRef`;
      if (!volumeKinds.has(ref.volumeId)) throw new Fail('BAD_REF', `${base}/volumeId`);
      const need = SUPPORT_VOLUME_KIND[ref.face];
      if (need && volumeKinds.get(ref.volumeId) !== need) throw new Fail('BAD_FIELD', `${base}/face`);
    });
    out.nodes.forEach((n, i) => {
      if (!volumeKinds.has(n.volumeId)) throw new Fail('BAD_REF', `/nodes/${i}/volumeId`);
      if (!levels.has(n.levelId)) throw new Fail('BAD_REF', `/nodes/${i}/levelId`);
      if (!surfaces.has(n.surfaceId)) throw new Fail('BAD_REF', `/nodes/${i}/surfaceId`);
    });
    out.blockedVolumeIds.forEach((id, i) => {
      if (!volumeKinds.has(id)) throw new Fail('BAD_REF', `/blockedVolumeIds/${i}`);
    });
    out.links.forEach((link, i) => {
      const base = `/links/${i}`;
      // A forward link is owned by its from-Space; a both link by the Space
      // whose spaceId sorts first (UTF-16 order), a function of the pair only.
      const owner = link.direction === 'forward' ? link.from.spaceId
        : (link.from.spaceId <= link.to.spaceId ? link.from.spaceId : link.to.spaceId);
      if (owner !== out.spaceId) throw new Fail('BAD_REF', `${base}/direction`);
      for (const end of ['from', 'to']) {
        // A target in another Space is resolved later (validateResolved).
        if (link[end].spaceId === out.spaceId && !nodes.has(link[end].nodeId)) {
          throw new Fail('BAD_REF', `${base}/${end}/nodeId`);
        }
      }
    });
    return out;
  });
}

// Resolves every link endpoint, including cross-Space targets, across a set of
// snapshots, and keeps link ids unique world-wide. Each snapshot must already
// pass validateSnapshot; this adds the checks no single Space can do.
export function validateResolved(snapshots) {
  if (!Array.isArray(snapshots)) throw new TypeError('validateResolved: expected an array');
  return run(() => {
    const nodesBySpace = new Map();
    for (const snapshot of snapshots) {
      for (const t of snapshot.traversals) {
        nodesBySpace.set(t.spaceId, new Set(t.nodes.map((n) => n.nodeId)));
      }
    }
    const ownerOfLink = new Map();
    snapshots.forEach((snapshot, i) => snapshot.traversals.forEach((t, j) => {
      t.links.forEach((link, k) => {
        const path = `/${i}/traversals/${j}/links/${k}`;
        if (ownerOfLink.has(link.linkId) && ownerOfLink.get(link.linkId) !== t.spaceId) {
          throw new Fail('DUP_ID', `${path}/linkId`);
        }
        ownerOfLink.set(link.linkId, t.spaceId);
        for (const end of ['from', 'to']) {
          const nodes = nodesBySpace.get(link[end].spaceId);
          if (!nodes || !nodes.has(link[end].nodeId)) throw new Fail('BAD_REF', `${path}/${end}`);
        }
      });
    }));
    return snapshots;
  });
}
