// Traversal: how to move through one Space. Surfaces refer to Space volumes
// (the Space owns the geometry); links may point into another Space and are
// resolved later by validateResolved.
import {
  Fail, run, requireObject, oneOf, listOf, record, version, uniqueIds, checkOrdered, objectId,
  extChecker, sortedUniqueStrings, localKey, sameWorld,
} from './check.js';
import { supportRefShape, DEFAULT_SHAPE_ADAPTERS } from './space.js';

const endpoint = (v, p) => record(v, p, { spaceId: objectId('s'), nodeId: localKey });

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
        nodeId: localKey, volumeId: localKey, levelId: localKey, surfaceId: localKey })),
      surfaces: listOf((v, p) => record(v, p, {
        surfaceId: localKey, kind: (k, pt) => oneOf(k, pt, ['walkable', 'scenic', 'blocked']),
        supportRef: supportRefShape })),
      links: listOf((v, p) => record(v, p, {
        linkId: localKey, from: endpoint, to: endpoint,
        kind: (k, pt) => oneOf(k, pt, ['walk', 'step', 'ladder', 'transition']),
        direction: (d, pt) => oneOf(d, pt, ['both', 'forward']) })),
      blockedVolumeIds: sortedUniqueStrings(localKey),
    }, { ext: extChecker(options) });
    if (out.spaceId !== space.spaceId) throw new Fail('BAD_REF', '/spaceId');
    const volumeKinds = new Map(space.volumes.map((v) => [v.volumeId, v.kind]));
    const levels = new Set(space.levels.map((l) => l.levelId));
    for (const [items, path, key] of [
      [out.nodes, '/nodes', (n) => n.nodeId], [out.surfaces, '/surfaces', (s) => s.surfaceId],
      [out.links, '/links', (l) => l.linkId]]) {
      uniqueIds(items, path, key);
      checkOrdered(items, path, key);
    }
    const surfaceVolume = new Map(out.surfaces.map((s) => [s.surfaceId, s.supportRef.volumeId]));
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
      // rev6:36: the node's surface is supported by the node's own volume
      if (surfaceVolume.get(n.surfaceId) !== n.volumeId) throw new Fail('BAD_REF', `/nodes/${i}/surfaceId`);
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
        // an endpoint may sit in a Space that is not loaded, but never in another world (rev4 section 3)
        sameWorld(link[end].spaceId, space.worldId, `${base}/${end}/spaceId`);
        // A target in another Space is resolved later (validateResolved).
        if (link[end].spaceId === out.spaceId && !nodes.has(link[end].nodeId)) {
          throw new Fail('BAD_REF', `${base}/${end}/nodeId`);
        }
      }
    });
    return out;
  });
}

// A walk link joins two walking surfaces, so their world elevations must agree.
// step, ladder and transition links may change elevation.
export const WALK_ELEVATION_TOLERANCE = 1e-6;

// World y of the support face behind a node, or null when it cannot be known
// (unknown shape kind, adapter face, or an adapter without faceElevation);
// validateResolved reports null on a walk link as UNKNOWN_SURFACE.
function nodeElevation(entry, nodeId, shapeAdapters) {
  const node = entry.traversal.nodes.find((n) => n.nodeId === nodeId);
  const surface = entry.traversal.surfaces.find((s) => s.surfaceId === node.surfaceId);
  const { volumeId, face } = surface.supportRef;
  if (face === 'adapter') return null;
  const volume = entry.space.volumes.find((v) => v.volumeId === volumeId);
  const adapter = shapeAdapters[volume.shape.kind];
  if (!adapter || typeof adapter.faceElevation !== 'function') return null;
  const local = adapter.faceElevation(volume.shape.p, face);
  const world = entry.space.frame.origin.y + local; // finite parts can still overflow when added
  return Number.isFinite(local) && Number.isFinite(world) ? world : null;
}

// Resolves every link endpoint, including cross-Space targets, across a set of
// snapshots, keeps link ids unique world-wide and checks walk link elevations.
// Each snapshot must already pass validateSnapshot; this adds the checks no
// single Space can do.
export function validateResolved(snapshots, options = {}) {
  if (!Array.isArray(snapshots)) throw new TypeError('validateResolved: expected an array');
  const shapeAdapters = options.shapeAdapters ?? DEFAULT_SHAPE_ADAPTERS;
  return run(() => {
    const nodesBySpace = new Map();
    const entries = new Map();
    for (const snapshot of snapshots) {
      const spaces = new Map(snapshot.spaces.map((s) => [s.spaceId, s]));
      for (const t of snapshot.traversals) {
        nodesBySpace.set(t.spaceId, new Set(t.nodes.map((n) => n.nodeId)));
        entries.set(t.spaceId, { space: spaces.get(t.spaceId), traversal: t });
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
        if (link.kind !== 'walk') return;
        const a = nodeElevation(entries.get(link.from.spaceId), link.from.nodeId, shapeAdapters);
        const b = nodeElevation(entries.get(link.to.spaceId), link.to.nodeId, shapeAdapters);
        // Unresolved is not verified: a walk link needs both elevations.
        if (a === null) throw new Fail('UNKNOWN_SURFACE', `${path}/from`);
        if (b === null) throw new Fail('UNKNOWN_SURFACE', `${path}/to`);
        if (Math.abs(a - b) > WALK_ELEVATION_TOLERANCE) throw new Fail('BAD_REF', `${path}/to`);
      });
    }));
    return snapshots;
  });
}
