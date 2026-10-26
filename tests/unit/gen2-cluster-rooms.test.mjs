// T3 cluster rooms: the pure production builder (templates, reflections, roles, ceilings, the 46-draw stream, reference passages and the
// immutable geometry gates). Integration, protection and production-share tests join this file in later commits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { World2, CLUSTER_SHARE, clusterAccessMouths } from '../../js/gen2.js';
import { buildClusterDistrict, fixtureCluster, validateDistrictPlan } from '../../js/gen2-district.js';
import { hash2, mulberry32 } from '../../js/rng.js';
import { Player } from '../../js/player.js';
import { reachSet } from './reach.mjs';
import { CORPUS } from '../../js/gen2-measure.js';
import { legacyReport, preT6Report } from './gen2-legacy-report.mjs';

const SEEDS = [1, 2, 3, 7, 42, 99, 1234, 20261024];
const CEIL = { small: [3, 3.5, 4], medium: [3.5, 4, 4.5], main: [4, 4.5, 5], giant: [4.5, 5, 5.5] };
const ANCHOR = { main: [16, 48, 16, 48], giant: [12, 48, 12, 48] };
const SAT = {   // NW-canonical bounding rectangles: [x0, x1, z0, z1]
  E: { small: [48.5, 61.5, 27, 37], medium: [48.5, 63.5, 24.5, 39] },
  S: { small: [27, 37, 48.5, 61.5], medium: [24.5, 39, 48.5, 63.5] },
  T: { small: [48.5, 61.5, 41, 51], medium: [48.5, 63.5, 40, 54.5] },
};
const AREA = { small: [130, 121], medium: [217.5, 208.5], main: [1024], giant: [1296] };
const FLIPS = [[false, false], [true, false], [false, true], [true, true]];   // NW, NE, SW, SE
const SLOTS = ['E', 'S', 'T'];

const q2 = (v) => Number.isInteger(v / 0.5);
const rectArea = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);
const overlapArea = (p, q) => Math.max(0, Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)) * Math.max(0, Math.min(p.z1, q.z1) - Math.max(p.z0, q.z0));
const sum = (list) => list.reduce((s, v) => s + v, 0);
// T6: the passage width of sorted link k, from the 8820/8821 stream (first of two draws) without the production helper
const widthOf = (seed, a, b, k) => [1.5, 2, 2, 2.5, 3, 3.5][Math.floor(mulberry32(hash2(hash2(seed >>> 0, a, b, 8820), k, Math.floor(k / 0x100000000), 8821))() * 6)];
const bounds = (rects) => ({ x0: Math.min(...rects.map((q) => q.x0)), x1: Math.max(...rects.map((q) => q.x1)), z0: Math.min(...rects.map((q) => q.z0)), z1: Math.max(...rects.map((q) => q.z1)) });
const frozenDeep = (o) => !o || typeof o !== 'object' || (Object.isFrozen(o) && Object.values(o).every(frozenDeep));
const flip = (lo, hi, f) => (f ? [128 - hi, 128 - lo] : [lo, hi]);
// a canonical [x0, x1, z0, z1] box in the cell with these flips, in global coordinates
const place = ([x0, x1, z0, z1], [fx, fz], a, b) => {
  const [X0, X1] = flip(x0, x1, fx), [Z0, Z1] = flip(z0, z1, fz);
  return { x0: 128 * a + X0, x1: 128 * a + X1, z0: 128 * b + Z0, z1: 128 * b + Z1 };
};

const worlds = new Map();
const yOf = (seed) => { if (!worlds.has(seed)) worlds.set(seed, new World2(seed, { clusterShare: 0 }).Y); return worlds.get(seed); };
const corpus = [];
for (const seed of SEEDS) for (let b = -2; b <= 1; b++) for (let a = -2; a <= 1; a++) corpus.push({ seed, a, b, Y: yOf(seed) });
const built = new Map();
const planOf = (c) => { const k = `${c.seed},${c.a},${c.b}`; if (!built.has(k)) built.set(k, buildClusterDistrict(c.seed, c.a, c.b, c.Y)); return built.get(k); };

