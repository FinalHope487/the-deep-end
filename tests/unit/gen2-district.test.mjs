// T2 district planning layer: selection and cache, the pure core (validation, clipping, seams), the cluster plan's links, features and
// lamps, and a real body walking four fixture rooms
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2, CELL2, Q2, CLUSTER_SHARE, cellRaster } from '../../js/gen2.js';
import { buildClusterDistrict, fixtureCluster, fixtureSeamCluster, validateDistrictPlan, clipDistrictRect, cutDistrictCell } from '../../js/gen2-district.js';
import { Player } from '../../js/player.js';
import { reachSet } from './reach.mjs';

const only = (a0, b0, make = fixtureCluster) => (a, b) => (a === a0 && b === b0 ? make(a, b) : null);
const everywhere = (make = fixtureCluster) => (a, b) => make(a, b);
const clone = (o) => JSON.parse(JSON.stringify(o));
const cellsOf = (a, b) => [[2 * a, 2 * b], [2 * a + 1, 2 * b], [2 * a, 2 * b + 1], [2 * a + 1, 2 * b + 1]];
const rectIn = (inner, outer) => inner.x0 >= outer.x0 && inner.x1 <= outer.x1 && inner.z0 >= outer.z0 && inner.z1 <= outer.z1;
const overlap = (p, q, m = 0) => p.x0 - m < q.x1 && q.x0 - m < p.x1 && p.z0 - m < q.z1 && q.z0 - m < p.z1;
const frozenDeep = (o) => !o || typeof o !== 'object' || (Object.isFrozen(o) && Object.values(o).every(frozenDeep));
const expectPlanError = (fn) => assert.throws(fn, { name: 'TypeError', message: 'Invalid district plan' });
const expectGeometryError = (fn) => assert.throws(fn, { name: 'RangeError', message: 'Invalid district geometry' });

test('district: constructor option validation', () => {
  assert.equal(CLUSTER_SHARE, 0.5);
  const w = new World2(42);
  assert.equal(w.clusterShare, 0.5);
  assert.equal(new World2(42, { clusterShare: 0 }).clusterShare, 0, 'an explicit zero stays legacy');
  assert.equal(w.cluster, null);
  assert.equal(w.seed, 42);
  assert.equal(new World2(-1).seed, 0xffffffff, 'the seed is still taken as an unsigned integer');
  for (const share of [0, 0.5, 1]) assert.equal(new World2(42, { clusterShare: share }).clusterShare, share);
  for (const share of [-0.1, 1.1, NaN, Infinity, -Infinity, '0.5', null]) {
    assert.throws(() => new World2(42, { clusterShare: share }), { name: 'RangeError', message: 'Invalid clusterShare' }, String(share));
  }
  for (const factory of [0, 1, {}, 'x', true]) {
    assert.throws(() => new World2(42, { cluster: factory }), { name: 'TypeError', message: 'Invalid cluster factory' }, String(factory));
  }
  assert.equal(new World2(42, { cluster: null }).cluster, null);
  const f = () => null;
  assert.equal(new World2(42, { cluster: f }).cluster, f);
  // the production builder plans a district; a full share still keeps the start district and the legacy shared-hall districts legacy
  assert.ok(frozenDeep(buildClusterDistrict(42, 1, 1, w.Y)));
  const all = new World2(42, { clusterShare: 1 });
  for (let b = -3; b <= 3; b++) for (let a = -3; a <= 3; a++) {
    const d = all.districtPlan(a, b);
    if (!(a || b) || all.legacySharedInDistrict(a, b)) assert.equal(d, null, `${a},${b}`);
    else assert.ok(d && frozenDeep(d), `${a},${b}`);
  }
  assert.equal(all.districts.size, 49, 'null results are cached too');
});

test('district: selection order, factory override and cache of nulls', () => {
  const calls = [];
  const w = new World2(42, { cluster: (a, b) => { calls.push(`${a},${b}`); return a === 1 && b === 1 ? fixtureCluster(a, b) : null; } });
  calls.length = 0;   // building the spawn already asks for the neighbours of the start district
  const planned = w.plans.size;
  assert.equal(w.districtPlan(0, 0), null);
  assert.deepEqual(calls, [], 'the start district never asks the factory');
  assert.equal(w.districtPlan(2, 2), null);
  assert.equal(w.districtPlan(2, 2), null);
  assert.deepEqual(calls, ['2,2'], 'a cached null is a hit');
  const d = w.districtPlan(1, 1);
  assert.ok(d && frozenDeep(d));
  assert.equal(w.districtPlan(1, 1), d, 'a hit returns the cached plan itself');
  assert.equal(w.plans.size, planned, 'district planning builds no cell plan');
  for (const bad of [[1.5, 0], [0, NaN], [Infinity, 0], [2 ** 53, 0], ['1', 0]]) expectPlanError(() => w.districtPlan(...bad));

  // the factory overrides the share draw and the legacy shared-hall exclusion; the start exclusion beats the factory
  const probe = new World2(42);
  let shared = null;
  for (let b = -6; b <= 6 && !shared; b++) for (let a = -6; a <= 6 && !shared; a++) if ((a || b) && probe.legacySharedInDistrict(a, b)) shared = [a, b];
  assert.ok(shared, 'seed 42 has a district with a legacy giant or L hall near the start');
  const forced = new World2(42, { clusterShare: 0, cluster: everywhere() });
  assert.ok(forced.districtPlan(...shared));
  assert.equal(forced.districtPlan(0, 0), null);
  assert.equal(new World2(42, { clusterShare: 1, cluster: everywhere() }).districtPlan(0, 0), null);
});

test('district: legacySharedInDistrict reads only the shared-hall draws', () => {
  const w = new World2(7);
  for (const m of ['spaceOf', 'hallOf', 'linkOf', 'connectionOf', 'plan', 'makePlan']) w[m] = () => { throw new Error(`${m} called`); };
  const ref = new World2(7);
  let some = 0;
  for (let b = -6; b <= 6; b++) for (let a = -6; a <= 6; a++) {
    const expected = !!(ref.megaOf(2 * a, 2 * b) || ref.megaOf(2 * a, 2 * b + 1) || ref.lOf(a, b));
    assert.equal(w.legacySharedInDistrict(a, b), expected, `${a},${b}`);
    some += expected;
  }
  assert.ok(some > 0 && some < 169);
});

