// S2 slice 3: rooms with their own floor height (js/gen2.js candidates, headBlockedAt; js/mesh2.js; js/player.js canStand). Without the new fields
// nothing changes: a room has nominalLevel = lv and its floor at Y[lv]
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2, BODY_H2, roomFloor, roomKey, cellRaster } from '../../js/gen2.js';
import { Player } from '../../js/player.js';

const room = (id, lv, x0, x1, z0, z1, extra = {}) => ({ id, lv, x0, x1, z0, z1, ceil: 4, kind: 'hall', lamps: [], ...extra });
const planOf = (rooms, extra = {}) => ({ i: 0, j: 0, ox: 0, oz: 0, rooms, pools: [], flights: [], voids: [], columns: [], ladders: [], windows: [], ...extra });
const worldOf = (rooms, extra) => { const w = new World2(1), plan = planOf(rooms, extra); w.planAt = () => plan; w.plan = () => plan; return w; };
const heights = (w, x, z) => w.candidates(x, z).filter((c) => !c.wall).map((c) => c.h).sort((a, b) => a - b);

test('rooms without the new fields behave as before: one floor per level, at Y[lv]', () => {
  const w = worldOf([room(0, 0, 0, 20, 0, 20), room(1, 0, 5, 15, 5, 15), room(2, 1, 0, 20, 0, 20)]);
  assert.deepEqual(heights(w, 10, 10), [w.Y[0], w.Y[1]]);   // the second 1F room is hidden by the first, as it was
  assert.equal(roomFloor(w, w.plan().rooms[0]), w.Y[0]);
  assert.equal(roomKey(w.plan().rooms[0]), 0);
});

test('a room with an elevation is a floor of its own at that height, beside the floor of its level', () => {
  const w = worldOf([room(0, 0, 0, 20, 0, 20), room(1, 0, 5, 15, 5, 15, { elevation: 3.2, nominalLevel: 0, clearHeight: 3 })]);
  assert.deepEqual(heights(w, 10, 10), [w.Y[0], 3.2]);
  assert.deepEqual(heights(w, 2, 2), [w.Y[0]]);
  assert.equal(roomFloor(w, w.plan().rooms[1]), 3.2);
  assert.notEqual(roomKey(w.plan().rooms[1]), roomKey(w.plan().rooms[0]));
  const two = worldOf([room(0, 0, 0, 20, 0, 20, { elevation: 1 }), room(1, 0, 0, 20, 0, 20, { elevation: 1 })]);
  assert.deepEqual(heights(two, 5, 5), [1], 'two rooms at one elevation are one floor');
});

test('headBlockedAt: a body under a slab lower than its height is blocked; one under a high slab or without slabs is not', () => {
  const w = worldOf([room(0, 0, 0, 20, 0, 20), room(1, 0, 5, 15, 5, 15, { elevation: 1.2, clearHeight: 3 }), room(2, 0, 16, 19, 16, 19, { elevation: 3.2, clearHeight: 3 })]);
  assert.equal(w.headBlockedAt(10, 10, w.Y[0]), true, 'a slab 1.2 m up');
  assert.equal(w.headBlockedAt(17, 17, w.Y[0]), false, 'a slab 3.2 m up leaves BODY_H2');
  assert.equal(w.headBlockedAt(2, 2, w.Y[0]), false);
  assert.equal(w.headBlockedAt(10, 10, 1.2), false, 'on the slab itself');
  assert.ok(BODY_H2 > 1.6 && BODY_H2 < 3);
  const low = worldOf([room(0, 0, 0, 20, 0, 20, { elevation: 1, ceil: 1.5 })]);
  assert.equal(low.headBlockedAt(10, 10, 1), true, 'a room whose drawn ceiling is lower than the body: clearHeight is not a second source');
  assert.equal(worldOf([room(0, 0, 0, 20, 0, 20)]).headBlockedAt(10, 10, 0), false, 'no elevation data, no head test');
});

test('Player.canStand asks the world for head room when it has the hook, and does not when it has none', () => {
  const calls = [];
  const base = { bodyR: 0.4, blockedAt: () => false, surfaceAt: () => ({ h: 0, wl: NaN }), railHit: () => false };
  const p = new Player();
  assert.equal(p.canStand(base, 1, 1, 0), true);
  assert.equal(p.canStand({ ...base, headBlockedAt: (...a) => { calls.push(a); return false; } }, 1, 1, 0), true);
  assert.equal(calls.length > 0, true);
  assert.equal(p.canStand({ ...base, headBlockedAt: () => true }, 1, 1, 0), false);
});

test('cellRaster takes the rooms of one floor height: the ceiling and the floor agree with the room', () => {
  const w = worldOf([room(0, 0, 0, 20, 0, 20), room(1, 0, 4, 12, 4, 12, { elevation: 3.2, clearHeight: 3, ceil: 3 })]);
  const flat = cellRaster(w, 0, 0, 0), up = cellRaster(w, 0, 0, 0, 3.2), n = flat.n, k = (x, z) => Math.floor(z / 0.5) * n + Math.floor(x / 0.5);
  assert.equal(flat.inside[k(8, 8)], 1);
  assert.equal(flat.room[k(8, 8)], 0, 'the default raster keeps the rooms without an elevation');
  assert.equal(up.inside[k(8, 8)], 1);
  assert.equal(up.room[k(8, 8)], 1);
  assert.equal(up.inside[k(2, 2)], 0, 'the level-1F room is not in the elevated raster');
  assert.equal(up.elevation, 3.2);
});