// an independent oracle: take all 46 draws first, then read them by position
function oracle(seed, a, b, Y) {
  const r = mulberry32(hash2(seed >>> 0, a, b, 7710));
  const d = Array.from({ length: 46 }, () => r());
  const giant = d[0] < 0.125, giantCell = Math.floor(d[1] * 4), cap = Y[1] - 1.5;
  const pick = (role, u) => { const e = CEIL[role].filter((h) => h <= cap); return e[Math.floor(u * e.length)]; };
  return FLIPS.map((flips, n) => {
    const c = d.slice(2 + 11 * n, 13 + 11 * n);
    const sat = (k) => { const role = c[k] < 0.6 ? 'small' : 'medium'; return { role, L: c[k + 1] < 0.25, ceil: pick(role, c[k + 2]) }; };
    const aRole = giant && giantCell === n ? 'giant' : 'main';
    const count = c[0] < 0.5 ? 3 : 4;
    return { n, flips, count, giant: aRole === 'giant', slots: { anchor: { role: aRole, L: false, ceil: pick(aRole, c[1]) }, E: sat(2), S: sat(5), T: count === 4 ? sat(8) : null } };
  });
}
// the rooms of a plan by cell and slot, in builder order: the oracle fixes how many rooms each cell holds
function roomsBySlot(plan, expected) {
  let k = 0;
  return expected.map((cell) => {
    const out = { anchor: plan.rooms[k++], E: plan.rooms[k++], S: plan.rooms[k++], T: cell.count === 4 ? plan.rooms[k++] : null };
    return out;
  });
}
const cellOf = (plan, n) => ({ i: 2 * plan.a + FLIPS[n][0], j: 2 * plan.b + FLIPS[n][1] });
const inCell = (room, i, j) => room.lv === 0 && room.rects.every((q) => q.x0 >= 64 * i && q.x1 <= 64 * i + 64 && q.z0 >= 64 * j && q.z1 <= 64 * j + 64);

test('cluster rooms: 128 district counts and anchors', () => {
  assert.equal(corpus.length, 128);
  let giants = 0;
  for (const c of corpus) {
    const plan = planOf(c), exp = oracle(c.seed, c.a, c.b, c.Y), tag = `${c.seed}:${c.a},${c.b}`;
    const ids = new Set(plan.rooms.map((o) => o.spaceId));
    assert.equal(ids.size, plan.rooms.length, tag);
    assert.ok(plan.rooms.length >= 12 && plan.rooms.length <= 16, tag);
    assert.equal(plan.rooms.length, sum(exp.map((e) => e.count)), `${tag}: the exact selected count, never reduced`);
    assert.deepEqual(Object.keys(plan.anchors).sort(), [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, z]) => `${2 * c.a + x},${2 * c.b + z}`).sort(), tag);
    assert.equal(new Set(Object.values(plan.anchors)).size, 4, tag);
    for (const [n, e] of exp.entries()) {
      const { i, j } = cellOf(plan, n);
      const here = plan.rooms.filter((o) => inCell(o, i, j));
      assert.equal(new Set(here.map((o) => o.spaceId)).size, e.count, `${tag}: cell ${n}`);
      assert.ok(e.count === 3 || e.count === 4);
      const anchor = plan.rooms.find((o) => o.spaceId === plan.anchors[`${i},${j}`]);
      assert.ok(anchor.role === 'main' || anchor.role === 'giant', tag);
      assert.ok(inCell(anchor, i, j), tag);
    }
    const g = plan.rooms.filter((o) => o.role === 'giant').length;
    assert.ok(g <= 1, tag);
    giants += g;
    for (const o of plan.rooms) {
      assert.equal(o.lv, 0, tag);
      assert.ok(['small', 'medium', 'main', 'giant'].includes(o.role), tag);
    }
    assert.ok(plan.links.length >= plan.rooms.length - 1, `${tag}: at least a spanning tree`);
  }
  assert.ok(giants > 0 && giants < 128, 'the corpus holds districts with and without a giant');
});

test('cluster rooms: exact canonical templates', () => {
  const seen = new Set();
  for (const c of corpus) {
    const plan = planOf(c), exp = oracle(c.seed, c.a, c.b, c.Y), by = roomsBySlot(plan, exp);
    exp.forEach((e, n) => {
      for (const slot of ['anchor', ...SLOTS]) {
        const room = by[n][slot], want = e.slots[slot];
        if (!want) { assert.equal(room, null); assert.equal(e.count, 3, 'T exists exactly for a four-room cell'); continue; }
        assert.ok(room, `${slot}`);
        const box = slot === 'anchor' ? ANCHOR[want.role] : SAT[slot][want.role];
        assert.deepEqual(bounds(room.rects), place(box, e.flips, c.a, c.b), `${c.seed}:${c.a},${c.b} cell ${n} ${slot}`);
        for (const r of room.rects) for (const v of [r.x0, r.x1, r.z0, r.z1]) assert.ok(q2(v));
        seen.add(`${slot}/${want.role}`);
        assert.equal(room.role, want.role);
        assert.ok(Object.keys(room).sort().join() === 'ceil,grid,lv,rects,role,spaceId', 'no extra source fields');
      }
    });
  }
  for (const k of ['anchor/main', 'anchor/giant', 'E/small', 'E/medium', 'S/small', 'S/medium', 'T/small', 'T/medium']) assert.ok(seen.has(k), k);
});

