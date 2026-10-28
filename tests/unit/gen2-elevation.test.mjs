// S2 slice 3: rooms with their own floor height (js/gen2.js candidates, headBlockedAt; js/mesh2.js; js/player.js canStand). Without the new fields
// nothing changes: a room has nominalLevel = lv and its floor at Y[lv]
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2, BODY_H2, roomFloor, roomKey, cellRaster } from '../../js/gen2.js';
import { Player } from '../../js/player.js';

const room = (id, lv, x0, x1, z0, z1, extra = {}) => ({ id, lv, x0, x1, z0, z1, ceil: 4, kind: 'hall', lamps: [], ...extra });
const planOf = (rooms) => ({ i: 0, j: 0, ox: 0, oz: 0, rooms, pools: [], flights: [], voids: [], columns: [], ladders: [], windows: [] });
const worldOf = (rooms) => { const w = new World2(1), plan = planOf(rooms); w.planAt = () => plan; w.plan = () => plan; return w; };
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
  const low = worldOf([room(0, 0, 0, 20, 0, 20, { elevation: 1, clearHeight: 1.5 })]);
  assert.equal(low.headBlockedAt(10, 10, 1), true, 'a room with a ceiling lower than the body');
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
