// T4 shared-wall openings, mesh: the headers, undersides and cross-cell ceiling steps of an opening, on an isolated world of one pair of rooms
// and their bridge (not a validated district), so the cell boundaries can be put anywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clipDistrictRect } from '../../js/gen2-district.js';
import { loadMesher, quadsOf, coplanarOverlaps } from './mesh-helper.mjs';

const TOL = 1e-6, CELL = 64, Q = 0.5;
const near = (a, b) => Math.abs(a - b) < TOL;
const byRect = (p, q) => p.x0 - q.x0 || p.z0 - q.z0 || p.x1 - q.x1 || p.z1 - q.z1;

// a world of two rooms A, B ({ x0, x1, z0, z1, ceil }) and the bridges of one opening between them, planned per 64 m cell
function makeMeshPlans(A, B, opening) {
  const bridges = opening.apertures.map(({ lo, hi }) => (opening.axis === 'x'
    ? { x0: opening.c0 - 0.5, x1: opening.c1 + 0.5, z0: lo, z1: hi } : { x0: lo, x1: hi, z0: opening.c0 - 0.5, z1: opening.c1 + 0.5 }));
  const physical = [{ ...A, id: 'v2:space:0,0:r0' }, { ...B, id: 'v2:space:0,0:r1' }].sort(byRect);
  const pieces = [];
  for (const p of physical) pieces.push({ rect: p, kind: 'hall', ceil: p.ceil, spaceId: p.id, grid: { ox: p.x0, oz: p.z0, step: 6 } });
  bridges.forEach((r) => pieces.push({ rect: r, kind: 'corridor', ceil: opening.height, spaceId: 'v2:dlink:0,0:0', grid: { ox: bridges[0].x0, oz: bridges[0].z0, step: 6 }, opening }));
  const cells = new Set();
  for (const { rect } of pieces) for (let i = Math.floor(rect.x0 / CELL); i < Math.ceil(rect.x1 / CELL); i++) for (let j = Math.floor(rect.z0 / CELL); j < Math.ceil(rect.z1 / CELL); j++) cells.add(`${i},${j}`);
  const plans = new Map();
  for (const key of cells) {
    const [i, j] = key.split(',').map(Number), plan = { i, j, ox: i * CELL, oz: j * CELL, rooms: [], pools: [], flights: [], voids: [], ladders: [], windows: [], columns: [], primaryHallId: 0 };
    for (const p of pieces) {
      const r = clipDistrictRect(p.rect, i, j);
      if (!r) continue;
      const o = { id: plan.rooms.length, lv: 0, ...r, kind: p.kind, ceil: p.ceil, lamps: [], spaceId: p.spaceId, seams: { nx: null, px: null, nz: null, pz: null }, grid: { ...p.grid } };
      if (p.opening) o.opening = { ...p.opening, apertures: p.opening.apertures.map((a) => ({ ...a })) };
      plan.rooms.push(o);
    }
    const first = plan.rooms.find((o) => o.kind === 'hall');
    plan.primaryHallId = first ? first.id : 0;
    plans.set(key, plan);
  }
  const empty = (i, j) => ({ i, j, ox: i * CELL, oz: j * CELL, rooms: [], pools: [], flights: [], voids: [], ladders: [], windows: [], columns: [], primaryHallId: 0 });
  const floor = [physical, bridges];
  return {
    Y: { [-1]: -7, 0: 0, 1: 8 }, bodyR: 0.4, cells: [...cells].map((k) => k.split(',').map(Number)),
    plan: (i, j) => plans.get(`${i},${j}`) ?? empty(i, j),
    roomAt: (lv, x, z) => (lv === 0 && floor.flat().some((r) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) ? { lv } : null),
    flightAt: () => null,
  };
}