test('cluster rooms: reflection and exterior contract', () => {
  for (const c of corpus) {
    const plan = planOf(c), exp = oracle(c.seed, c.a, c.b, c.Y), OX = 128 * c.a, OZ = 128 * c.b, tag = `${c.seed}:${c.a},${c.b}`;
    assert.equal(plan.a, c.a);
    assert.equal(plan.b, c.b);
    exp.forEach((e, n) => {
      const { i, j } = cellOf(plan, n);
      const anchor = plan.rooms.find((o) => o.spaceId === plan.anchors[`${i},${j}`]), box = bounds(anchor.rects);
      const out = e.giant ? 12 : 16;
      const gaps = { x: e.flips[0] ? OX + 128 - box.x1 : box.x0 - OX, z: e.flips[1] ? OZ + 128 - box.z1 : box.z0 - OZ };
      assert.equal(gaps.x, out, tag);
      assert.equal(gaps.z, out, tag);
      assert.ok(box.x0 <= 64 * i + 24 && box.x1 >= 64 * i + 40 && box.z0 <= 64 * j + 24 && box.z1 >= 64 * j + 40, `${tag}: the central bands`);
      for (const f of [gaps.x, gaps.z]) assert.ok(f >= 12 && f <= 24, `${tag}: the two outward faces`);
    });
    for (const o of [...plan.rooms, ...plan.links]) for (const r of o.rects) {
      assert.ok(r.x0 >= OX + 12 && r.x1 <= OX + 116 && r.z0 >= OZ + 12 && r.z1 <= OZ + 116, tag);
    }
    for (const o of plan.rooms) {
      const owners = exp.filter((e, n) => { const { i, j } = cellOf(plan, n); return inCell(o, i, j); });
      assert.equal(owners.length, 1, `${tag}: ${o.spaceId} sits wholly inside one cell`);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(buildClusterDistrict(c.seed, c.a, c.b, c.Y))), JSON.parse(JSON.stringify(plan)), 'repeat generation is identical');
  }
});

test('cluster rooms: roles and L geometry', () => {
  const kinds = new Set();
  for (const c of corpus) {
    const plan = planOf(c), exp = oracle(c.seed, c.a, c.b, c.Y), by = roomsBySlot(plan, exp);
    exp.forEach((e, n) => {
      for (const slot of ['anchor', ...SLOTS]) {
        const room = by[n][slot], want = e.slots[slot];
        if (!want) continue;
        const total = sum(room.rects.map(rectArea)), tag = `${c.seed}:${c.a},${c.b} ${n} ${slot}`;
        if (slot === 'anchor') { assert.equal(room.rects.length, 1, tag); assert.equal(total, AREA[want.role][0], tag); continue; }
        kinds.add(`${want.role}/${want.L ? 'L' : 'rect'}`);
        if (!want.L) { assert.equal(room.rects.length, 1, tag); assert.equal(total, AREA[want.role][0], tag); continue; }
        assert.equal(room.rects.length, 2, tag);
        assert.equal(total, AREA[want.role][1], tag);
        const [p, s] = room.rects, box = bounds(room.rects);
        assert.equal(overlapArea(p, s), 0, tag);
        const touch = (p.x1 === s.x0 || s.x1 === p.x0) ? Math.min(p.z1, s.z1) - Math.max(p.z0, s.z0) : (p.z1 === s.z0 || s.z1 === p.z0) ? Math.min(p.x1, s.x1) - Math.max(p.x0, s.x0) : 0;
        assert.ok(touch > 0, `${tag}: the two rectangles share an edge`);
        assert.equal(rectArea(box) - total, 9, `${tag}: a 3 x 3 m corner is gone`);
        // every passage touching this room stays out of the removed corner
        for (const l of plan.links.filter((k) => k.from === room.spaceId || k.to === room.spaceId)) {
          assert.equal(overlapArea(l.rects[0], box), sum(room.rects.map((r) => overlapArea(l.rects[0], r))), `${tag}: the passage entry stays out of the notch`);
        }
      }
    });
  }
  for (const k of ['small/L', 'small/rect', 'medium/L', 'medium/rect']) assert.ok(kinds.has(k), k);
  // legacy fixture roles are untouched
  assert.deepEqual(fixtureCluster(1, 1).rooms.map((o) => o.role), ['anchor', 'anchor', 'anchor', 'anchor']);
});

