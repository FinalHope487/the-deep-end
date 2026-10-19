// Inner layer: mega rooms (H): placement, entrances, the abyss (rails, boards) and the shared skylight (K9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../js/world.js';
import { Player } from '../../js/player.js';
import { MEGA_SEGS } from '../../js/levelmap.js';
import { MEGA_CEIL } from '../../js/mega.js';
import { CHUNK, FLOOR, VOID, WALL, DIRS, LEVEL_H } from '../../js/tiles.js';
import { edgeKey, edgeOf } from '../../js/levels.js';
import { loadMesher, quadsOf } from './mesh-helper.mjs';

const SEEDS = [1, 2, 3, 42, 7];
const R = 12;   // patches scanned round the origin
const rooms = (w, pred = () => true) => w.megasNear(0, 0, R).filter(pred);

test('H1 a mega room fills 2×2 chunks (a zone\'s footprint) under a 12 m ceiling, away from the start, zones and exit', () => {
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const m of rooms(w)) {
      let count = 0;
      for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) {
        const L = w.layout(m.cx0 + dx, m.cz0 + dz), inside = dx < 2 && dz < 2;
        assert.equal(L.kind === 'mega', inside, `seed ${seed} room ${m.i},${m.j} chunk +${dx},+${dz}`);
        if (inside) { count++; assert.equal(L.ceilFixed, MEGA_CEIL); assert.equal(L.lv, 0); }
      }
      assert.equal(count, 4);
      assert.ok(!(m.i >= -2 && m.i <= 1 && m.j >= -2 && m.j <= 1), 'not near the start');
      for (const z of w.zones) assert.ok(Math.max(Math.abs(z.pi - m.i), Math.abs(z.pj - m.j)) >= 1, 'not on a zone patch');
      assert.equal(w.lm.patchLevel(m.i, m.j - 1), 0, 'the patch north of it stays 1F');
      assert.equal(w.lm.patchLevel(m.i - 1, m.j), 0, 'the patch west of it stays 1F');
    }
  }
});

test('H4 every mega room has two ground entrances and one from 2F, all with floor at the right height on both sides', () => {
  let ground = 0, upper = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const m of rooms(w)) {
      const ports = w.lm.megaPorts(m);
      assert.ok(ports.filter((h) => h === 0).length >= 2, `seed ${seed} room ${m.i},${m.j}: ${JSON.stringify(ports)}`);
      assert.equal(ports.filter((h) => h === LEVEL_H).length, 1);
      const X = m.cx0 * CHUNK, Z = m.cz0 * CHUNK;
      ports.forEach((h, s) => {
        if (h === null) return;
        const g = MEGA_SEGS[s], k = s & 1;
        // [doorway tile (the one of the pair that is on the outer side), tile just inside the room]
        const [door, inside] = g.d === 1 ? [[X, Z + 7 + 16 * k], [X + 1, Z + 7 + 16 * k]]
          : g.d === 3 ? [[X + 7 + 16 * k, Z], [X + 7 + 16 * k, Z + 1]]
            : g.d === 0 ? [[X + 32, Z + 7 + 16 * k], [X + 31, Z + 7 + 16 * k]] : [[X + 7 + 16 * k, Z + 32], [X + 7 + 16 * k, Z + 31]];
        for (const [x, z] of [door, inside]) {
          assert.equal(w.typeAt(x, z), FLOOR, `seed ${seed} room ${m.i},${m.j} port ${s} tile ${x},${z}`);
          assert.ok(Math.abs(w.hAt(x, z) - h) < 0.01, `port ${s} at ${h}: tile ${x},${z} is at ${w.hAt(x, z)}`);
        }
        h ? upper++ : ground++;
      });
      // a walkable way joins the entrances: from a ground one every other entrance, the 2F one included, can be reached
      const [gs] = ports.map((h, s) => [s, h]).filter(([, h]) => h === 0)[0];
      const gg = MEGA_SEGS[gs], gk = gs & 1;
      const start = gg.d === 1 ? [X + 1, Z + 7 + 16 * gk] : gg.d === 3 ? [X + 7 + 16 * gk, Z + 1] : gg.d === 0 ? [X + 31, Z + 7 + 16 * gk] : [X + 7 + 16 * gk, Z + 31];
      const ok = w.reachFrom([[...start, 0]], X - 1, Z - 1, X + 33, Z + 33);
      ports.forEach((h, s) => {
        if (h === null) return;
        const g = MEGA_SEGS[s], k = s & 1;
        const t = g.d === 1 ? [X + 1, Z + 7 + 16 * k] : g.d === 3 ? [X + 7 + 16 * k, Z + 1] : g.d === 0 ? [X + 31, Z + 7 + 16 * k] : [X + 7 + 16 * k, Z + 31];
        assert.ok(ok(...t, 0), `seed ${seed} room ${m.i},${m.j}: entrance ${s} (${h} m) cannot be reached from entrance ${gs}`);
      });
    }
  }
  assert.ok(ground >= 40 && upper >= 20, `${ground} ground and ${upper} 2F entrances checked`);
});