// the original fixture of the handoff (x-normal doorway; B taller than A) or its transpose, with the style and ceilings asked for
function makeOpeningMeshWorld({ axis = 'x', style = 'doorway', equalHeights = false } = {}) {
  let A = { x0: 20, x1: 63.5, z0: 50, z1: 78, ceil: 4 }, B = { x0: 64, x1: 108, z0: 50, z1: 78, ceil: equalHeights ? 4 : 5 };
  let opening = { style, lv: 0, axis: 'x', c0: 63.5, c1: 64, s0: 50, s1: 78, height: 2.5, apertures: [{ lo: 62.5, hi: 65.5 }] };
  if (style === 'open') {
    A = { ...A, x1: 64 }; B = { ...B, x0: 64 };
    opening = { ...opening, c0: 64, c1: 64, height: 4, apertures: [{ lo: 50, hi: 78 }] };
  } else if (equalHeights) B = { ...B, ceil: 4 };
  if (axis === 'z') {
    const T = (r) => ({ x0: r.z0, x1: r.z1, z0: r.x0, z1: r.x1, ceil: r.ceil });
    A = T(A); B = T(B); opening = { ...opening, axis: 'z' };
  }
  return { world: makeMeshPlans(A, B, opening), A, B, opening };
}

const built = new Map();
// every quad (with the unit normal of its first triangle) of the static geometry of every cell of a world, tagged with its cell
async function meshOf(world) {
  await loadMesher();
  const { buildCell2 } = await import('../../js/mesh2.js');
  const out = [];
  for (const [i, j] of world.cells) {
    const it = buildCell2(world, i, j);
    let r = it.next();
    while (!r.done) r = it.next();
    const geo = r.value.static;
    if (!geo) continue;
    const pos = geo.attributes.position.array, idx = geo.index.array, quads = quadsOf(geo);
    quads.forEach((q, n) => {
      const [a, b, c] = [0, 1, 2].map((t) => idx[n * 6 + t]), u = [0, 1, 2].map((k) => pos[b * 3 + k] - pos[a * 3 + k]), v = [0, 1, 2].map((k) => pos[c * 3 + k] - pos[a * 3 + k]);
      const m = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], len = Math.hypot(...m);
      out.push({ i, j, q, n: m.map((t) => t / len), tris: idx.length / 3 });
    });
  }
  return out;
}
const spans = (q) => ({ x: [Math.min(...q.map((p) => p[0])), Math.max(...q.map((p) => p[0]))], y: [Math.min(...q.map((p) => p[1])), Math.max(...q.map((p) => p[1]))], z: [Math.min(...q.map((p) => p[2])), Math.max(...q.map((p) => p[2]))] });
// vertical faces on the plane axis = at whose y extent is [y0, y1]
const stepsAt = (quads, axis, at, y0, y1) => quads.filter(({ q }) => { const s = spans(q); return near(s[axis][0], at) && near(s[axis][1], at) && near(s.y[0], y0) && near(s.y[1], y1); });
const horizontal = (quads, y, sign) => quads.filter(({ q, n }) => { const s = spans(q); return near(s.y[0], y) && near(s.y[1], y) && Math.sign(n[1]) === sign; });
const areaOf = ({ q }) => { const s = spans(q); return (s.x[1] - s.x[0]) * (s.z[1] - s.z[0]); };
const along = (axis) => (axis === 'x' ? 'z' : 'x');

test('opening mesh: header underside and faces', async () => {
  const { world } = makeOpeningMeshWorld();
  assert.deepEqual(world.cells.map((c) => c.join()).sort(), ['0,0', '0,1', '1,0', '1,1']);
  const quads = await meshOf(world);
  // one low underside, the exposed strip [63.5, 64] × [62.5, 65.5]: 1.5 m² in all, and nowhere else at 2.5 m
  const under = horizontal(quads, 2.5, -1);
  assert.ok(under.length > 0);
  assert.ok(near(under.reduce((s, q) => s + areaOf(q), 0), 1.5));
  for (const { q } of under) { const s = spans(q); assert.ok(s.x[0] >= 63.5 - TOL && s.x[1] <= 64 + TOL && s.z[0] >= 62.5 - TOL && s.z[1] <= 65.5 + TOL); }
  assert.equal(horizontal(quads, 2.5, 1).length, 0, 'no floor at the lintel height');
  // the header: the in-cell step at x = 63.5 from 2.5 to 4, facing into the higher room A
  const header = stepsAt(quads, 'x', 63.5, 2.5, 4);
  assert.equal(header.length, 6);
  for (const { n } of header) assert.ok(n[0] < -0.99, 'header faces A');
  // the boundary step at x = 64 from 2.5 to 5: six Q2 quads of two triangles, from the lower cell (column 0), facing the higher room B
  const step = stepsAt(quads, 'x', 64, 2.5, 5);
  assert.equal(step.length, 6);
  assert.deepEqual(step.map((s) => s.i), [0, 0, 0, 0, 0, 0], 'owned by the lower cell');
  const zs = step.map(({ q }) => spans(q).z).sort((p, q) => p[0] - q[0]);
  zs.forEach(([a, b], k) => { assert.ok(near(a, 62.5 + Q * k) && near(b, 63 + Q * k)); });
  for (const { n } of step) assert.ok(n[0] > 0.99, 'the face looks into the higher room');
  const raw = await (async () => { const { buildCell2 } = await import('../../js/mesh2.js'); const it = buildCell2(world, 0, 0); let r = it.next(); while (!r.done) r = it.next(); return r.value.static; })();
  const tris = raw.index.array.length / 3, quadCount = raw.attributes.position.array.length / 12;
  assert.equal(tris, quadCount * 2, 'two triangles per quad');
});