test('district: start exclusion', () => {
  for (const seed of [5, 42, 49, 61]) {
    const plain = new World2(seed, { clusterShare: 0 });
    assert.equal(plain.districtPlan(0, 0), null);
    assert.deepEqual(new World2(seed, { cluster: () => null }).spawn, plain.spawn);
    const hall = plain.hallOf(0, 0);
    {
      // production clusters around the start district can move the spawn, but it stays a dry, standable level-0 spot inside the unchanged start hall
      const w = new World2(seed, { clusterShare: 1 }), s = w.spawn, p = new Player();
      assert.equal(w.districtPlan(0, 0), null);
      assert.deepEqual(w.hallOf(0, 0), hall, `${seed}: share 1 leaves the start hall`);
      p.x = s.x; p.z = s.z;
      assert.equal(p.canStand(w, s.x, s.z, 0), true, `${seed}: share 1 spawn is standable`);
      const surf = { ...w.surfaceAt(s.x, s.z, 0) };
      assert.equal(surf.h, 0);
      assert.equal(Number.isNaN(surf.wl), true, `${seed}: share 1 spawn is dry`);
      assert.ok(s.x - 0.4 >= hall.x0 && s.x + 0.4 <= hall.x1 && s.z - 0.4 >= hall.z0 && s.z + 0.4 <= hall.z1, `${seed}: share 1 spawn is inside the start hall`);
    }
    const variants = seed === 42 ? [fixtureCluster, fixtureSeamCluster] : [fixtureCluster];
    for (const make of variants) {
      const spawns = [0, 1].map(() => new World2(seed, { cluster: (a, b) => (a || b ? make(a, b) : fixtureCluster(a, b)) }));
      assert.deepEqual(spawns[0].spawn, spawns[1].spawn, `${seed}: two forced worlds agree`);
      const w = spawns[0], s = w.spawn;
      assert.equal(w.districtPlan(0, 0), null);
      assert.deepEqual(w.hallOf(0, 0), hall, `${seed}: the start hall is unchanged`);
      assert.ok(w.districtPlan(1, 0) && w.districtPlan(-1, 0) && w.districtPlan(0, 1) && w.districtPlan(0, -1), 'every neighbour is a cluster');
      const p = new Player();
      p.x = s.x; p.z = s.z;
      assert.equal(p.canStand(w, s.x, s.z, 0), true, `${seed}: standable`);
      const surf = { ...w.surfaceAt(s.x, s.z, 0) };
      assert.equal(surf.h, 0);
      assert.equal(Number.isNaN(surf.wl), true, `${seed}: dry`);
      assert.equal(s.h, 0);
      assert.ok(s.x - 0.4 >= hall.x0 && s.x + 0.4 <= hall.x1 && s.z - 0.4 >= hall.z0 && s.z + 0.4 <= hall.z1, `${seed}: the body is inside the start hall`);
    }
  }
});

test('district: fixture ids and geometry', () => {
  assert.equal(CELL2, 64);
  assert.equal(Q2, 0.5);
  assert.equal(2 * CELL2, 128);
  for (const [a, b] of [[1, 1], [0, 0], [-1, -1], [3, -2]]) {
    const OX = 128 * a, OZ = 128 * b, id = (k) => `v2:space:${a},${b}:r${k}`, lid = (k) => `v2:dlink:${a},${b}:${k}`;
    const r = (x0, x1, z0, z1) => ({ x0: OX + x0, x1: OX + x1, z0: OZ + z0, z1: OZ + z1 });
    const room = (k, rect, ox, oz) => ({ spaceId: id(k), lv: 0, rects: [rect], ceil: 4, role: 'anchor', grid: { ox: OX + ox, oz: OZ + oz, step: 6 } });
    const link = (k, from, to, rect) => ({ id: lid(k), from: id(from), to: id(to), kind: 'passage', rects: [rect], grid: { ox: rect.x0, oz: rect.z0, step: 6 } });
    assert.deepEqual(fixtureCluster(a, b), {
      a, b,
      rooms: [room(0, r(20, 63.5, 20, 63.5), 20, 20), room(1, r(64, 108, 20, 63.5), 64, 20), room(2, r(20, 63.5, 64, 108), 20, 64), room(3, r(64, 108, 64, 108), 64, 64)],
      links: [link(0, 0, 1, r(63, 64.5, 30.5, 33.5)), link(1, 2, 3, r(63, 64.5, 94.5, 97.5)), link(2, 0, 2, r(30.5, 33.5, 63, 64.5)), link(3, 1, 3, r(94.5, 97.5, 63, 64.5))],
      anchors: { [`${2 * a},${2 * b}`]: id(0), [`${2 * a + 1},${2 * b}`]: id(1), [`${2 * a},${2 * b + 1}`]: id(2), [`${2 * a + 1},${2 * b + 1}`]: id(3) },
    }, `${a},${b}`);
    const d = validateDistrictPlan(fixtureCluster(a, b), a, b);
    assert.equal(d.links.every((l) => l.rects[0].x1 - l.rects[0].x0 === 1.5 || l.rects[0].z1 - l.rects[0].z0 === 1.5), true);
  }
  const x = fixtureCluster(1, 1), y = fixtureCluster(1, 1);
  assert.notEqual(x, y);
  x.rooms[0].rects[0].x0 = 0;
  assert.equal(y.rooms[0].rects[0].x0, 148, 'each call returns an independent object');
  assert.equal(fixtureCluster(1, 1).links[0].grid.ox, 191);

  const seam = fixtureSeamCluster(1, 1), base = fixtureCluster(1, 1);
  assert.deepEqual(seam.rooms[0].rects, [...base.rooms[0].rects, { x0: 191.5, x1: 194, z0: 178, z1: 182 }]);
  assert.deepEqual(seam.rooms[1].rects, [{ x0: 192, x1: 236, z0: 148, z1: 177.5 }, { x0: 194, x1: 236, z0: 177.5, z1: 191.5 }]);
  assert.deepEqual(seam.links, base.links);
  assert.deepEqual(seam.anchors, base.anchors);
  assert.deepEqual(fixtureCluster(1, 1), base, 'fixtureCluster is unchanged by the seam fixture');
  validateDistrictPlan(seam, 1, 1);
});