test('cluster rooms: role ceilings and grids', () => {
  const sc = { seed: 42, a: 1, b: 1 };
  const inRoles = (plan, Y) => {
    const cap = Y[1] - 1.5, exp = oracle(sc.seed, sc.a, sc.b, Y);
    plan.rooms.forEach((o) => assert.ok(CEIL[o.role].filter((h) => h <= cap).includes(o.ceil), `${o.role} ${o.ceil} under cap ${cap}`));
    const by = roomsBySlot(plan, exp);
    exp.forEach((e, n) => { for (const slot of ['anchor', ...SLOTS]) if (e.slots[slot]) assert.equal(by[n][slot].ceil, e.slots[slot].ceil); });
  };
  for (const y1 of [9, 6.5, 6]) inRoles(buildClusterDistrict(sc.seed, sc.a, sc.b, { 1: y1 }), { 1: y1 });
  // a small cap leaves only the low candidates
  const six = buildClusterDistrict(sc.seed, sc.a, sc.b, { 1: 6 });
  for (const o of six.rooms) { if (o.role === 'giant') assert.equal(o.ceil, 4.5); if (o.role === 'main') assert.ok(o.ceil <= 4.5); }
  const rangeError = { name: 'RangeError', message: 'Invalid district ceiling range' };
  for (const Y of [{ 1: 4 }, { 1: NaN }, { 1: Infinity }, { 1: -Infinity }, {}, null]) assert.throws(() => buildClusterDistrict(sc.seed, sc.a, sc.b, Y), rangeError, JSON.stringify(Y));
  assert.throws(() => buildClusterDistrict(sc.seed, 1.5, 1, { 1: 9 }), { name: 'TypeError', message: 'Invalid district plan' });
  assert.throws(() => buildClusterDistrict(sc.seed, 1, NaN, null), { name: 'TypeError', message: 'Invalid district plan' }, 'indices are checked before the ceiling');
  // a full range keeps every candidate across the corpus
  const seen = { small: new Set(), medium: new Set(), main: new Set(), giant: new Set() };
  for (const c of corpus) for (const o of buildClusterDistrict(c.seed, c.a, c.b, { 1: 9 }).rooms) seen[o.role].add(o.ceil);
  for (const role of ['small', 'medium', 'main']) assert.deepEqual([...seen[role]].sort(), CEIL[role], role);
  for (const h of seen.giant) assert.ok(CEIL.giant.includes(h));
  // grids
  for (const c of corpus) {
    const plan = planOf(c);
    for (const o of plan.rooms) {
      assert.ok(q2(o.ceil) && o.ceil >= 3);
      assert.deepEqual(o.grid, { ox: Math.min(...o.rects.map((r) => r.x0)), oz: Math.min(...o.rects.map((r) => r.z0)), step: 6 });
    }
    for (const l of plan.links) assert.deepEqual(l.grid, { ox: l.rects[0].x0, oz: l.rects[0].z0, step: 6 });
  }
});

test('cluster rooms: exact 46 draw stream', () => {
  for (const c of corpus) {
    const plan = planOf(c), exp = oracle(c.seed, c.a, c.b, c.Y), by = roomsBySlot(plan, exp), tag = `${c.seed}:${c.a},${c.b}`;
    let k = 0;
    assert.equal(plan.rooms.length, sum(exp.map((e) => e.count)), tag);
    for (const e of exp) {
      for (const slot of ['anchor', ...SLOTS]) {
        const want = e.slots[slot], room = by[e.n][slot];
        if (!want) { assert.equal(room, null); continue; }
        assert.equal(room.spaceId, `v2:space:${c.a},${c.b}:r${k++}`, 'sequential ids in NW, NE, SW, SE order');
        assert.equal(room.role, want.role, tag);
        assert.equal(room.ceil, want.ceil, tag);
        assert.equal(room.rects.length, want.L ? 2 : 1, tag);
      }
      const { i, j } = cellOf(plan, e.n);
      assert.equal(plan.anchors[`${i},${j}`], by[e.n].anchor.spaceId, tag);
    }
    plan.links.forEach((l, n) => assert.equal(l.id, `v2:dlink:${c.a},${c.b}:${n}`, tag));
  }
  // the seed is taken as an unsigned integer
  const Y = yOf(42);
  assert.equal(JSON.stringify(buildClusterDistrict(-1, 1, 1, Y)), JSON.stringify(buildClusterDistrict(4294967295, 1, 1, Y)));
  assert.equal(JSON.stringify(buildClusterDistrict(0, 1, 1, Y)), JSON.stringify(buildClusterDistrict(4294967296, 1, 1, Y)));
  assert.notEqual(JSON.stringify(buildClusterDistrict(0, 1, 1, Y)), JSON.stringify(buildClusterDistrict(1, 1, 1, Y)));
  // the giant draw is a district draw: a giant cell is chosen even when no giant is
  const flags = corpus.map((c) => oracle(c.seed, c.a, c.b, c.Y).some((e) => e.giant));
  assert.ok(flags.some(Boolean) && flags.some((f) => !f));
});

