// Stage 02B-7 audit, beside gen2-connection-walk: every diagonal corridor walked both ways inside its own pieces, and round
// every closed edge from one hall to the other inside their district, with the real body (ladders of a split hall included)
import test from 'node:test';
import assert from 'node:assert/strict';
import { slow } from './slow.mjs';
import { World2, CELL2, primaryHall } from '../../js/gen2.js';
import { CORPUS, measureWalks } from '../../js/gen2-measure.js';
import { Player } from '../../js/player.js';
import { reachSet, reaches, walkLength } from './reach.mjs';

const inSample = new Set(CORPUS.cells.map(([i, j]) => `${i},${j}`));
const districts = [...new Set(CORPUS.cells.map(([i, j]) => `${Math.floor(i / 2)},${Math.floor(j / 2)}`))].map((k) => k.split(',').map(Number));
const inside = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

test('every diagonal corridor of the corpus is walkable hall to hall in both directions, along its own pieces', (t) => {
  const failures = [];
  let walked = 0;
  for (const seed of CORPUS.seeds) {
    const w = new World2(seed, { clusterShare: 0 });
    for (const [a, b] of districts) {
      const d = w.diagonalOf(a, b);
      if (!d || !d.cells.every((c) => inSample.has(`${c.i},${c.j}`))) continue;
      walked++;
      const parts = d.middleRoom ? [...d.rects, d.middleRoom] : d.rects;   // the walk may pass through the connector room in the middle
      const box = [Math.min(...parts.map((o) => o.x0)), Math.min(...parts.map((o) => o.z0)), Math.max(...parts.map((o) => o.x1)), Math.max(...parts.map((o) => o.z1))];
      const keep = (x, z) => parts.some((o) => inside(o, x, z));
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

test('round every closed edge of the corpus a body walks from one hall to the other, inside their district', slow, (t) => {
  const failures = [];
  let walked = 0;
  for (const seed of CORPUS.seeds) {
    const w = new World2(seed, { clusterShare: 0 });
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

// the body-walk helper itself, on a world of two floors 4 m apart that only a ladder joins (the real Player decides every move)
function ladderWorld(withLadder = true) {
  const floors = [
    { x0: -0.5, x1: 0.5, z0: -0.5, z1: 0.5, h: 0 },
    { x0: 1, x1: 2.5, z0: -0.5, z1: 0.5, h: 4 },
  ];
  const ladder = { x: 0.75, z: 0, nx: -1, nz: 0, h0: 0, h1: 4 };
  const floorAt = (x, z, h) => floors.find((f) => x >= f.x0 && x < f.x1 && z >= f.z0 && z < f.z1 && Math.abs(f.h - h) <= 0.8);
  return {
    bodyR: 0.4,
    blockedAt(x, z, h) { return !floorAt(x, z, h); },
    surfaceAt(x, z, h) { const f = floorAt(x, z, h); return f ? { h: f.h, wl: NaN } : null; },
    railHit() { return false; },
    planAt() { return { ladders: withLadder ? [ladder] : [] }; },
  };
}

test('walkLength: start at target returns zero', () => {
  const d = walkLength(ladderWorld(), -0.25, -0.25, 2.25, 0.25, [0, 0, 0], (x, z, h) => x === 0 && z === 0 && h === 0);
  assert.equal(d, 0);
});

test('walkLength: disconnected floors are unreachable without ladder', () => {
  const d = walkLength(ladderWorld(false), -0.25, -0.25, 2.25, 0.25, [0, 0, 0], (x, z, h) => x === 1.5 && z === 0 && h === 4);
  assert.equal(d, Infinity);
});

test('walkLength: ladder cost uses 3D distance in both directions', () => {
  const w = ladderWorld(true), bounds = [-0.25, -0.25, 2.25, 0.25];
  const up = walkLength(w, ...bounds, [0, 0, 0], (x, z, h) => x === 1.5 && z === 0 && h === 4);
  const down = walkLength(w, ...bounds, [1.5, 0, 4], (x, z, h) => x === 0 && z === 0 && h === 0);
  for (const d of [up, down]) {
    assert.ok(Number.isFinite(d), `${d}`);
    assert.ok(Math.abs(d - Math.hypot(1.5, 4)) <= 1e-9, `${d}`);
  }
});

test('walkLength: ladder landing stays inside search bounds', () => {
  const d = walkLength(ladderWorld(true), -0.25, -0.25, 0.25, 0.25, [0, 0, 0], (x, z, h) => x === 1.5 && z === 0 && h === 4);
  assert.equal(d, Infinity);
});

// measureWalks estimates on the graph of links. Thirty distinct neighbouring pairs of the corpus: the ten longest closed ones, then
// the ten longest of what is left on each axis (by graph walk, then seed, then edge id). A body's shortest height-aware walk (the
// floors it can step between, ladders included; from the dry spot nearest one hall's centre to the one nearest the other's) may
// not be longer than a quarter more than the estimate. Nothing is asserted the other way: the graph may overestimate
test('walks: thirty distinct longest pairs satisfy the one-sided body bound', slow, (t) => {
  const all = [];
  for (const seed of CORPUS.seeds) for (const p of measureWalks(new World2(seed, { clusterShare: 0 }), CORPUS.cells)) all.push({ seed, id: `v2:edge:${p.axis}:${p.i},${p.j}`, ...p });
  const byWalk = (a, b) => (b.walk > a.walk) - (b.walk < a.walk) || a.seed - b.seed || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const key = (p) => `${p.seed}|${p.id}`;
  const take = (list, what) => {
    const top = list.sort(byWalk).slice(0, 10);
    assert.ok(top.length === 10, `fewer than 10 ${what}`);
    return top;
  };
  const closed = take(all.filter((p) => p.closed), 'closed corpus pairs'), used = new Set(closed.map(key));
  const xs = take(all.filter((p) => p.axis === 'x' && !used.has(key(p))), 'remaining x-axis corpus pairs');
  const zs = take(all.filter((p) => p.axis === 'z' && !used.has(key(p))), 'remaining z-axis corpus pairs');
  const pick = [...closed, ...xs, ...zs];
  assert.equal(new Set(pick.map(key)).size, 30, 'thirty unique pairs');
  assert.ok(pick.some((p) => p.i < 0 || p.j < 0), 'no negative cell among the longest');
  // the dry spot of a hall on the world's own 0.25 + 0.5k lattice, strictly inside it, nearest its centre (then smaller x, then z)
  const near = (w, h) => {
    const cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2, pl = new Player(), spots = [];
    for (let x = 0.25 + 0.5 * Math.floor((h.x0 - 0.25) / 0.5); x < h.x1; x += 0.5) for (let z = 0.25 + 0.5 * Math.floor((h.z0 - 0.25) / 0.5); z < h.z1; z += 0.5) {
      if (x > h.x0 && z > h.z0) spots.push([x, z, (x - cx) ** 2 + (z - cz) ** 2]);
    }
    for (const [x, z] of spots.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1])) {
      const surface = pl.canStand(w, x, z, 0) ? w.surfaceAt(x, z, 0) : null;
      if (surface !== null && surface.h === 0 && Number.isNaN(surface.wl)) return [x, z];
    }
    assert.fail(`no dry floor in the hall ${JSON.stringify(h)}`);
  };
  const report = [];
  for (const p of pick) {
    const w = new World2(p.seed, { clusterShare: 0 }), [ni, nj] = p.axis === 'x' ? [p.i + 1, p.j] : [p.i, p.j + 1], tag = `seed=${p.seed} ${p.id}`;
    const [s, e] = [near(w, w.hallOf(p.i, p.j)), near(w, w.hallOf(ni, nj))];
    const dI = [p.i, ni].map((v) => Math.floor(v / 2)), dJ = [p.j, nj].map((v) => Math.floor(v / 2));
    const box = [Math.max(-255.75, 2 * (Math.min(...dI) - 1) * CELL2 + 0.25), Math.max(-255.75, 2 * (Math.min(...dJ) - 1) * CELL2 + 0.25),
      Math.min(255.75, 2 * (Math.max(...dI) + 2) * CELL2 - 0.25), Math.min(255.75, 2 * (Math.max(...dJ) + 2) * CELL2 - 0.25)];
    const done = (x, z, h) => x === e[0] && z === e[1] && Math.abs(h) < 0.01, limit = p.walk * 1.25;
    let body = walkLength(w, ...box, [s[0], s[1], 0], done), retried = false;
    if (!Number.isFinite(body) || body > limit) { body = walkLength(w, -255.75, -255.75, 255.75, 255.75, [s[0], s[1], 0], done); retried = true; }
    report.push(`${tag}${retried ? ' (retried)' : ''}: ${p.walk} → ${body}`);
    assert.ok(Number.isFinite(p.walk), `${tag}: no estimate`);
    assert.ok(Number.isFinite(body), `${tag}: a body cannot walk it`);
    assert.ok(body <= limit, `${tag}: estimated ${p.walk} m, a body walks ${body} m`);
  }
  t.diagnostic(report.join(' · '));
});