test('buildCell2 draws an elevated room at its own height: floor at the elevation, ceiling one room height above it', async () => {
  const { loadMesher } = await import('./mesh-helper.mjs');
  await loadMesher();
  const { buildCell2 } = await import('../../js/mesh2.js');
  const build = (rooms) => {
    const it = buildCell2(worldOf(rooms), 0, 0);
    let r = it.next();
    while (!r.done) r = it.next();
    const pos = r.value.static.attributes.position.array, ys = new Set();
    for (let k = 1; k < pos.length; k += 3) ys.add(Math.round(pos[k] * 1000) / 1000);
    return ys;
  };
  const base = [room(0, 0, 0, 20, 0, 20)], Y0 = new World2(1).Y[0];
  const flat = build(base), up = build([...base, room(1, 0, 4, 12, 4, 12, { elevation: 3.2, clearHeight: 3, ceil: 3 })]);
  assert.equal(flat.has(3.2), false);
  assert.equal(up.has(3.2), true, 'the slab floor');
  assert.equal(up.has(6.2), true, 'the slab ceiling: elevation + ceil');
  assert.equal(up.has(Y0), true, 'the room of the level keeps its floor');
});

// review S3-F1 (2026-10-28): head room is tested at the height the body lands on, not the height it leaves
test('Player.canStand: a 0.5 m step up or down is walkable; a body under a real slab is not', () => {
  const w = worldOf([room(0, 0, 0, 10, 0, 20), room(1, 0, 10, 20, 0, 20, { elevation: 0.5, clearHeight: 3 })]), p = new Player();
  assert.equal(p.canStand(w, 14, 10, 0), true, 'up onto the 0.5 m room');
  assert.equal(p.canStand(w, 5, 10, 0.5), true, 'down onto the level room');
  const slab = worldOf([room(0, 0, 0, 20, 0, 20), room(1, 0, 5, 15, 5, 15, { elevation: 1.2, clearHeight: 3 })]);
  assert.equal(p.canStand(slab, 10, 10, 0), false, 'under a 1.2 m slab');
  assert.equal(p.canStand(slab, 2, 2, 0), true);
});

// review S3-F2: pools, flights, voids and columns belong to the floor of their level; a room with an elevation is not under them
test('an elevated room is not cut by the pool of the level below, and the pool is drawn once', async () => {
  const { loadMesher } = await import('./mesh-helper.mjs');
  await loadMesher();
  const { buildCell2 } = await import('../../js/mesh2.js');
  const pool = { shape: { type: 'rect', cx: 10, cz: 10, hw: 3, hd: 3 }, water: -0.2, axis: 'x', flip: false, d0: 0.5, d1: 0.5, room: 0, lv: 0 };
  const base = [room(0, 0, 0, 20, 0, 20)], up = room(1, 0, 4, 16, 4, 16, { elevation: 3.2, clearHeight: 3, ceil: 3 });
  const w = worldOf([...base, up], { pools: [pool] });
  const R = cellRaster(w, 0, 0, 0, 3.2), k = (x, z) => Math.floor(z / 0.5) * R.n + Math.floor(x / 0.5);
  assert.equal(R.pool[k(10, 10)], 0, 'no pool mask on the elevated floor');
  assert.equal(R.inside[k(10, 10)], 1);
  assert.equal(cellRaster(w, 0, 0, 0).pool[k(10, 10)], 1, 'the level floor keeps it');
  const hit = w.candidates(10, 10).find((c) => c.h === 3.2);
  assert.ok(hit && Number.isNaN(hit.wl), 'the elevated floor is dry');
  const water = (ws) => { const it = buildCell2(ws, 0, 0); let r = it.next(); while (!r.done) r = it.next(); return r.value.water.attributes.position.count; };
  assert.equal(water(w), water(worldOf(base, { pools: [pool] })), 'one pool, one water surface');
});

// review S3-F3: the wall at a cell edge looks for a room of the same floor height next door
test('roomAt takes the floor height: a neighbour at another height does not open the wall', async () => {
  const w = worldOf([room(0, 0, 0, 20, 0, 20), room(1, 0, 20, 40, 0, 20, { elevation: 3.2, clearHeight: 3 })]);
  assert.equal(w.roomAt(0, 25, 10)?.id, undefined, 'default floor: no room there');
  assert.equal(w.roomAt(0, 25, 10, 3.2)?.id, 1);
  assert.equal(w.roomAt(0, 10, 10)?.id, 0);
  assert.equal(w.roomAt(0, 10, 10, 3.2), null);
  const { loadMesher } = await import('./mesh-helper.mjs');
  await loadMesher();
  const { buildCell2 } = await import('../../js/mesh2.js');
  const it = buildCell2(w, 0, 0);
  let r = it.next();
  while (!r.done) r = it.next();
  const pos = r.value.static.attributes.position.array, idx = r.value.static.index.array;
  let wallAt20 = 0;
  for (let t = 0; t < idx.length; t += 3) if ([0, 1, 2].every((q) => pos[idx[t + q] * 3] === 20) && [0, 1, 2].some((q) => pos[idx[t + q] * 3 + 1] > 0)) wallAt20++;
  assert.ok(wallAt20 > 0, 'the level room has a wall where the elevated room starts');
});