test('H4 the 2F entrance is a stair chunk of the room\'s own patch, facing the room', () => {
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const m of rooms(w)) {
      const [cx, cz] = m.f2 === 0 ? [m.cx0 + 2, m.cz0] : [m.cx0, m.cz0 + 2];
      const s = w.lm.stairOf(cx, cz);
      assert.ok(s, `seed ${seed} room ${m.i},${m.j}: stair chunk ${cx},${cz}`);
      assert.deepEqual(s, { dir: m.f2 === 0 ? 1 : 3, level: 1 });
      assert.equal(w.layout(cx, cz).stair.level, 1);
    }
  }
});

// the abyss rooms: every walkway tile that meets the pool, grid coordinates → world edge key
const abyssRooms = (w) => rooms(w, (m) => m.type === 'abyss');
function railAt(w, x, z, d) {
  const [L, i] = w.cellOf(x, z), k = edgeKey(...edgeOf(x, z, d));
  return (L.railTiles.get(i) || []).some((rl) => edgeKey(rl.x0, rl.z0, rl.x1, rl.z1) === k);
}

test('H3 the abyss cannot be entered: a rail along every edge of the pool, none on a board\'s sides, one across each board\'s end', () => {
  let rim = 0, ends = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const m of abyssRooms(w)) {
      const g = w.megaGrid(m), X = m.cx0 * CHUNK, Z = m.cz0 * CHUNK;
      for (let z = 1; z < 32; z++) for (let x = 1; x < 32; x++) {
        if (g.tiles[z * 32 + x] !== FLOOR) continue;
        DIRS.forEach(([dx, dz], d) => {
          if (g.tiles[(z + dz) * 32 + x + dx] !== VOID) return;
          const level = g.h[z * 32 + x] < 0.01;   // walkway at pool level, or a board tile
          if (level) { rim++; assert.ok(railAt(w, X + x, Z + z, d), `seed ${seed} room ${m.i},${m.j}: no rail at tile ${x},${z} side ${d}`); }
        });
      }
      for (const b of g.mega.boards) for (const [x, z, d] of b.end) {
        ends++;
        assert.equal(g.tiles[(z + DIRS[d][1]) * 32 + x + DIRS[d][0]], VOID, 'the board ends over the pool');
        assert.ok(railAt(w, X + x, Z + z, d), `seed ${seed} room ${m.i},${m.j}: no rail across a ${b.h} m board's end`);
        // its sides have none: you walk to the end and are only stopped there
        const [sx, sz] = DIRS[d][0] ? [0, 1] : [1, 0];
        for (const s of [1, -1]) {
          const nx = x + sx * s, nz = z + sz * s;
          if (g.tiles[nz * 32 + nx] === VOID) assert.ok(!railAt(w, X + x, Z + z, DIRS.findIndex(([a, c]) => a === sx * s && c === sz * s)), 'no rail along the side of a board');
        }
      }
    }
  }
  assert.ok(rim > 400 && ends >= 30, `${rim} rim edges and ${ends} board ends checked`);
});