test('opening mesh: normal and transverse cell seams', async () => {
  const { cutsAperture } = await import('../../js/mesh2.js');
  // the original x-normal doorway and its z-normal transpose: six unequal-height steps across the aperture at the normal boundary 64
  for (const axis of ['x', 'z']) {
    const { world } = makeOpeningMeshWorld({ axis });
    const quads = await meshOf(world), fixed = axis, run = along(axis);
    const step = stepsAt(quads, fixed, 64, 2.5, 5);
    assert.equal(step.length, 6, `${axis}: six steps`);
    const ranges = step.map(({ q }) => spans(q)[run]).sort((p, q) => p[0] - q[0]);
    ranges.forEach(([a, b], k) => assert.ok(near(a, 62.5 + Q * k) && near(b, 63 + Q * k)));
    for (const { n } of step) assert.ok(n[axis === 'x' ? 0 : 2] > 0.99, 'toward the higher side');
    // the transverse boundary (the other axis at 64) crosses the aperture, but the bridge and its ends match on both sides: no step there
    const transverse = quads.filter(({ q }) => { const s = spans(q); return near(s[run][0], 64) && near(s[run][1], 64) && s.y[1] - s.y[0] > TOL && s[fixed][0] >= 62.5 && s[fixed][1] <= 65.5; });
    assert.equal(transverse.length, 0, `${axis}: no step across the transverse seam`);
    // floor and ceiling run on without a gap over both sides of it
    for (const sign of [1, -1]) {
      const layer = sign > 0 ? horizontal(quads, 0, 1) : [...horizontal(quads, 2.5, -1), ...horizontal(quads, 4, -1), ...horizontal(quads, 5, -1)];
      const covered = (u, v) => layer.some(({ q }) => { const s = spans(q); const [a, b] = axis === 'x' ? [s.x, s.z] : [s.z, s.x]; return u >= a[0] - TOL && u <= a[1] + TOL && v >= b[0] - TOL && v <= b[1] + TOL; });
      for (const u of [63.75, 64.25]) for (const v of [63.75, 64.25]) assert.ok(covered(u, v), `${axis}: layer ${sign} at ${u},${v}`);
    }
  }
  // the four predicates of the handoff, each true inside its ranges and false just outside them, by boundary orientation and opening axis
  const door = (axis) => ({ axis, c0: 63.5, c1: 64, apertures: [{ lo: 62.5, hi: 65.5 }] });
  for (const [axis, vertical, B, m] of [['x', true, 64, 64], ['x', false, 64, 63.75], ['z', true, 64, 63.75], ['z', false, 64, 64]]) {
    assert.equal(cutsAperture(door(axis), vertical, B, m), true, `${axis} ${vertical} inside`);
    assert.equal(cutsAperture(door(axis), vertical, B + 2, m), false, `${axis} ${vertical} fixed range missed`);
    assert.equal(cutsAperture(door(axis), vertical, B, m + 2), false, `${axis} ${vertical} segment range missed`);
  }
  assert.equal(cutsAperture(door('x'), true, 63, 64), false, 'a boundary on the edge of N does not cut it');
  assert.equal(cutsAperture(door('x'), true, 64, 65.5), false, 'S is half open at its top');
  assert.equal(cutsAperture(door('x'), true, 64, 62.5), true, 'S is closed at its bottom');
  // whenever the predicate holds, both raster samples beside the boundary lie inside that aperture's bridge rectangle (so they are always
  // in the bridge union): the boundary and the opening edges sit on the 0.5 m grid and the segment middle is a quarter off it
  let held = 0;
  for (const axis of ['x', 'z']) for (const [c0, c1] of [[63.5, 64], [64, 64], [62, 62.5], [60, 60]]) for (const [lo, hi] of [[50, 78], [62.5, 65.5], [64, 66], [20.5, 23.5]]) {
    const o = { axis, c0, c1, apertures: [{ lo, hi }] };
    for (const vertical of [true, false]) for (let m = 10.25; m < 100; m += 0.5) {
      if (!cutsAperture(o, vertical, 64, m)) continue;
      held++;
      const onNormal = vertical === (axis === 'x'), [n0, n1] = [c0 - 0.5, c1 + 0.5], [t0, t1] = onNormal ? [lo, hi] : [n0, n1], [f0, f1] = onNormal ? [n0, n1] : [lo, hi];
      for (const side of [63.75, 64.25]) assert.ok(side > f0 && side < f1 && m > t0 && m < t1, `${axis} ${vertical} ${c0},${c1} ${lo},${hi} at ${m}`);
    }
  }
  assert.ok(held > 100);
  // disjoint normal range and cell edge: the aperture sits at z 20.5–23.5, nowhere near any z boundary
  for (const axis of ['x', 'z']) {
    const A = { x0: 20, x1: 63.5, z0: 10, z1: 40, ceil: 4 }, B = { x0: 64, x1: 108, z0: 10, z1: 40, ceil: 5 };
    const open = { style: 'doorway', lv: 0, axis: 'x', c0: 63.5, c1: 64, s0: 10, s1: 40, height: 2.5, apertures: [{ lo: 20.5, hi: 23.5 }] };
    const T = (r) => ({ x0: r.z0, x1: r.z1, z0: r.x0, z1: r.x1, ceil: r.ceil });
    const world = axis === 'x' ? makeMeshPlans(A, B, open) : makeMeshPlans(T(A), T(B), { ...open, axis: 'z' });
    const quads = await meshOf(world), step = stepsAt(quads, axis, 64, 2.5, 5), run = along(axis);
    assert.equal(step.length, 6);
    step.map(({ q }) => spans(q)[run]).sort((p, q) => p[0] - q[0]).forEach(([a, b], k) => assert.ok(near(a, 20.5 + Q * k) && near(b, 21 + Q * k)));
    for (const { n } of step) assert.ok(n[axis === 'x' ? 0 : 2] > 0.99);
    assert.equal(stepsAt(quads, axis, 64, 2.5, 5).filter(({ q }) => spans(q)[run][0] <= 64.25 && spans(q)[run][1] >= 64.25).length, 0);
  }
  // disjoint transverse seam: A and B end 0.5 m left of a bridge that lies across z = 64, ends 4 / 5 m, bridge 2.5 m
  const A = { x0: 4, x1: 20.5, z0: 50, z1: 78, ceil: 4 }, B = { x0: 21, x1: 40, z0: 50, z1: 78, ceil: 5 };
  const open = { style: 'doorway', lv: 0, axis: 'x', c0: 20.5, c1: 21, s0: 50, s1: 78, height: 2.5, apertures: [{ lo: 62.5, hi: 65.5 }] };
  assert.equal(cutsAperture(open, false, 64, 20.75), true);
  assert.equal(cutsAperture(open, false, 64, 64.25), false);
  assert.equal(cutsAperture(open, true, 64, 64.25), false, 'x = 64 does not cut this bridge');
  const quads = await meshOf(makeMeshPlans(A, B, open));
  assert.equal(quads.filter(({ q }) => { const s = spans(q); return near(s.z[0], 64) && near(s.z[1], 64) && s.y[1] - s.y[0] > TOL && s.x[0] >= 20 && s.x[1] <= 21.5; }).length, 0, 'no step across z = 64');
  const under = horizontal(quads, 2.5, -1);
  assert.ok(near(under.reduce((s, q) => s + areaOf(q), 0), 1.5));
  assert.ok(under.some(({ q }) => spans(q).z[1] <= 64 + TOL) && under.some(({ q }) => spans(q).z[0] >= 64 - TOL), 'the underside runs on over the seam');
  // the same rooms given in the other order build the same mesh
  const key = (list) => JSON.stringify(list.map(({ i, j, q }) => [i, j, q]).sort());
  assert.equal(key(await meshOf(makeMeshPlans(B, A, open))), key(quads));
});

