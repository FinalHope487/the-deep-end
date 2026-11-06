// Mega rooms: 2×2 chunks (32×32 tiles) under a 12 m ceiling. Pure data, no three.js.
//
// Interior tiles are 1..31 (column and row 0 belong to the doorways). Two kinds:
//  - abyss: a pool of nothing (VOID) in the middle, half of them filled with water that fades to black, half dry and
//    black; a walkway ring round it; diving boards at several heights that run out over it and stop at a rail; a big
//    skylight over the middle
//  - solemn: a bare hall lit only by a skylight or by a field of ceiling lamps
// Either may be round (a disc instead of a square). Entrances sit at the middle of chunk edges (rows / columns 7-8 and
// 23-24 of the 32): two on the ground and one at 3 m from the room's own stair chunk, which opens onto a diving board.
import { newGrid, fill, ramp, FLOOR, WALL, VOID, RAMP, DIRS, LEVEL_H } from './tiles.js';
import { edgeOf, autoRails, floorTop } from './levels.js';
import { MEGA_SEGS } from './levelmap.js';

export const MEGA_CEIL = 12;
export const MEGA_FOG = 40;       // the fog's far distance inside a mega room
const N = 32, C = 16.5;          // grid size, centre
const POOL_R = 10.5;             // half-width of the pool
const ROOM_R = 16;               // radius of a round room
const BOARD_H = [3, 2.4];        // the height of the one tower board (square room, round room)
const SLOPE = 0.45;              // steepest ramp, metres per tile

// a side of the room seen from the inside: u runs along the wall, v goes inward from it. `up` is the ramp direction that
// climbs towards +u, `dn` towards -u, `in` the direction of +v (indices into DIRS)
const SIDES = {
  E: { at: (u, v) => [31 - v, u], up: 2, dn: 3, in: 1 },
  S: { at: (u, v) => [u, 31 - v], up: 0, dn: 1, in: 3 },
  W: { at: (u, v) => [1 + v, u], up: 2, dn: 3, in: 0 },
  N: { at: (u, v) => [u, 1 + v], up: 0, dn: 1, in: 2 },
};
const SEG_SIDE = ['W', 'W', 'N', 'N', 'E', 'E', 'S', 'S'];   // per MEGA_SEGS entry; its entrance is at u = 7 (first) or 23

const rectOf = (S, u0, v0, u1, v1) => {
  const [a, b] = S.at(u0, v0), [c, d] = S.at(u1, v1);
  return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
};

const railEdge = (g, x, z, d, y) => {
  const [x0, z0, x1, z1] = edgeOf(x, z, d);
  g.rails.push({ x0, z0, x1, z1, y0: y, y1: y, ax: x, az: z });
};

// m: the level map's room ({ type, round, water, sky, f2 }), ports: floor height of its 8 edge segments (null: walled)
export function megaRoom(m, ports) {
  const g = newGrid(N);
  g.ox = 0; g.oz = 0;
  const round = m.round;
  const inRoom = (x, z) => x >= 1 && z >= 1 && x <= 31 && z <= 31 && (!round || Math.hypot(x + 0.5 - C, z + 0.5 - C) <= ROOM_R);
  fill(g, 0, 0, 31, 31, WALL, 0);
  for (let z = 1; z <= 31; z++) for (let x = 1; x <= 31; x++) if (inRoom(x, z)) fill(g, x, z, x, z, FLOOR, 0);
  // ground entrances: a 2-wide passage from the edge to the room (a round room's wall is some way in)
  MEGA_SEGS.forEach((_, s) => {
    if (ports[s] !== 0) return;
    const S = SIDES[SEG_SIDE[s]], u = 7 + 16 * (s & 1);
    for (let v = 0; v <= 4; v++) {
      const [x, z] = S.at(u, v), [x2, z2] = S.at(u + 1, v);
      if (inRoom(x, z) && inRoom(x2, z2)) break;
      fill(g, ...rectOf(S, u, v, u + 1, v), FLOOR, 0);
    }
  });
  // the 2F entrance side: its entrance tile (u 7-8, v 0) opens onto a 3 m platform, and a ramp along the wall leads down
  const f2 = m.f2 ? 'S' : 'E', F = SIDES[f2];
  fill(g, ...rectOf(F, 7, 0, 9, 3), FLOOR, LEVEL_H);
  ramp(g, ...rectOf(F, 10, 2, 15, 3), F.dn, 0, LEVEL_H / 6);
  g.kind = 'mega';
  g.mega = { type: m.type, round, water: m.type === 'abyss' && m.water, sky: m.sky };
  if (m.type === 'abyss') abyss(g, m, inRoom, f2);
  else solemn(g, m, inRoom);
  autoRails(g);
  return g;
}