test('cluster rooms: selected topology graph', () => {
  // the selected edges themselves are pinned against an independent 8810 oracle in gen2-cluster-topology.test.mjs; here the links are read as a graph
  for (const c of corpus) {
    const plan = planOf(c), exp = oracle(c.seed, c.a, c.b, c.Y), by = roomsBySlot(plan, exp), tag = `${c.seed}:${c.a},${c.b}`;
    const R = plan.rooms.length, room = (id) => plan.rooms.find((o) => o.spaceId === id), index = (id) => plan.rooms.findIndex((o) => o.spaceId === id);
    const pairs = plan.links.map((l) => [index(l.from), index(l.to)]);
    assert.ok(pairs.every(([p, q]) => p >= 0 && p < q), `${tag}: endpoints are rooms, lower index first`);
    assert.deepEqual(pairs, [...pairs].sort((p, q) => p[0] - q[0] || p[1] - q[1]), `${tag}: links sorted by endpoint index`);
    assert.equal(new Set(pairs.map((p) => p.join())).size, pairs.length, `${tag}: one link per pair`);
    plan.links.forEach((l, k) => assert.equal(l.id, `v2:dlink:${c.a},${c.b}:${k}`, tag));
    // every anchor keeps its own E and S satellite as direct neighbours, whatever else the graph selects
    for (const e of exp) for (const slot of ['E', 'S']) {
      const a = index(by[e.n].anchor.spaceId), s = index(by[e.n][slot].spaceId);
      const l = plan.links.find((m) => index(m.from) === Math.min(a, s) && index(m.to) === Math.max(a, s));
      assert.ok(l && l.kind === 'shared-opening', `${tag}: anchor ${e.n} ${slot}`);
    }
    assert.ok(plan.links.length >= R - 1, `${tag}: at least a spanning tree`);
    const q = plan.links.length;
    assert.ok(q >= 11 && q <= 2 * R, tag);
    plan.links.forEach((l, k) => {
      const ends = [room(l.from), room(l.to)];
      if (l.kind === 'passage') {
        const r = l.rects[0], dx = r.x1 - r.x0, dz = r.z1 - r.z0, w = widthOf(c.seed, c.a, c.b, k);
        assert.equal(l.rects.length, 1);
        assert.equal(l.distance.width, w, `${tag}: link ${k} width is the 8820/8821 draw`);
        assert.ok(dx === w || dz === w, `${tag}: link ${k} is ${w} m wide`);
        assert.ok(q2(r.x0) && q2(r.x1) && q2(r.z0) && q2(r.z1));
        for (const end of ends) assert.equal(sum(end.rects.map((s) => overlapArea(r, s))), 0.5 * w, `${tag}: link ${k} reaches ${end.spaceId} by 0.5 x ${w} m`);
      }
      for (const o of plan.rooms) if (!ends.includes(o)) for (const r of l.rects) assert.equal(sum(o.rects.map((s) => overlapArea(r, s))), 0, tag);
      plan.links.forEach((m, n) => { if (n > k) for (const r of l.rects) for (const s of m.rects) assert.equal(overlapArea(r, s), 0, tag); });
    });
    // one connected component, no isolated room
    const seen = new Set([plan.rooms[0].spaceId]);
    for (let grew = true; grew;) { grew = false; for (const l of plan.links) if (seen.has(l.from) !== seen.has(l.to)) { seen.add(l.from); seen.add(l.to); grew = true; } }
    assert.equal(seen.size, R, tag);
    assert.ok(plan.rooms.every((o) => !('x0' in o || 'x1' in o || 'z0' in o || 'z1' in o)), 'no scalar bounds on source rooms');
  }
});

test('cluster rooms: immutable geometry and area gates', () => {
  const areas = [];
  for (const c of corpus) {
    const plan = planOf(c), tag = `${c.seed}:${c.a},${c.b}`;
    assert.ok(frozenDeep(plan), tag);
    assert.deepEqual(validateDistrictPlan(JSON.parse(JSON.stringify(plan)), c.a, c.b), plan, tag);
    for (const o of [...plan.rooms, ...plan.links]) {
      const sorted = [...o.rects].sort((p, s) => p.x0 - s.x0 || p.z0 - s.z0 || p.x1 - s.x1 || p.z1 - s.z1);
      assert.deepEqual(o.rects, sorted, `${tag}: canonical rectangle order`);
    }
    for (const o of plan.rooms) areas.push(sum(o.rects.map(rectArea)));
    for (const [x, o] of plan.rooms.entries()) for (const p of plan.rooms.slice(x + 1)) for (const r of o.rects) for (const s of p.rects) assert.equal(overlapArea(r, s), 0, tag);
  }
  const sorted = areas.toSorted((p, s) => p - s), median = sorted[Math.floor(sorted.length / 2)];
  assert.ok(median >= 120 && median <= 280, `median ${median}`);
  assert.ok(median >= 121 && median <= 217.5, `median ${median}`);
  // invalid source geometry still fails the T2 validation
  const bad = JSON.parse(JSON.stringify(planOf(corpus[0])));
  bad.rooms[1].rects[0].x1 += 100;
  assert.throws(() => validateDistrictPlan(bad, bad.a, bad.b), { name: 'RangeError', message: 'Invalid district geometry' });
  const noAnchor = JSON.parse(JSON.stringify(planOf(corpus[0])));
  noAnchor.anchors[Object.keys(noAnchor.anchors)[0]] = noAnchor.rooms[1].spaceId;
  assert.throws(() => validateDistrictPlan(noAnchor, noAnchor.a, noAnchor.b), { name: 'TypeError', message: 'Invalid district plan' }, 'a satellite is not an anchor');
});

// ---------- integration: a world whose only cluster is the production district (a, b) ----------

const BODY_CASES = [1, 42].flatMap((seed) => [[1, 1], [-1, -1]].map(([a, b]) => ({ seed, a, b })));
const worldFor = ({ seed, a, b }) => {
  const source = buildClusterDistrict(seed, a, b, new World2(seed, { clusterShare: 0 }).Y);
  return { source, world: new World2(seed, { cluster: (x, z) => (x === a && z === b ? source : null) }) };
};
const cellsOf = (a, b) => [[2 * a, 2 * b], [2 * a + 1, 2 * b], [2 * a, 2 * b + 1], [2 * a + 1, 2 * b + 1]];

