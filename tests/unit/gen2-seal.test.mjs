// S2 slice 4: sealing a link. A World2 given `sealed` (a Set of connection ids) turns those links into walls; js/gen2-seal.js says which links
// can be sealed. Without `sealed` nothing changes. The walls of a diagonal's district must not move when a link is sealed
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2 } from '../../js/gen2.js';
import { sealOutcome } from '../../js/gen2-seal.js';

const SEED = 42, R = [-6, 6];
const idOf = (axis, i, j) => `v2:edge:${axis}:${i},${j}`;
const edges = function* () { for (let i = R[0]; i <= R[1]; i++) for (let j = R[0]; j <= R[1]; j++) for (const axis of ['x', 'z']) yield [i, j, axis]; };
const find = (w, mode) => { for (const [i, j, axis] of edges()) { const c = w.connectionOf(i, j, axis); if (c.mode === mode) return { i, j, axis, id: c.id }; } throw new Error('no ' + mode); };
const cellOf = ({ i, j, axis }) => (axis === 'x' ? [[i, j], [i + 1, j]] : [[i, j], [i, j + 1]]);
const rooms = (w, [i, j], pick) => w.plan(i, j).rooms.filter(pick).map((o) => JSON.stringify({ ...o, lamps: undefined }));

test('sealOutcome: corridors and connector rooms can be sealed; seams, cluster passages and links that are already walls cannot', () => {
  const base = new World2(SEED);
  assert.equal(sealOutcome(base, find(base, 'corridor').id).status, 'sealed');
  assert.equal(sealOutcome(base, find(base, 'connector-room').id).status, 'sealed');
  assert.deepEqual([find(base, 'seam'), find(base, 'district'), find(base, 'closed')].map((e) => sealOutcome(base, e.id).reason), ['seam', 'district', 'already-closed']);
  assert.equal(sealOutcome(base, 'nonsense').reason, 'unknown-link');
  assert.equal(sealOutcome(base, 'v2:edge:q:1,1').reason, 'unknown-link');
});

test('a sealed corridor is a wall: closed in connectionOf, no corridor room in the two cells, and nothing else moves', () => {
  const base = new World2(SEED), e = find(base, 'corridor'), w = new World2(SEED, { sealed: new Set([e.id]) });
  const c = w.connectionOf(e.i, e.j, e.axis);
  assert.equal(c.mode, 'closed');
  assert.equal(c.corridor, undefined);
  assert.equal(c.id, e.id);
  for (const cell of cellOf(e)) {
    const was = rooms(base, cell, (o) => o.kind === 'corridor').length, now = rooms(w, cell, (o) => o.kind === 'corridor').length;
    assert.ok(now < was, `cell ${cell}: ${now} corridor rooms, was ${was}`);
    assert.deepEqual(rooms(w, cell, (o) => o.kind === 'hall'), rooms(base, cell, (o) => o.kind === 'hall'), 'the hall is the same');
  }
  for (const [i, j, axis] of edges()) {
    if (i === e.i && j === e.j && axis === e.axis) continue;
    assert.equal(JSON.stringify(w.connectionOf(i, j, axis)), JSON.stringify(base.connectionOf(i, j, axis)), `edge ${axis} ${i},${j}`);
  }
});

test('a sealed connector room leaves no part of the room in either cell', () => {
  const base = new World2(SEED), e = find(base, 'connector-room'), w = new World2(SEED, { sealed: new Set([e.id]) });
  const space = base.connectionOf(e.i, e.j, e.axis).connectorSpaceId;
  assert.equal(w.connectionOf(e.i, e.j, e.axis).mode, 'closed');
  for (const cell of cellOf(e)) {
    assert.ok(rooms(base, cell, (o) => o.spaceId === space).length > 0, 'the base cell holds a part');
    assert.equal(rooms(w, cell, (o) => o.spaceId === space).length, 0);
  }
});

test('sealing does not move a diagonal: its district keeps the same diagonal whatever is sealed', () => {
  const base = new World2(SEED), ids = new Set();
  for (const [i, j, axis] of edges()) if (['corridor', 'connector-room'].includes(base.connectionOf(i, j, axis).mode)) ids.add(idOf(axis, i, j));
  const w = new World2(SEED, { sealed: ids });
  let diagonals = 0;
  for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
    const d = base.diagonalOf(a, b);
    if (d) diagonals++;
    assert.equal(JSON.stringify(w.diagonalOf(a, b)), JSON.stringify(d), `district ${a},${b}`);
  }
  assert.ok(diagonals > 0 && ids.size > 10, `${diagonals} diagonals, ${ids.size} sealed`);
});

test('an empty or missing sealed set changes nothing', () => {
  const a = new World2(SEED), b = new World2(SEED, { sealed: new Set() });
  assert.equal(a.sealed.size, 0);
  for (const [i, j] of [[0, 0], [1, 0], [-2, 3]]) assert.equal(JSON.stringify(a.plan(i, j)), JSON.stringify(b.plan(i, j)));
  assert.throws(() => new World2(SEED, { sealed: ['x'] }), TypeError);
});