test('opening mesh: equal-height seam has no step', async () => {
  // an open boundary between rooms of 4 m and 4 m: floor and ceiling run on, no low header, no step
  const equal = await meshOf(makeOpeningMeshWorld({ style: 'open', equalHeights: true }).world);
  const region = (list) => list.filter(({ q }) => { const s = spans(q); return s.x[0] >= 63.5 - TOL && s.x[1] <= 64.5 + TOL && s.z[0] >= 50 - TOL && s.z[1] <= 78 + TOL; });
  const across = (list) => list.filter(({ q }) => { const s = spans(q); return near(s.x[0], 64) && near(s.x[1], 64) && s.y[1] - s.y[0] > TOL; });
  assert.equal(across(equal).length, 0, 'zero faces on x = 64');
  // the area of the layer's quads that lies over [63.5, 64.5] × [50, 78] (merged quads reach beyond it)
  const within = (list) => list.reduce((t, { q }) => { const s = spans(q); return t + Math.max(0, Math.min(s.x[1], 64.5) - Math.max(s.x[0], 63.5)) * Math.max(0, Math.min(s.z[1], 78) - Math.max(s.z[0], 50)); }, 0);
  assert.ok(near(within(horizontal(equal, 4, -1)), 28), 'ceiling over [63.5, 64.5] × [50, 78]');
  assert.ok(near(within(horizontal(equal, 0, 1)), 28), 'floor over the same');
  assert.equal(region(equal).filter(({ q }) => spans(q).y[1] - spans(q).y[0] > TOL && spans(q).y[0] < 4 - TOL && spans(q).x[0] > 63.5 + TOL && spans(q).x[1] < 64.5 - TOL).length, 0, 'no low header');
  assert.equal(region(horizontal(equal, 2.5, -1)).length, 0);
  // 4 m and 5 m: the step 4–5 at x = 64 over the whole 28 m, 56 quads from the lower cell, and still no low strip
  const unequal = await meshOf(makeOpeningMeshWorld({ style: 'open' }).world), step = stepsAt(unequal, 'x', 64, 4, 5);
  assert.equal(step.length, 56);
  assert.equal(across(unequal).length, 56, 'nothing else stands on x = 64');
  assert.ok(step.every((s) => s.i === 0), 'owned by the lower cell');
  step.map(({ q }) => spans(q).z).sort((p, q) => p[0] - q[0]).forEach(([a, b], k) => assert.ok(near(a, 50 + Q * k) && near(b, 50.5 + Q * k)));
  for (const { n } of step) assert.ok(n[0] > 0.99);
  assert.equal(horizontal(region(unequal), 2.5, -1).length + horizontal(region(unequal), 3, -1).length, 0, 'no low-bridge underside');
});