test('district: clipping stays inside cell', () => {
  assert.deepEqual(clipDistrictRect({ x0: 60, x1: 70, z0: 10, z1: 20 }, 0, 0), { x0: 60, x1: 64, z0: 10, z1: 20 });
  assert.deepEqual(clipDistrictRect({ x0: 60, x1: 70, z0: 10, z1: 20 }, 1, 0), { x0: 64, x1: 70, z0: 10, z1: 20 });
  assert.equal(clipDistrictRect({ x0: 60, x1: 64, z0: 10, z1: 20 }, 1, 0), null, 'a rectangle ending on the edge is not in the next cell');
  assert.equal(clipDistrictRect({ x0: 64, x1: 70, z0: 10, z1: 20 }, 0, 0), null, 'the next cell owns the edge');
  assert.equal(clipDistrictRect({ x0: 10, x1: 20, z0: 64, z1: 70 }, 0, 0), null);
  assert.deepEqual(clipDistrictRect({ x0: -70, x1: -60, z0: -70, z1: -60 }, -2, -2), { x0: -70, x1: -64, z0: -70, z1: -64 });
  assert.deepEqual(clipDistrictRect({ x0: -70, x1: -60, z0: -70, z1: -60 }, -1, -1), { x0: -64, x1: -60, z0: -64, z1: -60 });

  // the cell indices are safe integers, like the district's
  const unit = { x0: 0, x1: 64, z0: 0, z1: 64 };
  for (const bad of [0.5, NaN, Infinity, -Infinity, 2 ** 53, '1', null, undefined]) {
    expectPlanError(() => clipDistrictRect(unit, bad, 0));
    expectPlanError(() => clipDistrictRect(unit, 0, bad));
  }
  assert.deepEqual(clipDistrictRect(unit, 0, 0), unit);

  const d = validateDistrictPlan(fixtureSeamCluster(1, 1), 1, 1);
  const input = { x0: 150, x1: 200, z0: 150, z1: 200 };
  const parts = cellsOf(1, 1).map(([i, j]) => clipDistrictRect(input, i, j));
  assert.equal(parts.reduce((s, p) => s + (p ? (p.x1 - p.x0) * (p.z1 - p.z0) : 0), 0), 50 * 50, 'the four cells partition a rectangle');
  const seen = new Map();
  for (const [i, j] of cellsOf(1, 1)) {
    const cut = cutDistrictCell(d, i, j), cell = { x0: 64 * i, x1: 64 * i + 64, z0: 64 * j, z1: 64 * j + 64 };
    assert.ok(frozenDeep(cut));
    assert.equal(cut.primaryFragmentIndex, 0);
    assert.equal(cut.fragments[0].sourceType, 'room');
    assert.equal(cut.fragments[0].sourceId, d.anchors[`${i},${j}`]);
    let seenLinks = false, lastRoom = -1;
    for (const f of cut.fragments) {
      assert.ok(rectIn(f.rect, cell), `${i},${j} ${f.sourceId}`);
      assert.ok(f.rect.x1 > f.rect.x0 && f.rect.z1 > f.rect.z0);
      assert.equal(f.lv, 0);
      assert.deepEqual(Object.keys(f), f.sourceType === 'room' ? ['sourceType', 'sourceId', 'rectIndex', 'rect', 'lv', 'kind', 'ceil', 'role', 'seams', 'grid'] : ['sourceType', 'sourceId', 'rectIndex', 'rect', 'lv', 'kind', 'ceil', 'seams', 'grid']);
      if (f.sourceType === 'link') { seenLinks = true; assert.equal(f.kind, 'corridor'); assert.equal(f.role, undefined); }
      else {
        assert.ok(!seenLinks, 'passage fragments come after the room fragments');
        assert.equal(f.kind, 'hall');
        const k = d.rooms.findIndex((o) => o.spaceId === f.sourceId);
        if (f !== cut.fragments[0]) { assert.ok(k >= lastRoom, 'room pieces run in room order'); lastRoom = k; }
        assert.deepEqual(f.rect, clipDistrictRect(d.rooms[k].rects[f.rectIndex], i, j), 'rectIndex is the canonical sorted index');
      }
      seen.set(`${f.sourceId}#${f.rectIndex}`, (seen.get(`${f.sourceId}#${f.rectIndex}`) ?? 0) + 1);
    }
    assert.notEqual(cutDistrictCell(d, i, j), cut, 'every cut is a new object');
    assert.deepEqual(cutDistrictCell(d, i, j), cut);
    assert.throws(() => { cut.fragments[0].rect.x0 = 0; }, TypeError);
  }
  assert.ok(seen.get('v2:space:1,1:r0#1') === 2, 'the arm reaches two cells');
  assert.throws(() => cutDistrictCell(d, 4, 2), { name: 'RangeError', message: 'Cell outside district' });
  assert.throws(() => cutDistrictCell(d, 2, 1), { name: 'RangeError', message: 'Cell outside district' });
  expectPlanError(() => cutDistrictCell(d, 2.5, 2));
  expectPlanError(() => cutDistrictCell(d, 2, NaN));
  expectPlanError(() => cutDistrictCell(fixtureCluster(1, 1), 2, 2));
  expectPlanError(() => cutDistrictCell(structuredClone(d), 2, 2));
});

test('district: passage seams across four inner edges', () => {
  const d = validateDistrictPlan(fixtureCluster(1, 1), 1, 1);
  const bounds = { 0: [[191, 192, 158.5, 161.5], [192, 192.5, 158.5, 161.5]], 1: [[191, 192, 222.5, 225.5], [192, 192.5, 222.5, 225.5]], 2: [[158.5, 161.5, 191, 192], [158.5, 161.5, 192, 192.5]], 3: [[222.5, 225.5, 191, 192], [222.5, 225.5, 192, 192.5]] };
  // [cell of the low side, cell of the high side, axis] per link
  const where = { 0: [[2, 2], [3, 2], 'x'], 1: [[2, 3], [3, 3], 'x'], 2: [[2, 2], [2, 3], 'z'], 3: [[3, 2], [3, 3], 'z'] };
  for (const k of [0, 1, 2, 3]) {
    const id = `v2:dlink:1,1:${k}`, [lo, hi, axis] = where[k], [loRect, hiRect] = bounds[k];
    const find = ([i, j]) => cutDistrictCell(d, i, j).fragments.filter((f) => f.sourceId === id);
    const [a] = find(lo), [b] = find(hi);
    assert.equal(find(lo).length, 1);
    assert.equal(find(hi).length, 1);
    const ex = (r) => ({ x0: r[0], x1: r[1], z0: r[2], z1: r[3] });
    assert.deepEqual(a.rect, ex(loRect));
    assert.deepEqual(b.rect, ex(hiRect));
    const across = axis === 'x' ? { lo: a.rect.z0, hi: a.rect.z1 } : { lo: a.rect.x0, hi: a.rect.x1 };
    const [near, far] = axis === 'x' ? ['px', 'nx'] : ['pz', 'nz'];
    assert.deepEqual(a.seams, { px: false, nx: false, pz: false, nz: false, [near]: across }, `${id} low side`);
    assert.deepEqual(b.seams, { px: false, nx: false, pz: false, nz: false, [far]: across }, `${id} high side`);
    assert.equal(a.ceil, 3);
    assert.equal(b.ceil, 3);
    assert.equal(a.kind, 'corridor');
    assert.deepEqual(a.grid, b.grid);
    assert.deepEqual(a.grid, { ox: d.links[k].rects[0].x0, oz: d.links[k].rects[0].z0, step: 6 });
  }
  // the same through the plans: both cells give the passage the same interval and ceiling
  const w = new World2(42, { cluster: only(1, 1) });
  for (const k of [0, 1, 2, 3]) {
    const [lo, hi] = where[k], id = `v2:dlink:1,1:${k}`;
    const pick = ([i, j]) => w.plan(i, j).rooms.find((o) => o.spaceId === id);
    const a = pick(lo), b = pick(hi);
    assert.ok(a && b);
    assert.equal(a.ceil, b.ceil);
    assert.equal(a.kind, 'corridor');
    assert.equal(a.span, undefined);
    assert.equal(a.role, undefined);
    assert.equal(Object.values(a.seams).filter(Boolean).length, 1);
    assert.deepEqual(Object.values(a.seams).find(Boolean), Object.values(b.seams).find(Boolean));
  }
});

test('district: physical room crosses cell seam', () => {
  const d = validateDistrictPlan(fixtureSeamCluster(1, 1), 1, 1);
  const frag = (i, j, id, rectIndex) => cutDistrictCell(d, i, j).fragments.find((f) => f.sourceId === id && f.rectIndex === rectIndex);
  const A = 'v2:space:1,1:r0', B = 'v2:space:1,1:r1';
  const aMain = frag(2, 2, A, 0), aArm = frag(2, 2, A, 1), aArmEast = frag(3, 2, A, 1), b0 = frag(3, 2, B, 0), b1 = frag(3, 2, B, 1);
  assert.deepEqual(aMain.rect, { x0: 148, x1: 191.5, z0: 148, z1: 191.5 });
  assert.deepEqual(aMain.seams.px, { lo: 178, hi: 182 }, 'A main px x=191.5');
  assert.deepEqual(aArm.rect, { x0: 191.5, x1: 192, z0: 178, z1: 182 });
  assert.deepEqual(aArm.seams.nx, { lo: 178, hi: 182 }, 'A arm nx x=191.5');
  assert.deepEqual(aArm.seams.px, { lo: 178, hi: 182 }, 'A across the cell boundary x=192');
  assert.deepEqual(aArmEast.rect, { x0: 192, x1: 194, z0: 178, z1: 182 });
  assert.deepEqual(aArmEast.seams.nx, { lo: 178, hi: 182 });
  assert.equal(aArmEast.seams.px, false);
  assert.deepEqual(b0.seams.pz, { lo: 194, hi: 236 }, 'B0 pz z=177.5');
  assert.deepEqual(b1.seams.nz, { lo: 194, hi: 236 }, 'B1 nz z=177.5');
  assert.equal(b0.seams.nz, false);
  assert.equal(b1.seams.pz, false);
  // fragments of one source share one grid and one ceiling
  assert.deepEqual(aMain.grid, aArm.grid);
  assert.deepEqual(aArm.grid, aArmEast.grid);
  assert.deepEqual(b0.grid, b1.grid);
  assert.equal(aMain.ceil, aArmEast.ceil);
  for (const f of [aMain, aArm, aArmEast, b0, b1]) assert.ok(f.role === 'anchor');
});

