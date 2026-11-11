// Room parser. Pure functions: JSON text in, plain object out. No I/O, no ids beyond the room's own.
// Format: blueprint section 5. One file `rooms/<id>.room.json`: scalars, `grids` (named arrays of row strings), `objects` (typed entries).
// Plan symbols: # wall, . floor, = opening to outside.

const WALLS = ['N', 'E', 'S', 'W'];

// Top-level scalars: key -> { kind, required, default }. A key that is not here (and is not `grids` or `objects`) is an error.
const SCALARS = {
  id: { kind: 'string', required: true },
  note: { kind: 'string', default: '' },
  ref: { kind: 'string', default: null },
  unit: { kind: 'positive', default: 1 },
  ceiling: { kind: 'positive', default: 4 },
  waterLevel: { kind: 'number', default: 0 },
  floorStep: { kind: 'positive', default: 0.15 },
};

// Named grids: name -> { required }. Every row is a string; all rows of all grids have the plan's width and count.
const GRIDS = { plan: { required: true }, floor: { required: false } };

// Object types: ONE table. type -> { store, fields, build }.
//   store: the list (or map, for `camera`) on the parsed room that receives the object.
//   fields: name -> { kind, required, default }. Kinds: number, positive, vec3, int, cell (two ints), range (two ints a <= b), wall (N E S W), name.
//   build(o): the stored shape (the shape the consumers read).
// A new object type needs one new entry here plus its consumer.
const OBJECTS = {
  sun: {
    store: 'sources',
    fields: { dir: { kind: 'vec3', required: true } },
    build: (o) => ({ type: 'sun', dir: o.dir }),
  },
  opening: {
    store: 'sources',
    fields: { wall: { kind: 'wall', required: true }, from: { kind: 'number', required: true }, to: { kind: 'number', required: true }, sill: { kind: 'number', required: true }, head: { kind: 'number', required: true } },
    build: (o) => ({ type: 'opening', wall: o.wall, from: o.from, to: o.to, sill: o.sill, head: o.head }),
  },
  camera: {
    store: 'cameras',
    fields: { name: { kind: 'name', required: true }, pos: { kind: 'vec3', required: true }, look: { kind: 'vec3', required: true } },
    build: (o) => ({ pos: o.pos, look: o.look }),
  },
  ramp: {
    store: 'ramps',
    fields: { x: { kind: 'range', required: true }, z: { kind: 'range', required: true }, dir: { kind: 'wall', required: true }, from: { kind: 'number', required: true }, to: { kind: 'number', required: true } },
    build: (o) => ({ x0: o.x[0], x1: o.x[1], z0: o.z[0], z1: o.z[1], dir: o.dir, from: o.from, to: o.to }),
  },
  // An opening through an inner wall (pictures/pool15.jpg: doorways in a row). `cell` is the first wall cell, `side` is the face of that
  // cell that you enter by (its neighbour on that side must be floor). The opening runs straight through the wall cells to the far floor,
  // is `width` m wide (a whole number of cells, toward +x for N/S, toward +z for E/W) and `height` m high above the local floor.
  doorway: {
    store: 'doorways',
    fields: { cell: { kind: 'cell', required: true }, side: { kind: 'wall', required: true }, width: { kind: 'positive', required: true }, height: { kind: 'positive', required: true } },
    build: (o) => ({ cell: o.cell, side: o.side, width: o.width, height: o.height }),
  },
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const CHECK = {
  string: (v) => typeof v === 'string' && v.length > 0,
  name: (v) => typeof v === 'string' && v.length > 0,
  number: isNum,
  positive: (v) => isNum(v) && v > 0,
  int: (v) => Number.isInteger(v),
  cell: (v) => Array.isArray(v) && v.length === 2 && v.every(Number.isInteger),
  vec3: (v) => Array.isArray(v) && v.length === 3 && v.every(isNum),
  range: (v) => Array.isArray(v) && v.length === 2 && v.every(Number.isInteger) && v[0] <= v[1],
  wall: (v) => WALLS.includes(v),
};
const EXPECT = { string: 'a non-empty string', name: 'a non-empty string', number: 'a finite number', positive: 'a number above 0', int: 'an integer', cell: 'a list [x, z] of 2 integers', vec3: 'a list of 3 numbers', range: 'a list [a, b] of 2 integers with a <= b', wall: 'one of "N", "E", "S", "W"' };

export function parseRoom(text) {
  let src;
  try { src = JSON.parse(text); } catch (e) { throw new Error(`room: not valid JSON (${e.message})`); }
  if (!src || typeof src !== 'object' || Array.isArray(src)) throw new Error('room: the file must hold one JSON object');
  const name = typeof src.id === 'string' && src.id ? src.id : '(no id)';
  const fail = (msg) => { throw new Error(`room "${name}": ${msg}`); };

  const room = { id: null, note: '', ref: null, unit: 1, ceiling: 4, waterLevel: 0, floorStep: 0.15, sources: [], cameras: {}, plan: [], floor: null, ramps: [], doorways: [], doorHeights: new Map() };

  for (const key of Object.keys(src)) {
    if (key !== 'grids' && key !== 'objects' && !(key in SCALARS)) fail(`unknown top-level key "${key}"`);
  }
  for (const [key, spec] of Object.entries(SCALARS)) {
    if (src[key] === undefined) {
      if (spec.required) fail(`missing necessary key "${key}"`);
      room[key] = spec.default;
    } else if (!CHECK[spec.kind](src[key])) fail(`key "${key}" must be ${EXPECT[spec.kind]}`);
    else room[key] = src[key];
  }

  // grids
  const grids = src.grids;
  if (!grids || typeof grids !== 'object' || Array.isArray(grids)) fail('missing necessary key "grids" (an object of named grids)');
  for (const g of Object.keys(grids)) if (!(g in GRIDS)) fail(`unknown grid "${g}" (known: ${Object.keys(GRIDS).join(', ')})`);
  for (const [g, spec] of Object.entries(GRIDS)) {
    if (grids[g] === undefined) { if (spec.required) fail(`missing necessary grid "${g}"`); continue; }
    if (!Array.isArray(grids[g]) || !grids[g].length || grids[g].some((r) => typeof r !== 'string')) fail(`grid "${g}" must be a non-empty array of row strings`);
  }
  room.plan = grids.plan;
  const w = room.plan[0].length;
  room.plan.forEach((r, i) => {
    if (r.length !== w) fail(`grid "plan" row ${i} has width ${r.length}, row 0 has width ${w}`);
    if (/[^#.=]/.test(r)) fail(`grid "plan" row ${i} has a symbol outside # . =`);
  });
  if (grids.floor) {
    room.floor = grids.floor;
    if (room.floor.length !== room.plan.length) fail(`grid "floor" has ${room.floor.length} rows, plan has ${room.plan.length}`);
    room.floor.forEach((r, i) => {
      if (r.length !== w) fail(`grid "floor" row ${i} has width ${r.length}, plan has width ${w}`);
      if (/[^0-9]/.test(r)) fail(`grid "floor" row ${i} may hold digits only`);
    });
  }
  room.w = w;
  room.d = room.plan.length;

  // objects
  if (src.objects !== undefined && !Array.isArray(src.objects)) fail('key "objects" must be an array');
  (src.objects || []).forEach((o, i) => {
    const at = `object ${i}`;
    if (!o || typeof o !== 'object' || Array.isArray(o)) fail(`${at} must be an object`);
    const spec = OBJECTS[o.type];
    if (!spec) fail(`${at}: unknown type "${o.type}" (known: ${Object.keys(OBJECTS).join(', ')})`);
    for (const key of Object.keys(o)) if (key !== 'type' && !(key in spec.fields)) fail(`${at} (${o.type}): unknown field "${key}"`);
    const v = {};
    for (const [f, fs] of Object.entries(spec.fields)) {
      if (o[f] === undefined) {
        if (fs.required) fail(`${at} (${o.type}): missing necessary field "${f}"`);
        v[f] = fs.default;
      } else if (!CHECK[fs.kind](o[f])) fail(`${at} (${o.type}): field "${f}" must be ${EXPECT[fs.kind]}`);
      else v[f] = o[f];
    }
    if (spec.store === 'cameras') {
      if (room.cameras[v.name]) fail(`${at} (camera): name "${v.name}" is used twice`);
      room.cameras[v.name] = spec.build(v);
    } else room[spec.store].push(spec.build(v));
  });

  // doorways: carve their cells out of the wall. room.plan becomes the plan that the consumers see (carved cells are floor);
  // room.doorHeights maps a carved cell index to the opening height above the local floor. The file's own grid is not changed.
  if (room.doorways.length) {
    const rows = room.plan.map((r) => r.split(''));
    const DIR = { N: [0, 1, 1, 0], S: [0, -1, 1, 0], E: [-1, 0, 0, 1], W: [1, 0, 0, 1] }; // [pass x, pass z, across x, across z]; enter from the side
    const NB = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
    const cellsAcross = (dw, i) => { const k = dw.width / room.unit; if (Math.abs(k - Math.round(k)) > 1e-6 || Math.round(k) < 1) fail(`doorway object ${i}: field "width" must be a whole number of cells (unit ${room.unit} m), got ${dw.width}`); return Math.round(k); };
    room.doorways.forEach((dw, i) => {
      const at = `doorway ${i}`, [px, pz, ax, az] = DIR[dw.side], k = cellsAcross(dw, i);
      const inside = (x, z) => x >= 0 && z >= 0 && x < w && z < room.d;
      const [bx, bz] = NB[dw.side];
      for (let a = 0; a < k; a++) {
        let x = dw.cell[0] + ax * a, z = dw.cell[1] + az * a, run = 0;
        if (!inside(x + bx, z + bz) || rows[z + bz][x + bx] !== '.') fail(`${at}: the cell on side "${dw.side}" of (${x},${z}) is not floor`);
        for (; inside(x, z) && rows[z][x] === '#'; x += px, z += pz) {
          if (room.doorHeights.has(z * w + x)) fail(`${at}: cell (${x},${z}) belongs to two doorways`);
          rows[z][x] = '.'; room.doorHeights.set(z * w + x, dw.height); run++;
        }
        if (!run) fail(`${at}: cell (${dw.cell[0] + ax * a},${dw.cell[1] + az * a}) is not a wall`);
        if (!inside(x, z) || rows[z][x] !== '.') fail(`${at}: the opening does not end on a floor cell`);
      }
    });
    room.plan = rows.map((r) => r.join(''));
  }

  // rules across the room
  if (!room.cameras.main) fail('no object of type "camera" with name "main"');
  for (const [i, r] of room.ramps.entries()) {
    if (r.x0 < 0 || r.z0 < 0 || r.x1 >= w || r.z1 >= room.d) fail(`ramp object (ramp ${i}) lies outside the plan`);
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) if (room.plan[z][x] !== '.') fail(`ramp ${i} covers a cell that is not floor (x=${x} z=${z})`);
  }
  if (!room.sources.length) fail('no light source (add an object of type "sun" or "opening")');
  // every "=" cell must belong to a declared opening object
  room.openings = new Map();
  for (let z = 0; z < room.d; z++) {
    for (let x = 0; x < w; x++) {
      if (room.plan[z][x] !== '=') continue;
      const op = room.sources.find((s) => s.type === 'opening' && wallCoord(s.wall, x, z, w, room.d) !== null &&
        wallCoord(s.wall, x, z, w, room.d) >= s.from && wallCoord(s.wall, x, z, w, room.d) < s.to);
      if (!op) fail(`"=" cell at x=${x} z=${z} has no matching object of type "opening"`);
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