test('cluster rooms: planning determinism', () => {
  for (const c of BODY_CASES) {
    const cells = cellsOf(c.a, c.b), tag = `${c.seed}:${c.a},${c.b}`;
    const forward = worldFor(c).world, reverse = worldFor(c).world;
    const fwd = cells.map(([i, j]) => JSON.stringify(forward.plan(i, j)));
    const back = [];
    for (const k of [3, 2, 1, 0]) back[k] = JSON.stringify(reverse.plan(...cells[k]));
    assert.deepEqual(back, fwd, `${tag}: the order of cell requests changes nothing`);
    // evict the district and its four cell plans: the same plans come back
    forward.districts.delete(`${c.a},${c.b}`);
    for (const [i, j] of cells) forward.plans.delete(`${i},${j}`);
    assert.deepEqual(cells.map(([i, j]) => JSON.stringify(forward.plan(i, j))), fwd, `${tag}: rebuilding after eviction`);
  }
});

// the spec's rectangle constructors, applied literally
const outwardSnap = (q) => ({ x0: Math.floor(q.x0 / 0.5) * 0.5, x1: Math.ceil(q.x1 / 0.5) * 0.5, z0: Math.floor(q.z0 / 0.5) * 0.5, z1: Math.ceil(q.z1 / 0.5) * 0.5 });
const clipTo = (hall) => (q) => ({ x0: Math.max(q.x0, hall.x0), x1: Math.min(q.x1, hall.x1), z0: Math.max(q.z0, hall.z0), z1: Math.min(q.z1, hall.z1) });
const H = (xa, xb, z) => ({ x0: Math.min(xa, xb) - 2, x1: Math.max(xa, xb) + 2, z0: z - 2, z1: z + 2 });
const V = (x, za, zb) => ({ x0: x - 2, x1: x + 2, z0: Math.min(za, zb) - 2, z1: Math.max(za, zb) + 2 });
const finish = (hall, list) => list.map(outwardSnap).map(clipTo(hall)).filter((q) => q.x1 > q.x0 && q.z1 > q.z0);
const near = (p, q, m) => p.x0 - m < q.x1 && q.x0 - m < p.x1 && p.z0 - m < q.z1 && q.z0 - m < p.z1;