// a fixture district with extra rectangles on room A, for the merge and rejection cases of the continuation intervals
function withA(extra, mutate = () => {}) {
  const d = fixtureCluster(1, 1);
  d.rooms[0].rects.push(...extra.map(([x0, x1, z0, z1]) => ({ x0: 128 + x0, x1: 128 + x1, z0: 128 + z0, z1: 128 + z1 })));
  mutate(d);
  return d;
}

test('district: continuation intervals merge, reject and vanish', () => {
  // arms on the west face of A, which runs x 148 on from the district's edge
  const mainFace = (d) => cutDistrictCell(validateDistrictPlan(d, 1, 1), 2, 2).fragments.find((f) => f.sourceId === 'v2:space:1,1:r0' && f.rect.x0 === 148 && f.rect.x1 === 191.5);
  // touching intervals [30,32] and [32,34] join into [30,34]
  assert.deepEqual(mainFace(withA([[16, 20, 30, 32], [16, 20, 32, 34]])).seams.nx, { lo: 158, hi: 162 });
  // a single arm
  assert.deepEqual(mainFace(withA([[16, 20, 30, 34]])).seams.nx, { lo: 158, hi: 162 });
  // two separate arms (30–34 and 36–38) cannot be one seam
  expectGeometryError(() => validateDistrictPlan(withA([[16, 20, 30, 34], [16, 20, 36, 38]]), 1, 1));
  // overlapping passage rectangles of one link: [30.5,33.5] and [32.5,35.5] on the fragment's own face merge
  const over = fixtureCluster(1, 1);
  over.links[0].rects.push({ x0: 191, x1: 192.5, z0: 160.5, z1: 163.5 });
  const dv = validateDistrictPlan(over, 1, 1);
  const first = cutDistrictCell(dv, 2, 2).fragments.filter((f) => f.sourceId === 'v2:dlink:1,1:0');
  assert.equal(first.length, 2);
  assert.deepEqual(first[0].seams.px, { lo: 158.5, hi: 161.5 });
  assert.deepEqual(first[1].seams.px, { lo: 160.5, hi: 163.5 });
  assert.deepEqual(first[0].seams.pz, { lo: 191, hi: 192 }, 'the overlapping rectangle continues over the first one\'s far face');
  // zero-length contact: arm A1 (x 16–20, z 30–34) meets arm B1 (x 12–16, z 34–38) only at a corner of its west face
  const dz = validateDistrictPlan(withA([[16, 20, 30, 34], [12, 16, 34, 38], [16, 20, 34, 38]]), 1, 1);
  const arm = cutDistrictCell(dz, 2, 2).fragments.find((f) => f.sourceId === 'v2:space:1,1:r0' && f.rect.z0 === 158 && f.rect.z1 === 162 && f.rect.x0 === 144);
  assert.ok(arm);
  assert.equal(arm.seams.nx, false, 'a contact of zero length is no continuation');
  assert.deepEqual(arm.seams.nz, false);
});

test('district: primary anchor selection', () => {
  const primary = (d, i, j) => cutDistrictCell(validateDistrictPlan(d, 1, 1), i, j).fragments[0];
  const w = fixtureSeamCluster(1, 1);
  const d = validateDistrictPlan(w, 1, 1);
  for (const [i, j] of cellsOf(1, 1)) assert.equal(cutDistrictCell(d, i, j).fragments[0].sourceId, d.anchors[`${i},${j}`]);
  assert.deepEqual(cutDistrictCell(d, 3, 2).fragments[0].rect, { x0: 192, x1: 236, z0: 148, z1: 177.5 }, 'B0 is larger than B1');
  assert.equal(cutDistrictCell(d, 3, 2).fragments[1].rectIndex, 1, 'B1 follows as a secondary anchor piece');

  // the largest piece wins over an earlier one in the canonical order
  const arm = withA([[12, 20, 24, 40]]);
  const pa = primary(arm, 2, 2);
  assert.equal(pa.rectIndex, 1);
  assert.deepEqual(pa.rect, { x0: 148, x1: 191.5, z0: 148, z1: 191.5 });
  assert.equal(cutDistrictCell(validateDistrictPlan(arm, 1, 1), 2, 2).fragments[1].rectIndex, 0);

  // equal areas: the lexicographically first (x0, z0, x1, z1) wins, in any input order
  const tie = (reverse) => {
    const t = fixtureCluster(1, 1);
    const rs = [[20, 63.5, 20, 40], [20, 63.5, 40, 60], [30, 34, 60, 63.5]].map(([x0, x1, z0, z1]) => ({ x0: 128 + x0, x1: 128 + x1, z0: 128 + z0, z1: 128 + z1 }));
    t.rooms[0].rects = reverse ? rs.reverse() : rs;
    return t;
  };
  for (const reverse of [false, true]) {
    const f = primary(tie(reverse), 2, 2);
    assert.deepEqual(f.rect, { x0: 148, x1: 191.5, z0: 148, z1: 168 }, `reverse=${reverse}`);
    assert.equal(f.rectIndex, 0);
  }
  // a cell whose anchor room has no piece in it is rejected
  const away = fixtureCluster(1, 1);
  away.anchors['2,2'] = away.rooms[1].spaceId;
  expectGeometryError(() => validateDistrictPlan(away, 1, 1));
});

test('district: negative coordinates', () => {
  const d = validateDistrictPlan(fixtureCluster(-1, -1), -1, -1);
  assert.deepEqual(Object.keys(d.anchors), ['-2,-2', '-1,-2', '-2,-1', '-1,-1']);
  for (const [i, j] of cellsOf(-1, -1)) {
    const cut = cutDistrictCell(d, i, j), cell = { x0: 64 * i, x1: 64 * i + 64, z0: 64 * j, z1: 64 * j + 64 };
    assert.equal(cut.fragments[0].sourceId, d.anchors[`${i},${j}`]);
    for (const f of cut.fragments) assert.ok(rectIn(f.rect, cell), `${i},${j}`);
  }
  assert.deepEqual(cutDistrictCell(d, -2, -2).fragments[0].rect, { x0: -108, x1: -64.5, z0: -108, z1: -64.5 });
  assert.throws(() => cutDistrictCell(d, 0, 0), { name: 'RangeError', message: 'Cell outside district' });
  assert.throws(() => cutDistrictCell(d, -3, -2), { name: 'RangeError', message: 'Cell outside district' });
  const w = new World2(42, { cluster: only(-1, -1) });
  assert.equal(w.districtPlan(-1, -1).a, -1);
  assert.deepEqual(w.hallOf(-1, -1), { x0: -64, x1: -20, z0: -64, z1: -20, spaceId: 'v2:space:-1,-1:r3' });
  assert.equal(w.plan(-2, -2).rooms[0].spaceId, 'v2:space:-1,-1:r0');
});

