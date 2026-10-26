// T6 test oracle: what the handoff says a distance passage looks like, written from the 8820/8821 stream and the room unions alone
// (no production helper), shared by the topology and link-distance tests.
import assert from 'node:assert/strict';
import { hash2, mulberry32 } from '../../js/rng.js';

export const SLOT_ORDER = ['anchor', 'E', 'S', 'T'];

// the descriptors of a built plan, decoded from its geometry alone: the cell from where the room stands, the slot from the T3 order
export function specOf(plan) {
  const OX = 128 * plan.a, OZ = 128 * plan.b, count = [0, 0, 0, 0];
  return plan.rooms.map((room) => {
    const q = room.rects[0], cell = ((q.x0 + q.x1) / 2 - OX >= 64 ? 1 : 0) + ((q.z0 + q.z1) / 2 - OZ >= 64 ? 2 : 0);
    return { spaceId: room.spaceId, cell, slot: SLOT_ORDER[count[cell]++], role: room.role, shape: room.rects.length === 2 ? 'L' : 'rect' };
  });
}

// the width and ceiling of sorted link k, from the two draws of the 8820/8821 stream
export function passageDraws(seed, a, b, k) {
  const r = mulberry32(hash2(hash2(seed >>> 0, a, b, 8820), k, Math.floor(k / 0x100000000), 8821));
  const widthDraw = r(), ceilDraw = r();
  return { width: [1.5, 2, 2, 2.5, 3, 3.5][Math.floor(widthDraw * 6)], ceil: [2, 2.5, 3][Math.floor(ceilDraw * 3)] };
}

// the outermost face of a room union along an axis over a lateral span: only rects that cover the whole span count
export function faceOf(room, axis, high, lo, hi) {
  const [l0, l1, n0, n1] = axis === 'x' ? ['z0', 'z1', 'x0', 'x1'] : ['x0', 'x1', 'z0', 'z1'];
  const covering = room.rects.filter((s) => s[l0] <= lo && s[l1] >= hi);
  assert.ok(covering.length >= 1, `${room.spaceId}: a rect of the union covers ${lo}..${hi}`);
  return high ? Math.max(...covering.map((s) => s[n1])) : Math.min(...covering.map((s) => s[n0]));
}

// the passage between rooms p < q of the plan (sorted link k): lane base by class plus the 0.25 m phase of an odd-half width, 0.5 m into each face.
// Returns the rectangle and the normal axis, the lane centre and the two faces (lower, upper) in spatial order.
export function passageOracle(plan, spec, p, q, k, seed) {
  const OX = 128 * plan.a, OZ = 128 * plan.b, [sp, sq] = [spec[p], spec[q]], { width: w } = passageDraws(seed, plan.a, plan.b, k);
  const phase = Number.isInteger(w) ? 0 : 0.25, A = plan.rooms[p], B = plan.rooms[q];
  if (sp.cell === sq.cell) {   // E-T: built in the canonical frame (phase first), then reflected once by the cell flips
    const fx = sp.cell & 1, fz = sp.cell >> 1, cen = 52.5 + phase, lo = cen - w / 2, hi = cen + w / 2;
    const canon = (room) => ({ spaceId: room.spaceId, rects: room.rects.map((s) => ({
      x0: fx ? 128 - (s.x1 - OX) : s.x0 - OX, x1: fx ? 128 - (s.x0 - OX) : s.x1 - OX,
      z0: fz ? 128 - (s.z1 - OZ) : s.z0 - OZ, z1: fz ? 128 - (s.z0 - OZ) : s.z1 - OZ })) });
    const z0 = faceOf(canon(A), 'z', true, lo, hi), z1 = faceOf(canon(B), 'z', false, lo, hi);
    const rect = { x0: OX + (fx ? 128 - hi : lo), x1: OX + (fx ? 128 - lo : hi), z0: OZ + (fz ? 128 - (z1 + 0.5) : z0 - 0.5), z1: OZ + (fz ? 128 - (z0 - 0.5) : z1 + 0.5) };
    return { rect, axis: 'z', width: w, centre: (rect.x0 + rect.x1) / 2, faces: [rect.z0 + 0.5, rect.z1 - 0.5] };
  }
  if (sq.cell - sp.cell === 1) {   // E-E and T-T across the x seam: the lane is a z coordinate
    const cen = OZ + { E: [32, 96], T: [46, 82] }[sp.slot][sp.cell >> 1] + phase, lo = cen - w / 2, hi = cen + w / 2;
    const f0 = faceOf(A, 'x', true, lo, hi), f1 = faceOf(B, 'x', false, lo, hi);
    return { rect: { x0: f0 - 0.5, x1: f1 + 0.5, z0: lo, z1: hi }, axis: 'x', width: w, centre: cen, faces: [f0, f1] };
  }
  const cen = OX + [32, 96][sp.cell & 1] + phase, lo = cen - w / 2, hi = cen + w / 2;   // S-S across the z seam
  const f0 = faceOf(A, 'z', true, lo, hi), f1 = faceOf(B, 'z', false, lo, hi);
  return { rect: { x0: lo, x1: hi, z0: f0 - 0.5, z1: f1 + 0.5 }, axis: 'z', width: w, centre: cen, faces: [f0, f1] };
}

export const wantPassage = (plan, spec, p, q, k, seed) => passageOracle(plan, spec, p, q, k, seed).rect;