function abyss(g, m, inRoom, f2) {
  const round = m.round, wet = m.water ? 1 : 0;
  const inPool = round ? (x, z) => Math.hypot(x + 0.5 - C, z + 0.5 - C) <= POOL_R : (x, z) => x >= 6 && x <= 26 && z >= 6 && z <= 26;
  for (let z = 1; z <= 31; z++) for (let x = 1; x <= 31; x++) {
    if (!inPool(x, z)) continue;
    fill(g, x, z, x, z, VOID, 0);
    g.wet[z * N + x] = wet;
  }
  // the 2F platform is the root of a 3 m board out over the pool; boards are walkable (their sides have no rail)
  const boards = [];   // [side, v of the last tile, height, u of its first tile]
  const boardTiles = new Set();
  const board = (S, u0, v0, u1, v1, H) => {
    const [x0, z0, x1, z1] = rectOf(S, u0, v0, u1, v1);
    fill(g, x0, z0, x1, z1, FLOOR, H);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) boardTiles.add(z * N + x);
    boards.push([S, v1, H, u0]);
  };
  board(SIDES[f2], 7, 4, 8, 13, LEVEL_H);
  // the side facing the 2F one has a tower beside the pool: a ramp along its edge up to a platform, then a board out over
  // the pool. That makes two boards at most; the walkway's outer three tiles stay open all the way round
  {
    const S = SIDES[{ E: 'W', S: 'N' }[f2]], H = BOARD_H[round ? 1 : 0], n = Math.min(14, Math.ceil(H / SLOPE));
    ramp(g, ...rectOf(S, 15 - n, 3, 14, 4), S.up, 0, H / n);
    board(S, 15, 3, 16, 11, H);
  }
  g.mega.boards = boards.map(([S, v, H, u]) => ({ h: H, end: [0, 1].map((du) => [...S.at(u + du, v), S.in]) }));   // grid tiles of each board's end, and the way it faces
  // rails: along every edge where walkway or ramp meets the pool (a board's sides stay free), and across each board's end
  for (let z = 1; z <= 31; z++) for (let x = 1; x <= 31; x++) {
    const i = z * N + x;
    if ((g.tiles[i] !== FLOOR && g.tiles[i] !== RAMP) || boardTiles.has(i)) continue;
    DIRS.forEach(([dx, dz], d) => {
      if (g.tiles[(z + dz) * N + x + dx] !== VOID) return;
      const [x0, z0, x1, z1] = edgeOf(x, z, d);
      g.rails.push({ x0, z0, x1, z1, y0: floorTop(g, i, x0 - dx * 0.02, z0 - dz * 0.02), y1: floorTop(g, i, x1 - dx * 0.02, z1 - dz * 0.02), ax: x, az: z });
    });
  }
  for (const [S, v, H, u] of boards) for (const du of [0, 1]) {
    const [x, z] = S.at(u + du, v);
    railEdge(g, x, z, S.in, H);
  }
  // light: a few ceiling panels over the walkway, a big skylight over the middle (its beam stays small)
  for (const s of ['E', 'S', 'W', 'N']) for (const u of [3, 14, 26]) {
    const S = SIDES[s], [x0, z0, x1, z1] = rectOf(S, u, 0, u + 1, 1);
    if (inRoom(x0, z0) && inRoom(x1, z1)) g.lamps.push({ x: x0, z: z0, w: x1 - x0 + 1, d: z1 - z0 + 1, k: 0 });
  }
  g.suns.push({ x: C, z: C, w: 14, d: 14, wx: C, wz: C, sky: true, beamW: 5, beamD: 5 });
}

function solemn(g, m, inRoom) {
  if (m.sky) {
    g.suns.push({ x: C, z: C, w: 12, d: 12, wx: C, wz: C, sky: true, beamW: 5, beamD: 5 });
    return;
  }
  for (const cz of [6, 16, 26]) for (const cx of [6, 16, 26]) {
    if (inRoom(cx, cz) && inRoom(cx - 2, cz - 2) && inRoom(cx + 2, cz + 2)) g.lamps.push({ x: cx - 2, z: cz - 2, w: 4, d: 4, k: 1 });
  }
}