test('cluster rooms: protected access and feature allocation', () => {
  // the quarter-grid fixture: a -x mouth at 32.25 in the NW cell
  const hall = { x0: 16, x1: 48, z0: 16, z1: 48 };
  const base = [{ x0: 16, x1: 19, z0: 31.25, z1: 33.25 }];
  Object.freeze(base[0]); Object.freeze(base);
  const entries = [{ axis: 'x', side: -1, mid: 32.25 }];
  Object.freeze(entries[0]); Object.freeze(entries);
  const out = clusterAccessMouths(hall, base, entries, 0, 0, false);
  assert.notEqual(out, base);
  assert.deepEqual(out[0], base[0], 'the original base mouths come first and unchanged');
  assert.deepEqual(out.slice(1, 3), [{ x0: 16, x1: 48, z0: 30, z1: 34 }, { x0: 30, x1: 34, z0: 16, z1: 48 }], 'the horizontal then the vertical spine');
  assert.deepEqual(out.slice(3), [{ x0: 16, x1: 34, z0: 30, z1: 34.5 }, { x0: 30, x1: 34, z0: 30, z1: 34.5 }], 'the snapped and clipped Manhattan pair');
  assert.equal(entries[0].mid, 32.25);
  for (const q of out.slice(base.length)) for (const v of [q.x0, q.x1, q.z0, q.z1]) assert.ok(q2(v), 'new protection edges are on the Q2 grid');
  const withT = clusterAccessMouths(hall, base, entries, 0, 0, true);
  assert.equal(withT.length, out.length + 1, 'the T spur');
  assert.deepEqual(withT[3], { x0: 30, x1: 48, z0: 44, z1: 48 });

  for (const c of BODY_CASES) {
    const { source, world } = worldFor(c), exp = oracle(c.seed, c.a, c.b, new World2(c.seed, { clusterShare: 0 }).Y), tag = `${c.seed}:${c.a},${c.b}`;
    cellsOf(c.a, c.b).forEach(([i, j], n) => {
      const plan = world.plan(i, j), h = plan.rooms[0], e = exp[n];
      assert.equal(plan.primaryHallId, 0);
      assert.equal(h.spaceId, source.anchors[`${i},${j}`]);
      assert.equal(plan.voids.filter((v) => v.kind === 'split').length, 0, `${tag} cell ${n}: no successful split`);
      assert.ok(!plan.rooms.some((o) => o.kind === 'shaft'), `${tag} cell ${n}: no split shaft`);
      const fx = !!(i & 1), fz = !!(j & 1), ax0 = e.giant ? 12 : 16;
      const at = (box) => place(box, [fx, fz], c.a, c.b);
      const spines = [at([ax0, 48, 30, 34]), at([30, 34, ax0, 48])];
      if (e.count === 4) spines.push(at([30, 48, 44, 48]));
      const mine = new Set(plan.rooms.filter((o) => o.span === 'cluster').map((o) => o.spaceId));
      assert.equal(mine.size, e.count, `${tag} cell ${n}: ${e.count} physical rooms`);
      assert.deepEqual(clusterAccessMouths(h, [], [], i, j, e.count === 4), finish(h, spines), `${tag} cell ${n}: the central spines`);
      // an exterior entry on each outward face, in the fixed +x, -x, +z, -z order
      const cx = 64 * i + 32, cz = 64 * j + 32;
      const ent = [{ axis: 'x', side: fx ? 1 : -1, mid: cz + 0.25 }, { axis: 'z', side: fz ? 1 : -1, mid: cx + 0.25 }];
      const want = [];
      for (const { axis, side, mid: m } of ent) {
        if (axis === 'x') want.push(H(side > 0 ? h.x1 : h.x0, cx, m), V(cx, m, cz));
        else want.push(V(m, side > 0 ? h.z1 : h.z0, cz), H(m, cx, cz));
      }
      assert.deepEqual(clusterAccessMouths(h, [], ent, i, j, e.count === 4).slice(finish(h, spines).length), finish(h, want), `${tag} cell ${n}: the exterior mouths`);
      // pools keep their 2 m margin from the protected spines
      for (const p of plan.pools.filter((q) => q.room === h.id)) {
        const bb = { x0: p.shape.cx - p.shape.hw, x1: p.shape.cx + p.shape.hw, z0: p.shape.cz - p.shape.hd, z1: p.shape.cz + p.shape.hd };
        for (const s of spines) assert.ok(!near(bb, s, 2), `${tag} cell ${n}: a pool beside the spine`);
      }
      // every wall-to-wall pit across the hall meets a spine
      for (const runX of [true, false]) for (let w = 4; w <= 7; w += 0.5) {
        const [lo, hi] = runX ? [h.z0, h.z1] : [h.x0, h.x1];
        for (let p0 = lo + 4; p0 + w <= hi - 4; p0 += 0.5) {
          const cand = runX ? { x0: h.x0, x1: h.x1, z0: p0, z1: p0 + w } : { x0: p0, x1: p0 + w, z0: h.z0, z1: h.z1 };
          assert.ok(spines.some((s) => near(cand, s, 2)), `${tag} cell ${n}: a split candidate`);
        }
      }
      // large features belong to the anchor alone
      for (const o of plan.rooms.filter((q) => q.span === 'cluster' && q.id !== plan.primaryHallId)) {
        assert.ok(!plan.columns.some((col) => col.room === o.id), 'no columns outside the anchor');
        assert.ok(!plan.pools.some((p) => p.room === o.id), 'no pools outside the anchor');
      }
    });
  }
});

test('cluster rooms: real body reaches all source rooms', () => {
  for (const c of BODY_CASES) {
    const { source, world } = worldFor(c), OX = 128 * c.a, OZ = 128 * c.b, tag = `${c.seed}:${c.a},${c.b}`;
    const player = new Player();
    let start = null;
    for (const [x, z] of [[OX + 47.5, OZ + 32], [OX + 47, OZ + 32], [OX + 46.5, OZ + 32], [OX + 46, OZ + 32]]) {
      player.x = x; player.z = z;
      if (player.canStand(world, x, z, 0) !== true) continue;
      const surf = world.surfaceAt(x, z, 0), h = surf.h, wl = surf.wl;
      if (h === 0 && Number.isNaN(wl)) { start = [x, z, 0]; break; }
    }
    assert.ok(start, `${tag}: a start candidate stands`);
    const states = reachSet(world, OX + 12, OZ + 12, OX + 116, OZ + 116, start);
    // the state must stand, at level 0 and dry; the surface fields are copied before the next world query overwrites them
    const dry = ([x, z, h]) => {
      player.x = x; player.z = z;
      if (player.canStand(world, x, z, h) !== true) return false;
      const surf = world.surfaceAt(x, z, 0), sh = surf.h, wl = surf.wl;
      return sh === 0 && Number.isNaN(wl);
    };
    for (const room of source.rooms) {
      const hit = states.find(([x, z, h]) => h === 0 && room.rects.some((r) => x - 0.4 > r.x0 && x + 0.4 < r.x1 && z - 0.4 > r.z0 && z + 0.4 < r.z1) && dry([x, z, h]));
      assert.ok(hit, `${tag}: ${room.spaceId} (${room.role}) is reached`);
    }
  }
});

// ---------- production selection and the legacy baseline ----------

const DISTRICTS = [-3, -2, -1, 0, 1, 2, 3].flatMap((b) => [-3, -2, -1, 0, 1, 2, 3].map((a) => [a, b]));
const sha = (text) => createHash('sha256').update(text).digest('hex');