// review S3-F3-R: two cells (CELL2 = 64), so the wall at x = 64 is decided by the neighbour cell's plan
const CELL = 64;
const twoCells = (left, right, rightExtra = {}) => {
  const w = new World2(1), plans = [planOf(left, { i: 0, ox: 0 }), planOf(right, { i: 1, ox: CELL, ...rightExtra })], none = planOf([], { i: 9 });
  w.planAt = (x) => plans[Math.floor(x / CELL)] ?? none;
  w.plan = (i) => plans[i] ?? none;
  return w;
};
const wallsAt = async (w, x, zr = [-Infinity, Infinity]) => {
  const { loadMesher } = await import('./mesh-helper.mjs');
  await loadMesher();
  const { buildCell2 } = await import('../../js/mesh2.js');
  const it = buildCell2(w, 0, 0);
  let r = it.next();
  while (!r.done) r = it.next();
  const pos = r.value.static.attributes.position.array, idx = r.value.static.index.array;
  let n = 0;
  for (let t = 0; t < idx.length; t += 3) if ([0, 1, 2].every((q) => pos[idx[t + q] * 3] === x && pos[idx[t + q] * 3 + 2] >= zr[0] && pos[idx[t + q] * 3 + 2] <= zr[1])) n++;
  return n;
};
test('a cell-edge wall: kept next to a room at another floor height, and next to a flight of the level floor; open next to a room of the same height', async () => {
  const level = [room(0, 0, 0, CELL, 0, CELL)], high = [room(0, 0, 0, CELL, 0, CELL, { elevation: 3.2, clearHeight: 3 })];
  const nextHigh = [room(1, 0, CELL, CELL + 30, 0, CELL, { elevation: 3.2, clearHeight: 3 })], nextLevel = [room(1, 0, CELL, CELL + 30, 0, CELL)];
  assert.ok(await wallsAt(twoCells(level, nextHigh), CELL) > 0, 'level room, high neighbour');
  assert.ok(await wallsAt(twoCells(high, nextLevel), CELL) > 0, 'high room, level neighbour');
  assert.equal(await wallsAt(twoCells(level, nextLevel), CELL), 0, 'same height: open');
  assert.equal(await wallsAt(twoCells(high, nextHigh), CELL), 0, 'same elevation: open');
  const flight = { x0: CELL, x1: CELL + 13, z0: 10, z1: 14, axis: 'x', up: 1, lo: 0, hi: 1, y0: 0, y1: 6, hallEntry: { x0: CELL, x1: CELL + 2, z0: 10, z1: 14 }, room: 1 };
  assert.ok(await wallsAt(twoCells(high, nextLevel, { flights: [flight] }), CELL, [10, 14]) > 0, 'a flight of the level floor does not open the wall of a high floor');
});

// review S3-F4: where two floors overlap, the landing is the nearest floor the body has head room on, and step() and settle() see the same one
test('overlapping floors: a 0.5 m platform over the level floor can be stepped onto and off; a platform out of step height or a low slab still stops the body', () => {
  const p = new Player(), over = (elevation) => worldOf([room(0, 0, 0, 20, 0, 20), room(1, 0, 10, 20, 0, 20, { elevation, ceil: 3 })]);
  const w = over(0.5);
  assert.equal(p.canStand(w, 9, 10, 0), true, 'level floor beside the platform');
  assert.equal(p.canStand(w, 10.6, 10, 0), true, 'up onto the 0.5 m platform that overlaps the level floor');
  assert.equal(w.surfaceAt(10.6, 10, 0).h, 0.5, 'the landing step() and settle() find');
  assert.equal(p.canStand(w, 9, 10, 0.5), true, 'off the platform, back to the level floor');
  assert.equal(w.surfaceAt(9, 10, 0.5).h, 0);
  assert.equal(p.canStand(over(0.9), 10.6, 10, 0), false, 'a 0.9 m platform is above STEP2, and the level floor is under its slab');
  assert.equal(p.canStand(over(1.2), 10.6, 10, 0), false, 'a 1.2 m slab over the head');
  assert.equal(heights(over(0.5), 10.6, 10).length, 2);
  const flat = worldOf([room(0, 0, 0, 20, 0, 20), room(1, 1, 0, 20, 0, 20)]);
  assert.equal(flat.surfaceAt(5, 5, 0).h, flat.Y[0], 'a world without elevations picks the nearest floor as before');
  assert.equal(flat.surfaceAt(5, 5, flat.Y[1]).h, flat.Y[1]);
});