test('opening mesh: no duplicate or blocked aperture faces', async () => {
  const T = (r) => ({ x0: r.z0, x1: r.z1, z0: r.x0, z1: r.x1, ceil: r.ceil });
  const variants = [];
  for (const axis of ['x', 'z']) for (const [style, equalHeights] of [['doorway', false], ['doorway', true], ['open', false], ['open', true]]) {
    const { world, opening } = makeOpeningMeshWorld({ axis, style, equalHeights });
    variants.push({ name: `${axis} ${style}${equalHeights ? ' equal' : ''}`, world, opening, lo: style === 'open' ? 4 : 2.5, hi: equalHeights ? 4 : 5 });
  }
  // the disjoint variants: an aperture away from every cell edge, and a bridge across a transverse seam
  const off = { style: 'doorway', lv: 0, axis: 'x', c0: 63.5, c1: 64, s0: 10, s1: 40, height: 2.5, apertures: [{ lo: 20.5, hi: 23.5 }] };
  const offA = { x0: 20, x1: 63.5, z0: 10, z1: 40, ceil: 4 }, offB = { x0: 64, x1: 108, z0: 10, z1: 40, ceil: 5 };
  variants.push({ name: 'x off-edge', world: makeMeshPlans(offA, offB, off), opening: off, lo: 2.5, hi: 5 });
  variants.push({ name: 'z off-edge', world: makeMeshPlans(T(offA), T(offB), { ...off, axis: 'z' }), opening: { ...off, axis: 'z' }, lo: 2.5, hi: 5 });
  const seam = { style: 'doorway', lv: 0, axis: 'x', c0: 20.5, c1: 21, s0: 50, s1: 78, height: 2.5, apertures: [{ lo: 62.5, hi: 65.5 }] };
  variants.push({ name: 'x across the seam', world: makeMeshPlans({ x0: 4, x1: 20.5, z0: 50, z1: 78, ceil: 4 }, { x0: 21, x1: 40, z0: 50, z1: 78, ceil: 5 }, seam), opening: seam, lo: 2.5, hi: 2.5, planeIsSeam: true });
  for (const v of variants) {
    const quads = await meshOf(v.world), { axis, c0, c1, height, apertures } = v.opening, normal = axis === 'x' ? 'x' : 'z', run = along(normal);
    for (const ap of apertures) {
      // everything that lies inside this aperture's bridge rectangle
      const inside = quads.filter(({ q }) => { const s = spans(q); return s[normal][0] >= c0 - 0.5 - TOL && s[normal][1] <= c1 + 0.5 + TOL && s[run][0] >= ap.lo - TOL && s[run][1] <= ap.hi + TOL; });
      assert.equal(coplanarOverlaps(inside.map(({ q }) => q)).length, 0, `${v.name}: coplanar overlap`);
      // no face across the travel line starts below the opening height (the jamb walls beside it run along the line)
      for (const { q } of quads) {
        const s = spans(q);
        const across = near(s[normal][0], s[normal][1]) && s[normal][0] > c0 - 0.5 + TOL && s[normal][0] < c1 + 0.5 - TOL;
        const overlap = Math.min(s[run][1], ap.hi) - Math.max(s[run][0], ap.lo);
        if (across && overlap > TOL && s.y[1] - s.y[0] > TOL) assert.ok(s.y[0] >= height - TOL, `${v.name}: a face across the aperture starts at ${s.y[0]}, below ${height}`);
      }
    }
    // faces standing on a cell boundary plane at the opening: the boundary steps, one per Q2 segment and one owner each, none at equal ceilings
    const onPlane = quads.filter(({ q }) => { const s = spans(q); return s.y[1] - s.y[0] > TOL && ((near(s.x[0], 64) && near(s.x[1], 64)) || (near(s.z[0], 64) && near(s.z[1], 64))) && s.x[0] >= c0 - 0.5 - TOL - (axis === 'x' ? 0 : 99) && (axis === 'x' || apertures.some((a) => s.x[0] >= a.lo - TOL && s.x[1] <= a.hi + TOL)); });
    const steps = onPlane.filter(({ q }) => { const s = spans(q); return near(s.y[0], v.lo) && near(s.y[1], v.hi) && (axis === 'x' ? near(s.x[0], 64) : near(s.z[0], 64)); });
    if (v.hi > v.lo) {
      assert.equal(steps.length, apertures.reduce((t, a) => t + (a.hi - a.lo) / Q, 0), `${v.name}: one step quad per Q2 segment`);
      const owners = new Map();
      for (const { i, j, q } of steps) { const k = JSON.stringify(spans(q)); owners.set(k, (owners.get(k) ?? new Set()).add(`${i},${j}`)); }
      for (const [k, cells] of owners) assert.equal(cells.size, 1, `${v.name}: step ${k} has ${cells.size} owners`);
      assert.ok(steps.every(({ i, j, n }) => (axis === 'x' ? i === 0 && n[0] > 0.99 : j === 0 && n[2] > 0.99)), `${v.name}: lower cell, facing the higher room`);
    } else {
      assert.equal(steps.length, 0, `${v.name}: no step at equal ceilings`);
    }
  }
});