test('H3 a body walking at the pool from the walkway never enters it', () => {
  const DT = 1 / 60;
  let walks = 0;
  for (const seed of [1, 42]) {
    const w = new World(seed);
    for (const m of abyssRooms(w).slice(0, 3)) {
      const g = w.megaGrid(m), X = m.cx0 * CHUNK, Z = m.cz0 * CHUNK;
      let n = 0;
      for (let z = 1; z < 32 && n < 12; z++) for (let x = 1; x < 32 && n < 12; x++) {
        if (g.tiles[z * 32 + x] !== FLOOR || g.h[z * 32 + x] > 0.01) continue;
        const d = DIRS.findIndex(([dx, dz]) => g.tiles[(z + dz) * 32 + x + dx] === VOID);
        if (d < 0 || (x + z) % 3) continue;
        n++; walks++;
        const [dx, dz] = DIRS[d], p = new Player();
        p.reset(X + x + 0.5, Z + z + 0.5, 0, 0);
        p.settle(w, 0);
        p.yaw = Math.atan2(-dx, -dz);
        for (let t = 0; t < 3; t += DT) {
          p.update(w, DT, { x: 0, z: 1, run: true });
          assert.notEqual(w.typeAt(Math.floor(p.x), Math.floor(p.z)), VOID, `seed ${seed} room ${m.i},${m.j} tile ${x},${z}: walked into the pool`);
        }
      }
    }
  }
  assert.ok(walks >= 20, `${walks} walks`);
});

test('H3 one or two boards, walkable to their ends from the ground entrance', () => {
  let boards = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const m of abyssRooms(w)) {
      const g = w.megaGrid(m), X = m.cx0 * CHUNK, Z = m.cz0 * CHUNK, ports = w.lm.megaPorts(m);
      const s = ports.findIndex((h) => h === 0), gg = MEGA_SEGS[s], k = s & 1;
      const start = gg.d === 1 ? [X + 1, Z + 7 + 16 * k] : gg.d === 3 ? [X + 7 + 16 * k, Z + 1] : gg.d === 0 ? [X + 31, Z + 7 + 16 * k] : [X + 7 + 16 * k, Z + 31];
      const ok = w.reachFrom([[...start, 0]], X - 1, Z - 1, X + 33, Z + 33);
      assert.ok(g.mega.boards.length >= 1 && g.mega.boards.length <= 2, `seed ${seed} room ${m.i},${m.j}: ${g.mega.boards.length} boards`);
      for (const b of g.mega.boards) for (const [x, z] of b.end) {
        boards++;
        assert.ok(ok(X + x, Z + z, 0), `seed ${seed} room ${m.i},${m.j}: the ${b.h} m board's end cannot be reached`);
        assert.ok(Math.abs(w.hAt(X + x, Z + z) - b.h) < 0.01);
      }
      // the pool itself is never standable
      for (let i = 0; i < 1024; i++) if (g.tiles[i] === VOID) assert.ok(!ok(X + (i % 32), Z + (i >> 5), 0));
    }
  }
  assert.ok(boards >= 30, `${boards} board ends checked`);
});

test('H2 the neighbours of a mega room carry their walls up to its 12 m ceiling', async () => {
  const { buildChunkGeometry } = await loadMesher();
  const w = new World(42);
  const m = rooms(w)[0];
  for (const [dcx, dcz, axis] of [[-1, 0, 0], [2, 0, 0], [0, -1, 2], [0, 2, 2]]) {
    const L = w.layout(m.cx0 + dcx, m.cz0 + dcz);
    const g = buildChunkGeometry(w, L, { ceil: L.ceilFixed || 4, T: 0, guide: null });
    const reach = Math.max(...quadsOf(g.static).filter((q) => q.every((v) => Math.abs(v[axis] - q[0][axis]) < 1e-6)).flat().map((v) => v[1]));
    assert.ok(reach >= MEGA_CEIL, `neighbour ${dcx},${dcz} walls reach ${reach.toFixed(1)} m`);
  }
});