test('district: inner mode and legacy suppression', () => {
  const w = new World2(42, { cluster: only(1, 1) }), ref = new World2(42, { clusterShare: 0 });
  const inner = [[2, 2, 'x'], [2, 3, 'x'], [2, 2, 'z'], [3, 2, 'z']];
  const anchor = (i, j) => `v2:space:1,1:r${(i - 2) + 2 * (j - 2)}`;
  for (const [i, j, axis] of inner) {
    const [ni, nj] = axis === 'x' ? [i + 1, j] : [i, j + 1];
    const link = w.linkOf(i, j, axis);
    assert.deepEqual(link, { id: `v2:edge:${axis}:${i},${j}`, axis, fromSpaceId: anchor(i, j), toSpaceId: anchor(ni, nj), mode: 'district' });
    assert.deepEqual(Object.keys(link), ['id', 'axis', 'fromSpaceId', 'toSpaceId', 'mode']);
    assert.deepEqual(w.connectionOf(i, j, axis), link);
    assert.deepEqual(w.linkRects(w.connectionOf(i, j, axis), w.hallOf(i, j), w.hallOf(ni, nj)), []);
  }
  assert.equal(w.closedOf(1, 1), null);
  assert.equal(w.diagonalOf(1, 1), null);
  // legacy districts next to it are the same as in a world without clusters
  for (const [a, b] of [[0, 0], [2, 1], [1, 2], [0, 1], [-1, 3]]) {
    assert.equal(w.closedOf(a, b), ref.closedOf(a, b), `closedOf ${a},${b}`);
    assert.deepEqual(w.diagonalOf(a, b), ref.diagonalOf(a, b), `diagonalOf ${a},${b}`);
  }
  for (const [i, j] of cellsOf(1, 1)) {
    const plan = w.plan(i, j), hall = plan.rooms[0];
    assert.equal(plan.primaryHallId, 0);
    assert.equal(plan.mega, null);
    assert.equal(hall.id, 0);
    assert.equal(hall.kind, 'hall');
    assert.equal(hall.span, 'cluster');
    assert.equal(hall.role, 'anchor');
    assert.equal(hall.spaceId, anchor(i, j));
    assert.deepEqual(Object.keys(plan), ['i', 'j', 'ox', 'oz', 'rooms', 'pools', 'flights', 'voids', 'ladders', 'windows', 'columns', 'primaryHallId', 'mega']);
    assert.ok(plan.rooms.every((o, k) => o.id === k));
    // the passages are the only corridor between the anchors; the cell's two outer links add the rest
    const passages = plan.rooms.filter((o) => o.spaceId?.startsWith('v2:dlink:'));
    assert.equal(passages.length, 2);
    assert.ok(frozenDeep(w.districtPlan(1, 1)));
  }
  const district = JSON.stringify(w.districtPlan(1, 1)), mine = w.plan(2, 2).rooms[0];
  Object.assign(mine, { x0: -1 });
  mine.seams.px = 1;
  mine.grid.step = 99;
  mine.lamps.push(1);
  assert.equal(JSON.stringify(w.districtPlan(1, 1)), district, 'plan rooms do not share the frozen district data');
  assert.throws(() => { w.districtPlan(1, 1).rooms.push(1); }, TypeError);
  assert.notEqual(w.districtCut(w.districtPlan(1, 1), 2, 2).fragments[0].rect.x0, -1);
});

const OUTER = [[1, 2, 'x'], [2, 1, 'z'], [3, 2, 'x'], [3, 1, 'z'], [1, 3, 'x'], [2, 3, 'z'], [3, 3, 'x'], [3, 3, 'z']];

// the longest run of consecutive samples along the edge between cells (i, j) and its +axis neighbour with floor on both sides and equal ceilings
function edgeRun(w, i, j, axis, sameCeil = true) {
  const [ni, nj] = axis === 'x' ? [i + 1, j] : [i, j + 1], A = cellRaster(w, i, j, 0), B = cellRaster(w, ni, nj, 0), n = A.n;
  let best = 0, run = 0;
  for (let t = 0; t < n; t++) {
    const ka = axis === 'x' ? t * n + n - 1 : (n - 1) * n + t, kb = axis === 'x' ? t * n : t;
    if (A.inside[ka] && B.inside[kb] && (!sameCeil || A.ceil[ka] === B.ceil[kb])) best = Math.max(best, ++run);
    else run = 0;
  }
  return best;
}

test('district: mixed outer boundary', () => {
  for (const make of [fixtureCluster, fixtureSeamCluster]) {
    const w = new World2(42, { cluster: only(1, 1, make) });
    for (const [i, j, axis] of OUTER) {
      const [ni, nj] = axis === 'x' ? [i + 1, j] : [i, j + 1];
      const con = w.connectionOf(i, j, axis);
      assert.equal(con.id, `v2:edge:${axis}:${i},${j}`);
      assert.ok(['corridor', 'connector-room'].includes(con.mode), `${con.id} ${con.mode}`);
      assert.equal(con.fromSpaceId, w.hallOf(i, j).spaceId);
      assert.equal(con.toSpaceId, w.hallOf(ni, nj).spaceId);
      assert.ok([con.fromSpaceId, con.toSpaceId].some((s) => s.startsWith('v2:space:1,1:r')), 'one end is a cluster anchor');
      assert.ok(edgeRun(w, i, j, axis) >= 3, `${con.id}: three samples of floor and equal ceiling across the edge`);
      // both orders of planning agree on the record and on both plans
      const a = new World2(42, { cluster: only(1, 1, make) }), b = new World2(42, { cluster: only(1, 1, make) });
      const pa = [JSON.stringify(a.plan(i, j)), JSON.stringify(a.plan(ni, nj))], pb = [JSON.stringify(b.plan(ni, nj)), JSON.stringify(b.plan(i, j))].reverse();
      assert.deepEqual(pa, pb, `${con.id}: plan order`);
      assert.equal(JSON.stringify(a.connectionOf(i, j, axis)), JSON.stringify(b.connectionOf(i, j, axis)));
      assert.equal(JSON.stringify(a.connectionOf(i, j, axis)), JSON.stringify(con));
    }
    // each cluster cell has two outer edges: two outer corridor halves
    for (const [i, j] of cellsOf(1, 1)) {
      const plan = w.plan(i, j);
      const halves = plan.rooms.filter((o) => o.kind === 'corridor' && o.spaceId === undefined).length;
      assert.ok(halves >= 2, `${i},${j} has its two outer corridor halves`);
    }
    // the four inner edges: the two passage pieces agree, and the raster is open across
    for (const [i, j, axis] of [[2, 2, 'x'], [2, 3, 'x'], [2, 2, 'z'], [3, 2, 'z']]) {
      assert.ok(edgeRun(w, i, j, axis, false) >= 3, `inner ${axis}:${i},${j}`);
    }
  }
});