test('cluster rooms: production share and exclusions', () => {
  assert.equal(CLUSTER_SHARE, 0.5);
  for (const seed of [1, 42, 99]) {
    const dflt = new World2(seed), zero = new World2(seed, { clusterShare: 0 }), one = new World2(seed, { clusterShare: 1 }), twin = new World2(seed);
    assert.equal(dflt.clusterShare, 0.5);
    assert.equal(zero.clusterShare, 0);
    let picked = 0, legacy = 0;
    for (const [a, b] of DISTRICTS) {
      const tag = `${seed}:${a},${b}`, start = !(a || b), shared = zero.legacySharedInDistrict(a, b);
      assert.equal(zero.districtPlan(a, b), null, `${tag}: share 0 is legacy`);
      const full = one.districtPlan(a, b);
      if (start || shared) assert.equal(full, null, `${tag}: share 1 keeps the start and the shared-hall districts legacy`);
      else assert.deepEqual(full, buildClusterDistrict(seed, a, b, zero.Y), `${tag}: share 1 plans the production builder's district`);
      const want = !start && !shared && mulberry32(hash2(seed >>> 0, a, b, 7700))() < 0.5;
      const got = dflt.districtPlan(a, b);
      assert.equal(got !== null, want, `${tag}: the salt-7700 draw decides`);
      if (want) { assert.deepEqual(got, full, `${tag}: the chosen district`); picked++; } else legacy++;
      assert.deepEqual(twin.districtPlan(a, b), got, `${tag}: independent worlds agree`);
    }
    assert.ok(picked > 0 && legacy > 0, `${seed}: both layouts occur (${picked} cluster, ${legacy} legacy)`);
  }

  // the inner edges of a chosen district are district-mode records without any corridor field
  const w = new World2(42);
  const [a, b] = DISTRICTS.find(([x, y]) => w.districtPlan(x, y));
  for (const [i, j, axis] of [[2 * a, 2 * b, 'x'], [2 * a, 2 * b + 1, 'x'], [2 * a, 2 * b, 'z'], [2 * a + 1, 2 * b, 'z']]) {
    for (const c of [w.linkOf(i, j, axis), w.connectionOf(i, j, axis)]) {
      assert.equal(c.mode, 'district', `${i},${j},${axis}`);
      assert.deepEqual(Object.keys(c), ['id', 'axis', 'fromSpaceId', 'toSpaceId', 'mode']);
      for (const k of ['gaps', 'corridor', 'route', 'eligible', 'parts']) assert.ok(!(k in c), `${k} on a district-mode record`);
    }
  }

  // a factory beats the share draw and the shared-hall exclusion; the start district never asks it
  const probe = new World2(42, { clusterShare: 0 });
  const shared = DISTRICTS.find(([x, y]) => (x || y) && probe.legacySharedInDistrict(x, y));
  assert.ok(shared, 'seed 42 has a shared-hall district near the start');
  const asked = [];
  const forced = new World2(42, { clusterShare: 0, cluster: (x, y) => { asked.push(`${x},${y}`); return fixtureCluster(x, y); } });
  asked.length = 0;   // the spawn already asked for the start district's neighbours
  assert.ok(forced.districtPlan(...shared));
  assert.equal(forced.districtPlan(0, 0), null);
  assert.ok(!asked.includes('0,0'));
  assert.equal(new World2(42, { clusterShare: 1, cluster: (x, y) => fixtureCluster(x, y) }).districtPlan(0, 0), null);
  assert.equal(new World2(42, { clusterShare: 1, cluster: () => null }).districtPlan(shared[0], shared[1]), null, 'a factory null is a legacy district');

  // a rejected plan throws and never enters the cache
  let armed = false;
  const bad = new World2(42, { cluster: () => (armed ? { a: 9, b: 9 } : null) });
  armed = true;
  assert.throws(() => bad.districtPlan(3, 3), { name: 'TypeError', message: 'Invalid district plan' });
  assert.ok(!bad.districts.has('3,3'));
});

test('cluster rooms: explicit-zero legacy baseline', () => {
  const baseline = JSON.parse(readFileSync(new URL('../fixtures/gen2-district-baseline.json', import.meta.url), 'utf8'));
  assert.equal(Object.keys(baseline.planSha256).length, 512);
  for (const seed of CORPUS.seeds) {
    const w = new World2(seed, { clusterShare: 0 });
    for (const [i, j] of CORPUS.cells) assert.equal(sha(JSON.stringify(w.plan(i, j))), baseline.planSha256[`${seed}:${i},${j}`], `${seed}:${i},${j}`);
  }
  const { cost, report: actual } = preT6Report(legacyReport(CORPUS));
  assert.ok(cost !== undefined, 'the isolated report keeps its cost until the caller strips it');
  assert.deepEqual(actual, baseline.report);
  assert.equal(sha(JSON.stringify(actual)), baseline.reportSha256);
  // the child's districtPlan override never reaches this process
  const live = new World2(42, { clusterShare: 1 });
  assert.ok(DISTRICTS.some(([x, y]) => live.districtPlan(x, y)), 'production districts are still planned here');
});
