// T3 cluster rooms: the pure production builder (templates, reflections, roles, ceilings, the 46-draw stream, reference passages and the
// immutable geometry gates). Integration, protection and production-share tests join this file in later commits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2 } from '../../js/gen2.js';
import { buildClusterDistrict, fixtureCluster, validateDistrictPlan } from '../../js/gen2-district.js';
import { hash2, mulberry32 } from '../../js/rng.js';

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
    assert.equal(plan.links.length, plan.rooms.length - 1, tag);
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

test('cluster rooms: reference passage tree', () => {
  for (const c of corpus) {
    const plan = planOf(c), exp = oracle(c.seed, c.a, c.b, c.Y), by = roomsBySlot(plan, exp), tag = `${c.seed}:${c.a},${c.b}`;
    const R = plan.rooms.length, room = (id) => plan.rooms.find((o) => o.spaceId === id), OX = 128 * c.a, OZ = 128 * c.b;
    assert.equal(plan.links.length, R - 1, tag);
    const local = [];
    for (const e of exp) for (const slot of SLOTS) if (e.slots[slot]) local.push([by[e.n].anchor, by[e.n][slot], e, slot]);
    assert.equal(local.length, R - 4, tag);
    local.forEach(([anchor, sat, e, slot], k) => {
      const l = plan.links[k];
      assert.equal(l.from, anchor.spaceId, tag);
      assert.equal(l.to, sat.spaceId, tag);
      assert.equal(l.kind, 'passage');
      assert.equal(l.rects.length, 1);
      const box = { E: [47.5, 49, 30.5, 33.5], S: [30.5, 33.5, 47.5, 49], T: [47.5, 49, 44.5, 47.5] }[slot];
      assert.deepEqual(l.rects[0], place(box, e.flips, c.a, c.b), `${tag}: local ${slot}`);
    });
    // the cross-cell passages, from the bounds of every rectangle of their endpoints
    const B = (n, s) => bounds(by[n][s].rects), NW_E = B(0, 'E'), NE_E = B(1, 'E'), NW_S = B(0, 'S'), SW_S = B(2, 'S'), NE_S = B(1, 'S'), SE_S = B(3, 'S');
    const cross = plan.links.slice(R - 4);
    assert.equal(cross.length, 3, tag);
    assert.deepEqual(cross.map((l) => [l.from, l.to]), [[by[0].E, by[1].E], [by[0].S, by[2].S], [by[1].S, by[3].S]].map(([p, s]) => [p.spaceId, s.spaceId]), `${tag}: AB, AC, BD`);
    assert.deepEqual(cross[0].rects[0], { x0: NW_E.x1 - 0.5, x1: NE_E.x0 + 0.5, z0: OZ + 30.5, z1: OZ + 33.5 }, tag);
    assert.deepEqual(cross[1].rects[0], { x0: OX + 30.5, x1: OX + 33.5, z0: NW_S.z1 - 0.5, z1: SW_S.z0 + 0.5 }, tag);
    assert.deepEqual(cross[2].rects[0], { x0: OX + 94.5, x1: OX + 97.5, z0: NE_S.z1 - 0.5, z1: SE_S.z0 + 0.5 }, tag);
    const gaps = [NE_E.x0 - NW_E.x1, SW_S.z0 - NW_S.z1, SE_S.z0 - NE_S.z1];
    const sizes = [['E', 0, 1], ['S', 0, 2], ['S', 1, 3]].map(([s, p, t]) => [exp[p].slots[s].role, exp[t].slots[s].role]);
    sizes.forEach(([p, t], k) => assert.equal(gaps[k], p === 'small' && t === 'small' ? 5 : p === 'medium' && t === 'medium' ? 1 : 3, `${tag}: gap ${k}`));
    plan.links.forEach((l, k) => {
      const r = l.rects[0], dx = r.x1 - r.x0, dz = r.z1 - r.z0;
      assert.ok(dx === 3 || dz === 3, `${tag}: link ${k} is 3 m wide`);
      const len = dx === 3 ? dz : dx;   // no passage is 3 m long: local ones are 1.5 m, cross-cell ones 2, 4 or 6 m
      assert.ok(q2(r.x0) && q2(r.x1) && q2(r.z0) && q2(r.z1));
      for (const end of [room(l.from), room(l.to)]) {
        assert.ok(sum(end.rects.map((s) => overlapArea(r, s))) >= 0.5 * 3, `${tag}: link ${k} reaches ${end.spaceId}`);
      }
      for (const o of plan.rooms) if (o.spaceId !== l.from && o.spaceId !== l.to) assert.equal(sum(o.rects.map((s) => overlapArea(r, s))), 0, tag);
      plan.links.forEach((m, n) => { if (n > k) assert.equal(overlapArea(r, m.rects[0]), 0, tag); });
      if (k < R - 4) assert.equal(len, 1.5, `${tag}: a local passage spans a 0.5 m wall and 0.5 m of each room`);
      else { assert.ok(len - 1 >= 1 && len - 1 <= 5, tag); assert.equal(len - 1, gaps[k - (R - 4)]); }
    });
    // one connected tree, no isolated room
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
