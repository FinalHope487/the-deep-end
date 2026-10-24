// Stage 02B-7 audit, beside gen2-connection-walk: every diagonal corridor walked both ways inside its own pieces, and round
// every closed edge from one hall to the other inside their district, with the real body (ladders of a split hall included)
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2, CELL2, primaryHall } from '../../js/gen2.js';
import { CORPUS } from '../../js/gen2-measure.js';
import { Player } from '../../js/player.js';
import { reachSet, reaches } from './reach.mjs';

const inSample = new Set(CORPUS.cells.map(([i, j]) => `${i},${j}`));
const districts = [...new Set(CORPUS.cells.map(([i, j]) => `${Math.floor(i / 2)},${Math.floor(j / 2)}`))].map((k) => k.split(',').map(Number));
const inside = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

test('every diagonal corridor of the corpus is walkable hall to hall in both directions, along its own pieces', (t) => {
  const failures = [];
  let walked = 0;
  for (const seed of CORPUS.seeds) {
    const w = new World2(seed);
    for (const [a, b] of districts) {
      const d = w.diagonalOf(a, b);
      if (!d || !d.cells.every((c) => inSample.has(`${c.i},${c.j}`))) continue;
      walked++;
      const box = [Math.min(...d.rects.map((o) => o.x0)), Math.min(...d.rects.map((o) => o.z0)), Math.max(...d.rects.map((o) => o.x1)), Math.max(...d.rects.map((o) => o.z1))];
      const keep = (x, z) => d.rects.some((o) => inside(o, x, z));
      const [P, Q] = d.cells.map((c) => primaryHall(w.plan(c.i, c.j))), first = d.rects[0], last = d.rects[2];
      const cut = (o, h) => ({ x0: Math.max(o.x0, h.x0), x1: Math.min(o.x1, h.x1), z0: Math.max(o.z0, h.z0), z1: Math.min(o.z1, h.z1) });
      for (const [direction, [x, z], target] of [['P->Q', d.line[0], cut(last, Q)], ['Q->P', d.line[3], cut(first, P)]]) {
        const tag = `seed=${seed} district=${a},${b} id=${d.id} orientation=${d.orientation} direction=${direction}`;
        if (!new Player().canStand(w, x, z, 0)) { failures.push(`${tag}: cannot stand at the start ${x},${z}`); continue; }
        if (!reaches(reachSet(w, ...box, [x, z, 0], keep), target)) failures.push(`${tag}: the other hall is out of reach`);
      }
    }
  }
  t.diagnostic(`diagonals walked=${walked}; failures=${failures.length}`);
  assert.ok(walked >= 4, `only ${walked} diagonals`);
  assert.equal(failures.length, 0, failures.join('\n'));
});

test('round every closed edge of the corpus a body walks from one hall to the other, inside their district', (t) => {
  const failures = [];
  let walked = 0;
  for (const seed of CORPUS.seeds) {
    const w = new World2(seed);
    for (const [i, j] of CORPUS.cells) for (const axis of ['x', 'z']) {
      const [ni, nj] = axis === 'x' ? [i + 1, j] : [i, j + 1];
      if (!inSample.has(`${ni},${nj}`) || w.connectionOf(i, j, axis).mode !== 'closed') continue;
      walked++;
      const a = Math.floor(i / 2), b = Math.floor(j / 2), tag = `seed=${seed} i=${i} j=${j} axis=${axis} id=v2:edge:${axis}:${i},${j}`;
      const hA = primaryHall(w.plan(i, j)), hB = primaryHall(w.plan(ni, nj));
      const box = [2 * a * CELL2 + 0.25, 2 * b * CELL2 + 0.25, (2 * a + 2) * CELL2 - 0.25, (2 * b + 2) * CELL2 - 0.25];
      // a dry spot in hall A on the walk's lattice
      let start = null;
      for (let x = Math.ceil(hA.x0) + 1.25; x < hA.x1 - 1 && !start; x += 0.5) for (let z = Math.ceil(hA.z0) + 1.25; z < hA.z1 - 1 && !start; z += 0.5) {
        if (new Player().canStand(w, x, z, 0) && w.surfaceAt(x, z, 0).h === 0) start = [x, z, 0];
      }
      if (!start) { failures.push(`${tag}: no dry floor in the hall`); continue; }
      if (!reaches(reachSet(w, ...box, start), { x0: hB.x0 + 1, x1: hB.x1 - 1, z0: hB.z0 + 1, z1: hB.z1 - 1 })) failures.push(`${tag}: the other hall is out of reach the long way`);
    }
  }
  t.diagnostic(`closed edges walked round=${walked}; failures=${failures.length}`);
  assert.ok(walked >= 64, `only ${walked} closed edges`);
  assert.equal(failures.length, 0, failures.join('\n'));
});