test('district: real body reaches four rooms', () => {
  for (const make of [fixtureCluster, fixtureSeamCluster]) {
    const world = new World2(42, { cluster: only(1, 1, make) }), source = make(1, 1), start = [189, 160, 0];
    const player = new Player();
    player.x = 189;
    player.z = 160;
    assert.equal(player.canStand(world, 189, 160, 0), true);
    const surface = world.surfaceAt(189, 160, 0);
    assert.ok(surface);
    assert.equal(surface.h, 0);
    assert.equal(Number.isNaN(surface.wl), true);
    const states = reachSet(world, 128, 128, 256, 256, start);
    for (const room of source.rooms) {
      const hit = states.find(([x, z, h]) => h === 0 && room.rects.some((r) => x - 0.4 > r.x0 && x + 0.4 < r.x1 && z - 0.4 > r.z0 && z + 0.4 < r.z1));
      assert.ok(hit, `${room.spaceId} is reached`);
      const [x, z] = hit;
      player.x = x;
      player.z = z;
      assert.equal(player.canStand(world, x, z, 0), true);
      const s = { ...world.surfaceAt(x, z, 0) };
      assert.equal(s.h, 0);
      assert.equal(Number.isNaN(s.wl), true);
      assert.equal(world.roomAt(0, x, z).spaceId === room.spaceId || world.roomAt(0, x, z).spaceId.startsWith('v2:dlink:'), true);
    }
  }
});

test('district: planning order independent', () => {
  const order = [[2, 2], [3, 2], [2, 3], [3, 3]];
  for (const make of [fixtureCluster, fixtureSeamCluster]) {
    const run = (cells, w) => Object.fromEntries(cells.map(([i, j]) => [`${i},${j}`, JSON.stringify(w.plan(i, j))]));
    const fwd = run(order, new World2(42, { cluster: only(1, 1, make) }));
    const rev = run([...order].reverse(), new World2(42, { cluster: only(1, 1, make) }));
    assert.deepEqual(rev, fwd);
    // evict the district and the four plans, then plan again
    const w = new World2(42, { cluster: only(1, 1, make) });
    assert.deepEqual(run(order, w), fwd);
    w.districts.delete('1,1');
    for (const [i, j] of order) w.plans.delete(`${i},${j}`);
    const again = w.districtPlan(1, 1);
    assert.ok(again);
    assert.deepEqual(run(order, w), fwd, 'after a district eviction');
    // and after the cache has been pushed past its limit by other districts
    for (let a = 2; a <= 140; a++) w.districtPlan(a, 5);
    assert.equal(w.districts.has('1,1'), false);
    for (const [i, j] of order) w.plans.delete(`${i},${j}`);
    assert.deepEqual(run([order[3], order[1], order[0], order[2]], w), fwd, 'after the cache turned over');
  }
});

test('district: FIFO eviction and recreation', () => {
  const world = new World2(42, { cluster: everywhere() }), planned = world.plans.size;
  const original = world.districtPlan(1, 0);
  for (let a = 1; a <= 451; a++) world.districtPlan(a, 0);
  assert.equal(world.districts.size, 100);
  assert.deepEqual([...world.districts.keys()], Array.from({ length: 100 }, (_, k) => `${352 + k},0`));
  assert.equal(world.districts.has('1,0'), false);
  const recreated = world.districtPlan(1, 0);
  assert.deepEqual(recreated, original);
  assert.notEqual(recreated, original);
  assert.deepEqual([...world.districts.keys()], [...Array.from({ length: 99 }, (_, k) => `${353 + k},0`), '1,0']);
  assert.equal(world.districts.size, 100);
  world.districtPlan(400, 0);
  assert.deepEqual([...world.districts.keys()].slice(-1), ['1,0'], 'a hit leaves the order alone');
  assert.equal(world.plans.size, planned, 'district planning builds no cell plan');

  // rejected results never enter the cache, and the factory is asked again
  let asked = 0;
  let armed = false;
  const bad = new World2(42, { cluster: () => { if (!armed) return null; asked++; return { a: 9, b: 9 }; } });
  armed = true;
  expectPlanError(() => bad.districtPlan(1, 1));
  expectPlanError(() => bad.districtPlan(1, 1));
  assert.equal(asked, 2);
  assert.equal(bad.districts.has('1,1'), false);
  let spoil = false;
  const broken = new World2(42, { cluster: (a, b) => { if (!spoil) return null; const d = fixtureCluster(a, b); d.rooms[1].rects[0].x0 = 100.25; return d; } });
  const cached = broken.districts.size;
  spoil = true;
  expectGeometryError(() => broken.districtPlan(1, 1));
  assert.equal(broken.districts.has('1,1'), false);
  assert.equal(broken.districts.size, cached);
  // undefined is not a null selection
  expectPlanError(() => new World2(42, { cluster: () => undefined }));   // already while the spawn asks for the start district's neighbours
});