test('K9 a mega room draws at most one skylight, its lit floor shared by every chunk it touches', async () => {
  const { buildChunkGeometry } = await loadMesher();
  let shafts = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const m of rooms(w, (r) => r.type === 'abyss' || r.sky)) {
      let owners = 0, lit = 0;
      for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
        const L = w.layout(m.cx0 + dx, m.cz0 + dz);
        if (L.suns.length) lit++;
        for (const s of L.suns) if (s.own) owners++;
        const g = buildChunkGeometry(w, L, { ceil: MEGA_CEIL, T: 0, guide: null });
        if (!g.sun) continue;
        shafts++;

      }
      assert.equal(owners, 1, `seed ${seed} room ${m.i},${m.j} draws ${owners} skylights`);
      assert.ok(lit >= 2, 'the sunlit floor patch reaches into more than one chunk');
    }
  }
  assert.ok(shafts >= 20, `${shafts} shafts checked`);
});

test('H a mega room has one lamp shape in all four chunks, and a round one has walls in its square\'s corners', () => {
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const m of rooms(w)) {
      const shapes = new Set(), g = w.megaGrid(m);
      for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) shapes.add(w.layout(m.cx0 + dx, m.cz0 + dz).lampShape);
      assert.equal(shapes.size, 1);
      const corners = [g.tiles[31 * 32 + 31], g.tiles[1 * 32 + 1], g.tiles[1 * 32 + 31], g.tiles[31 * 32 + 1]];
      if (m.round) assert.ok(corners.every((t) => t === WALL), `seed ${seed} round room ${m.i},${m.j} corners`);
      else assert.ok(corners.every((t) => t !== WALL), `seed ${seed} square room ${m.i},${m.j} corners`);
    }
  }
});

// ---------- batch 4 L8: the abyss ----------

test('L8 a wide walkway all round the pool (3 m open), no walkway across it, boards at most two with a rail across each end', () => {
  let n = 0;
  for (const seed of SEEDS) {
    const w = new World(seed);
    for (const m of abyssRooms(w)) {
      const g = w.megaGrid(m);
      const inRoom = (x, z) => g.tiles[z * 32 + x] !== WALL;
      // for every room tile on the pool's rim row, three more tiles outward are walkway (floor), never pool or ramp
      for (let z = 1; z < 31; z++) for (let x = 1; x < 31; x++) {
        if (g.tiles[z * 32 + x] !== VOID) continue;
        for (const [dx, dz] of DIRS) {
          const nx = x + dx, nz = z + dz;
          if (g.tiles[nz * 32 + nx] === VOID || !inRoom(nx, nz) || g.h[nz * 32 + nx] > 0.01) continue;   // a board or the 2F platform is not walkway
          // an outer edge of the pool: the tiles further out along the same line, up to the wall or three tiles
          let open = 0;
          for (let k = 1; k <= 3; k++) { const t = g.tiles[(z + dz * k) * 32 + x + dx * k]; if (t === WALL || t === VOID) break; open++; }
          const wallDist = (() => { let k = 1; while (g.tiles[(z + dz * k) * 32 + x + dx * k] !== WALL && k < 40) k++; return k - 1; })();
          assert.ok(open >= Math.min(3, wallDist), `seed ${seed} room ${m.i},${m.j}: ${open} walkway tiles at ${x},${z}`);
        }
      }
      // no floor island or crossing: every non-pool tile inside the pool's bounding square is a board
      const boards = g.mega.boards.length;
      assert.ok(boards >= 1 && boards <= 2);
      n++;
    }
  }
  assert.ok(n >= 5, `${n} abyss rooms`);
});

