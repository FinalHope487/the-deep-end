// Room parser. Pure functions: text in, plain object out. No I/O, no ids.
// Format: blueprint section 5. Symbols: # wall, . floor, = opening to outside.

const WALLS = ['N', 'E', 'S', 'W'];

function nums(s, n, where) {
  const a = s.split(',').map(Number);
  if (a.length !== n || a.some((v) => !Number.isFinite(v))) throw new Error(`bad number list "${s}" in ${where}`);
  return a;
}

function kv(parts, where) {
  const o = {};
  for (const p of parts) {
    const i = p.indexOf('=');
    if (i < 1) throw new Error(`bad key=value "${p}" in ${where}`);
    o[p.slice(0, i)] = p.slice(i + 1);
  }
  return o;
}

export function parseRoom(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const room = { id: null, ref: null, unit: 1, ceiling: 4, waterLevel: 0, sources: [], cameras: {}, plan: [], floor: null };
  let mode = 'head';
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (mode === 'head') {
      if (!line.trim()) continue;
      if (line === 'plan:') { mode = 'plan'; continue; }
      if (line === 'floor:') { mode = 'floor'; room.floor = []; continue; }
      const i = line.indexOf(':');
      if (i < 1) throw new Error(`bad header line "${line}"`);
      const key = line.slice(0, i).trim();
      const val = line.slice(i + 1).trim();
      if (key === 'id') room.id = val;
      else if (key === 'ref') room.ref = val;
      else if (key === 'unit') room.unit = Number(val);
      else if (key === 'ceiling') room.ceiling = Number(val);
      else if (key === 'water-level') room.waterLevel = Number(val);
      else if (key === 'source') {
        const [type, ...rest] = val.split(/\s+/);
        const o = kv(rest, 'source');
        if (type === 'sun') room.sources.push({ type, dir: nums(o.dir, 3, 'source sun') });
        else if (type === 'opening') {
          if (!WALLS.includes(o.wall)) throw new Error(`source opening: wall must be one of N E S W, got "${o.wall}"`);
          room.sources.push({ type, wall: o.wall, from: Number(o.from), to: Number(o.to), sill: Number(o.sill), head: Number(o.head) });
        } else throw new Error(`unknown source type "${type}" (M1 knows sun, opening)`);
      } else if (key === 'camera') {
        const [name, ...rest] = val.split(/\s+/);
        const o = kv(rest, 'camera');
        room.cameras[name] = { pos: nums(o.pos, 3, 'camera'), look: nums(o.look, 3, 'camera') };
      } else throw new Error(`unknown header key "${key}"`);
    } else if (line.trim() === '') {
      continue;
    } else if (line === 'floor:') { mode = 'floor'; room.floor = []; }
    else if (mode === 'plan') room.plan.push(line);
    else room.floor.push(line);
  }
  if (!room.id) throw new Error('room has no id');
  if (!room.cameras.main) throw new Error('room has no "camera: main" line');
  if (!room.plan.length) throw new Error('room has no plan');
  const w = room.plan[0].length;
  for (const r of room.plan) {
    if (r.length !== w) throw new Error('plan rows differ in width');
    if (/[^#.=]/.test(r)) throw new Error(`plan has a symbol outside # . = in "${r}"`);
  }
  if (room.floor && (room.floor.length !== room.plan.length || room.floor.some((r) => r.length !== w))) {
    throw new Error('floor grid must match the plan size');
  }
  room.w = w;
  room.d = room.plan.length;
  if (!room.sources.some((s) => s.type === 'sun') && !room.sources.some((s) => s.type === 'opening')) {
    throw new Error('room declares no light source');
  }
  // every "=" cell must belong to a declared opening source
  room.openings = new Map();
  for (let z = 0; z < room.d; z++) {
    for (let x = 0; x < w; x++) {
      if (room.plan[z][x] !== '=') continue;
      const op = room.sources.find((s) => s.type === 'opening' && wallCoord(s.wall, x, z, w, room.d) !== null &&
        wallCoord(s.wall, x, z, w, room.d) >= s.from && wallCoord(s.wall, x, z, w, room.d) < s.to);
      if (!op) throw new Error(`"=" cell at x=${x} z=${z} has no matching "source: opening" line`);
      room.openings.set(z * w + x, op);
    }
  }
  return room;
}

// position along a wall for a cell on that wall, or null if the cell is not on the wall
function wallCoord(wall, x, z, w, d) {
  if (wall === 'W') return x === 0 ? z : null;
  if (wall === 'E') return x === w - 1 ? z : null;
  if (wall === 'N') return z === 0 ? x : null;
  return z === d - 1 ? x : null;
}

export function cellAt(room, x, z) {
  if (x < 0 || z < 0 || x >= room.w || z >= room.d) return 'out';
  return room.plan[z][x];
}