test('district: malformed plans rejected', () => {
  const ok = () => fixtureCluster(1, 1);
  const typeCases = {
    'not an object': () => null,
    'rooms missing': () => { const d = ok(); delete d.rooms; return d; },
    'rooms not an array': () => { const d = ok(); d.rooms = {}; return d; },
    'rooms empty': () => { const d = ok(); d.rooms = []; d.links = []; return d; },
    'links missing': () => { const d = ok(); delete d.links; return d; },
    'anchors missing': () => { const d = ok(); delete d.anchors; return d; },
    'wrong a': () => { const d = ok(); d.a = 2; return d; },
    'wrong b': () => { const d = ok(); d.b = 0; return d; },
    'unknown role': () => { const d = ok(); d.rooms[0].role = 'hall'; return d; },
    'unknown link kind': () => { const d = ok(); d.links[0].kind = 'door'; return d; },
    'room without rects': () => { const d = ok(); d.rooms[0].rects = []; return d; },
    'link without rects': () => { const d = ok(); d.links[0].rects = []; return d; },
    'room rect not an array': () => { const d = ok(); d.rooms[0].rects = {}; return d; },
    'rect field missing': () => { const d = ok(); delete d.rooms[0].rects[0].z1; return d; },
    'rect field a string': () => { const d = ok(); d.rooms[0].rects[0].z1 = '63.5'; return d; },
    'duplicate room id': () => { const d = ok(); d.rooms[1].spaceId = d.rooms[0].spaceId; return d; },
    'nonsequential room id': () => { const d = ok(); [d.rooms[1].spaceId, d.rooms[2].spaceId] = [d.rooms[2].spaceId, d.rooms[1].spaceId]; return d; },
    'room id for another district': () => { const d = ok(); d.rooms[3].spaceId = 'v2:space:1,2:r3'; return d; },
    'nonsequential link id': () => { const d = ok(); d.links[2].id = 'v2:dlink:1,1:7'; return d; },
    'duplicate link id': () => { const d = ok(); d.links[1].id = d.links[0].id; return d; },
    'missing anchor key': () => { const d = ok(); delete d.anchors['3,3']; return d; },
    'extra anchor key': () => { const d = ok(); d.anchors['4,4'] = d.rooms[0].spaceId; return d; },
    'wrong anchor key': () => { const d = ok(); d.anchors['5,5'] = d.anchors['3,3']; delete d.anchors['3,3']; return d; },
    'dangling anchor': () => { const d = ok(); d.anchors['2,2'] = 'v2:space:1,1:r9'; return d; },
    'anchor to a plain room': () => { const d = ok(); d.rooms[0].role = 'room'; return d; },
    'dangling link end': () => { const d = ok(); d.links[0].to = 'v2:space:1,1:r9'; return d; },
    'missing link end': () => { const d = ok(); delete d.links[0].from; return d; },
    'equal link ends': () => { const d = ok(); d.links[0].to = d.links[0].from; return d; },
    'ceil missing': () => { const d = ok(); delete d.rooms[0].ceil; return d; },
    'ceil a string': () => { const d = ok(); d.rooms[0].ceil = '4'; return d; },
    'grid missing': () => { const d = ok(); delete d.rooms[0].grid; return d; },
    'grid field missing': () => { const d = ok(); delete d.links[0].grid.step; return d; },
  };
  for (const [name, make] of Object.entries(typeCases)) {
    const raw = make();
    const snapshot = raw && JSON.stringify(raw);
    expectPlanError(() => validateDistrictPlan(raw, 1, 1));
    if (snapshot) assert.equal(JSON.stringify(raw), snapshot, `${name}: the input is not mutated`);
  }
  for (const [a, b] of [[1.5, 1], [1, 0.5], [NaN, 1], [1, Infinity], [2 ** 53, 1], ['1', 1], [undefined, 1]]) expectPlanError(() => validateDistrictPlan(ok(), a, b));

  const rangeCases = {
    'nonfinite coordinate': () => { const d = ok(); d.rooms[0].rects[0].x0 = NaN; return d; },
    'infinite coordinate': () => { const d = ok(); d.rooms[0].rects[0].x1 = Infinity; return d; },
    'zero width': () => { const d = ok(); d.rooms[0].rects[0].x1 = d.rooms[0].rects[0].x0; return d; },
    'negative height': () => { const d = ok(); const r = d.rooms[2].rects[0]; [r.z0, r.z1] = [r.z1, r.z0]; return d; },
    'edge off the Q2 grid': () => { const d = ok(); d.rooms[0].rects[0].x0 += 0.25; return d; },
    'outside the district (low)': () => { const d = ok(); d.rooms[0].rects[0].x0 = 139.5; return d; },
    'outside the district (high)': () => { const d = ok(); d.rooms[3].rects[0].x1 = 244.5; return d; },
    'passage outside the district': () => { const d = ok(); d.links[0].rects[0].z0 = 139.5; return d; },
    'ceiling under 2': () => { const d = ok(); d.rooms[0].ceil = 1.5; return d; },
    'ceiling off the grid': () => { const d = ok(); d.rooms[0].ceil = 4.25; return d; },
    'ceiling not finite': () => { const d = ok(); d.rooms[0].ceil = NaN; return d; },
    'level not zero': () => { const d = ok(); d.rooms[0].lv = 1; return d; },
    'grid step under 0.5': () => { const d = ok(); d.rooms[0].grid.step = 0.25; return d; },
    'grid origin off the grid': () => { const d = ok(); d.links[0].grid.ox += 0.1; return d; },
    'grid not finite': () => { const d = ok(); d.rooms[1].grid.oz = Infinity; return d; },
    'anchor misses a band': () => { const d = ok(); d.rooms[0].rects[0].x1 = 170; return d; },
    'anchor too far from the boundary': () => { const d = ok(); d.rooms[3].rects[0].x1 = 220; return d; },
    'rooms overlap': () => { const d = ok(); d.rooms[1].rects[0].x0 = 190; return d; },
    'rects of one room overlap': () => { const d = ok(); d.rooms[0].rects.push({ x0: 150, x1: 160, z0: 150, z1: 160 }); return d; },
    'room in two pieces': () => { const d = ok(); d.rooms[0].rects.push({ x0: 150, x1: 156, z0: 192.5, z1: 195 }); return d; },
    'room pieces meet at a corner': () => { const d = ok(); d.rooms[0].rects.push({ x0: 191.5, x1: 192, z0: 191.5, z1: 192 }); return d; },
    'passage overlaps a stranger': () => { const d = ok(); d.links[0].rects[0].z1 = 200; return d; },
    'passages overlap': () => { const d = ok(); d.links[1] = { ...d.links[1], rects: [{ x0: 191, x1: 192.5, z0: 159, z1: 162 }] }; return d; },
    'passage misses an end': () => { const d = ok(); d.links[0].rects[0] = { x0: 170, x1: 180, z0: 158.5, z1: 161.5 }; return d; },
    'passage in two pieces': () => { const d = ok(); d.links[0].rects.push({ x0: 200, x1: 204, z0: 150, z1: 153 }); return d; },
    'rooms not connected': () => { const d = ok(); d.links = []; return d; },
    'one room cut off': () => { const d = ok(); d.links = d.links.filter((l) => l.to !== d.rooms[3].spaceId && l.from !== d.rooms[3].spaceId); d.links.forEach((l, k) => { l.id = `v2:dlink:1,1:${k}`; }); return d; },
    'two separate seams on a face': () => { const d = ok(); d.rooms[0].rects.push({ x0: 191.5, x1: 194, z0: 178, z1: 182 }, { x0: 191.5, x1: 194, z0: 184, z1: 186 }); return d; },
  };
  for (const [name, make] of Object.entries(rangeCases)) {
    const raw = make();
    const snapshot = JSON.stringify(raw);
    expectGeometryError(() => validateDistrictPlan(raw, 1, 1));
    assert.equal(JSON.stringify(raw), snapshot, `${name}: the input is not mutated`);
  }

  // a valid plan comes back as a new frozen copy in canonical order
  const raw = fixtureSeamCluster(1, 1);
  raw.rooms[0].rects.reverse();
  raw.rooms[1].rects.reverse();
  raw.links[0].rects.push({ x0: 191, x1: 192.5, z0: 160.5, z1: 163.5 }, { x0: 191, x1: 192.5, z0: 159, z1: 160 });
  const before = JSON.stringify(raw);
  const d = validateDistrictPlan(raw, 1, 1);
  assert.equal(JSON.stringify(raw), before, 'the input is not mutated');
  assert.ok(frozenDeep(d));
  assert.notEqual(d, raw);
  assert.notEqual(d.rooms[0].rects[0], raw.rooms[0].rects[0]);
  for (const o of [...d.rooms, ...d.links]) {
    const sorted = [...o.rects].sort((p, q) => p.x0 - q.x0 || p.z0 - q.z0 || p.x1 - q.x1 || p.z1 - q.z1);
    assert.deepEqual(o.rects, sorted, `${o.spaceId ?? o.id} is in canonical order`);
  }
  raw.rooms[0].ceil = 99;
  assert.equal(d.rooms[0].ceil, 4, 'later changes to the input do not reach the copy');
  assert.throws(() => { d.rooms[0].ceil = 5; }, TypeError);
  assert.throws(() => { d.rooms.push(1); }, TypeError);
});

// every lamp of a plan, with the room it belongs to
const lampsOf = (plan) => plan.rooms.flatMap((o) => o.lamps.map((l) => ({ o, cx: l.x + 0.6, cz: l.z + 0.6 })));

test('district: shared lamp grid', () => {
  for (const make of [fixtureCluster, fixtureSeamCluster]) {
    const w = new World2(42, { cluster: only(1, 1, make) }), source = make(1, 1);
    const bySource = new Map(), centres = new Set();
    for (const [i, j] of cellsOf(1, 1)) {
      const plan = w.plan(i, j);
      for (const o of plan.rooms) if (/^v2:(space:1,1:r|dlink:1,1:)/.test(o.spaceId ?? '')) {
        if (!bySource.has(o.spaceId)) bySource.set(o.spaceId, []);
        bySource.get(o.spaceId).push(o);
      }
      for (const { o, cx, cz } of lampsOf(plan)) {
        assert.ok(cx >= o.x0 && cx < o.x1 && cz >= o.z0 && cz < o.z1, 'a lamp belongs to the fragment its middle is in (half-open)');
        if (!/^v2:(space:1,1:r|dlink:1,1:)/.test(o.spaceId ?? '')) continue;
        const key = `${o.spaceId}:${cx},${cz}`;
        assert.ok(!centres.has(key), `duplicate lamp ${key}`);
        centres.add(key);
        const src = [...source.rooms, ...source.links].find((s) => (s.spaceId ?? s.id) === o.spaceId);
        // the lamp's 1.2 m square stands inside the source's union: 0.6 m clear of every solid wall
        const inside = (x, z) => src.rects.some((r) => x >= r.x0 - 1e-9 && x <= r.x1 + 1e-9 && z >= r.z0 - 1e-9 && z <= r.z1 + 1e-9);
        for (const dx of [-0.6, 0, 0.6]) for (const dz of [-0.6, 0, 0.6]) assert.ok(inside(cx + dx, cz + dz), `${key} is clear of the walls`);
        const g = src.grid, onGrid = (v, o0) => Math.abs(((v - o0 - g.step / 2) / g.step) - Math.round((v - o0 - g.step / 2) / g.step)) < 1e-9;
        assert.ok(onGrid(cx, g.ox) && onGrid(cz, g.oz), `${key} is on the source's grid`);
      }
    }
    for (const [id, frags] of bySource) {
      const src = [...source.rooms, ...source.links].find((s) => (s.spaceId ?? s.id) === id);
      for (const f of frags) {
        assert.deepEqual(f.grid, src.grid, `${id} shares one grid`);
        assert.equal(f.ceil, frags[0].ceil);
      }
    }
    assert.ok(centres.size > 0);
  }
  // overlapping passage rectangles of one link do not emit a lamp twice: a long passage between A and a farther B
  const long = () => {
    const d = fixtureCluster(1, 1);
    d.rooms[1].rects[0].x0 = 200;
    d.links[0].rects = [{ x0: 191, x1: 198, z0: 156, z1: 162 }, { x0: 195, x1: 201, z0: 156, z1: 162 }];
    d.links[0].grid = { ox: 191, oz: 156, step: 4 };
    return d;
  };
  const w = new World2(42, { cluster: only(1, 1, long) });
  const seen = new Map();
  for (const [i, j] of [[2, 2], [3, 2]]) for (const { o, cx, cz } of lampsOf(w.plan(i, j))) if (o.spaceId === 'v2:dlink:1,1:0') seen.set(`${cx},${cz}`, (seen.get(`${cx},${cz}`) ?? 0) + 1);
  assert.ok(seen.size >= 2, `the long passage is lit: ${[...seen.keys()]}`);
  assert.ok([...seen.values()].every((n) => n === 1), 'one lamp per centre');
  assert.ok(seen.has('197,158'), 'a centre inside both rectangles');
});

// per anchor cell of district (1, 1): the rectangles that stay clear of features. A passage gives a mouth 3 m deep over its width, a
// continuation of the anchor into its neighbouring piece one 6 m deep over the stretch it continues
const MOUTHS = {
  plain: {
    '2,2': [{ x0: 188.5, x1: 191.5, z0: 158.5, z1: 161.5 }, { x0: 158.5, x1: 161.5, z0: 188.5, z1: 191.5 }],
    '3,2': [{ x0: 192, x1: 195, z0: 158.5, z1: 161.5 }, { x0: 222.5, x1: 225.5, z0: 188.5, z1: 191.5 }],
    '2,3': [{ x0: 188.5, x1: 191.5, z0: 222.5, z1: 225.5 }, { x0: 158.5, x1: 161.5, z0: 192, z1: 195 }],
    '3,3': [{ x0: 192, x1: 195, z0: 222.5, z1: 225.5 }, { x0: 222.5, x1: 225.5, z0: 192, z1: 195 }],
  },
  seam: {
    '2,2': [{ x0: 188.5, x1: 191.5, z0: 158.5, z1: 161.5 }, { x0: 158.5, x1: 161.5, z0: 188.5, z1: 191.5 }, { x0: 185.5, x1: 191.5, z0: 178, z1: 182 }],
    '3,2': [{ x0: 222.5, x1: 225.5, z0: 188.5, z1: 191.5 }, { x0: 194, x1: 236, z0: 171.5, z1: 177.5 }],
  },
};

test('district: protected mouths and fragment features', () => {
  let features = 0, seamPieces = 0, lit = 0;
  for (const [name, make] of [['plain', fixtureCluster], ['seam', fixtureSeamCluster]]) {
    for (let seed = 1; seed <= 60; seed++) {
      const w = new World2(seed, { cluster: only(1, 1, make) });
      for (const [i, j] of cellsOf(1, 1)) {
        const plan = w.plan(i, j), keep = MOUTHS[name][`${i},${j}`] ?? [];
        const boxes = [
          ...plan.flights.flatMap((f) => [f, f.hallEntry]),
          ...plan.voids,
          ...plan.windows.map((wn) => wn.front),
          ...plan.columns.map((c) => ({ x0: c.x - c.r, x1: c.x + c.r, z0: c.z - c.r, z1: c.z + c.r })),
        ];
        features += boxes.length;
        for (const b of boxes) for (const m of keep) assert.ok(!overlap(b, m), `${name} seed ${seed} cell ${i},${j}: a feature on a mouth`);
        for (const p of plan.pools.filter((q) => q.room === 0)) {
          const sh = p.shape, bb = { x0: sh.cx - (sh.hw ?? sh.r ?? 0), x1: sh.cx + (sh.hw ?? sh.r ?? 0), z0: sh.cz - (sh.hd ?? sh.r ?? 0), z1: sh.cz + (sh.hd ?? sh.r ?? 0) };
          for (const m of keep) assert.ok(!overlap(bb, m), `${name} seed ${seed} cell ${i},${j}: a pool on a mouth`);
        }
        // features belong to the primary anchor piece or to rooms generated for it, never to the other room pieces
        const pieces = plan.rooms.filter((o) => o.span === 'cluster' && o.id !== 0);
        const ids = new Set(pieces.map((o) => o.id));
        seamPieces += pieces.length;
        for (const p of plan.pools) assert.ok(!ids.has(p.room));
        for (const c of plan.columns) assert.ok(!ids.has(c.room));
        for (const v of plan.voids) assert.ok(!ids.has(v.under) && !ids.has(v.over));
        for (const wn of plan.windows) assert.ok(!ids.has(wn.hall) && !ids.has(wn.room));
        for (const fl of plan.flights) assert.ok(!ids.has(fl.room));
        for (const o of pieces) lit += o.lamps.length;
      }
    }
  }
  assert.ok(features > 0, 'some seed placed features');
  assert.ok(seamPieces > 0, 'the seam fixture has other room pieces');
  assert.ok(lit > 0, 'the other room pieces are lit');
});
