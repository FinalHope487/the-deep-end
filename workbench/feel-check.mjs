// Evidence script for M2 (K15). Not a test suite: one file, no framework, no browser.
//   node workbench/feel-check.mjs
// Runs scripted intents in rooms/feel-test.room.txt for every preset in looks/feel/ and prints PASS or FAIL per invariant.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRoom } from './js/room.js';
import { createWorld } from './js/move/world.js';
import { step, advance, createSim, initialState, checkFeel, FIXED_DT } from './js/move/mover.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const room = parseRoom(fs.readFileSync(path.join(here, 'rooms', 'feel-test.room.txt'), 'utf8'));
const world = createWorld(room);
const feels = fs.readdirSync(path.join(here, 'looks', 'feel')).filter((f) => f.endsWith('.json')).sort()
  .map((f) => [f.slice(0, -5), checkFeel(JSON.parse(fs.readFileSync(path.join(here, 'looks', 'feel', f), 'utf8')))]);

const EAST = -Math.PI / 2, WEST = Math.PI / 2, SOUTH = Math.PI;
const NONE = { moveX: 0, moveZ: 0, lookDX: 0, lookDY: 0 };
const start = (x, z, yaw) => initialState(world, x, z, world.groundHeight(x, z) + 1.6, yaw, 0);

// run fixed steps; `onStep(state, i)` may stop the run by returning true
function run(feel, s, intent, seconds, onStep) {
  const n = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < n; i++) {
    s = step(s, intent, feel, world, FIXED_DT);
    if (onStep && onStep(s, i)) break;
  }
  return s;
}
const FWD = { moveX: 0, moveZ: 1, lookDX: 0, lookDY: 0 };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

let fails = 0, total = 0;
const report = (preset, name, ok, detail) => { total++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${preset.padEnd(6)} ${name}${detail ? '  (' + detail + ')' : ''}`); };

for (const [name, feel] of feels) {
  const r = feel.radius, y0 = world.groundHeight(5, 3);

  // 1. no NaN, never inside a wall: a long run that turns all the time
  {
    let s = start(4.6, 3.0, EAST), bad = null;
    const intent = { moveX: 0.3, moveZ: 1, lookDX: 0.004, lookDY: 0 };
    s = run(feel, s, intent, 60, (t) => {
      if (![t.x, t.y, t.z, t.vx, t.vz, t.vy, t.eye, t.bob].every(Number.isFinite)) { bad = 'NaN'; return true; }
      if (world.blocked(t.x, t.z, t.y, r - 1e-4, 1e9)) { bad = `in a wall at ${t.x.toFixed(2)},${t.z.toFixed(2)}`; return true; }
      return false;
    });
    report(name, 'no NaN and never inside a wall (60 s turning run)', !bad, bad || `end ${s.x.toFixed(2)},${s.z.toFixed(2)}`);
  }

  // 2. 45 degree run into the east wall keeps more than half of the speed along the wall
  {
    let s = start(10.4, 2.0, -3 * Math.PI / 4), touched = false, along = 0, ok = true;
    s = run(feel, s, FWD, 3, (t) => {
      if (!touched && t.x + r >= 12.25 - 0.02) touched = true;
      if (touched && t.z + r < 5.25 - 0.1) along = Math.max(along, Math.abs(t.vz));
      return t.z + r >= 5.25 - 0.1;
    });
    report(name, 'wall at 45 degrees keeps > half of the speed along the wall', touched && along > 0.5 * feel.walkSpeed, `along ${along.toFixed(2)} m/s of ${feel.walkSpeed}`);
  }

  // 3. a low step is climbed; a high block stops the body
  {
    const s1 = run(feel, start(4.4, 3.2, EAST), FWD, 2, (t) => t.x >= 6.0); // stop when the centre is on the step
    report(name, 'step of 0.15 m is climbed', near(s1.y, y0 + 0.15, 1e-3) && s1.x >= 6.0, `y ${s1.y.toFixed(3)} x ${s1.x.toFixed(2)}`);
    const s2 = run(feel, start(7.2, 3.2, EAST), FWD, 2, null);
    report(name, 'block of 0.45 m blocks', near(s2.y, y0, 1e-3) && s2.x <= 7.75 - r + 1e-3, `y ${s2.y.toFixed(3)} x ${s2.x.toFixed(2)}`);
  }

  // 4. the ramp is climbed to the platform
  {
    const s = run(feel, start(8.5, 0.75, EAST), FWD, 5, null);
    report(name, 'ramp is climbed', near(s.y, 1.35, 1e-3) && s.x > 11.3, `y ${s.y.toFixed(3)} x ${s.x.toFixed(2)}`);
  }

  // 5. the 0.75 m door is passed
  {
    const s = run(feel, start(7.6, 4.6, SOUTH), FWD, 3, null);
    report(name, 'narrow door (0.75 m) is passed', s.z > 5.5 + r, `z ${s.z.toFixed(2)}`);
  }

  // 6. walking off the pool edge ends with the feet on the pool floor, for each depth
  for (const [label, z, depth] of [['0.3 m', 1.75, 0.3], ['0.6 m', 4.25, 0.6], ['0.9 m', 6.75, 0.9]]) {
    const s = run(feel, start(4.6, z, WEST), FWD, 3, null);
    const floor = world.groundHeight(s.x, s.z);
    report(name, `pool edge into ${label} water ends on the pool floor`, s.x < 3.5 && s.grounded && near(s.y, floor, 1e-6) && near(s.waterDepth, depth, 1e-3), `y ${s.y.toFixed(3)} depth ${s.waterDepth.toFixed(3)}`);
  }

  // 7. same result at frame times 1/30 and 1/120
  {
    const sim = (frameDt) => {
      const m = createSim(start(4.6, 6.75, EAST));
      const n = Math.round(4 / frameDt);
      for (let i = 0; i < n; i++) advance(m, { moveX: 0, moveZ: 1, lookDX: i === Math.round(1 / frameDt) ? 0.5 : 0, lookDY: 0 }, feel, world, frameDt);
      return m.state;
    };
    const a = sim(1 / 30), b = sim(1 / 120);
    const dist = Math.hypot(a.x - b.x, a.z - b.z);
    report(name, 'same result at frame time 1/30 and 1/120', dist < 0.15 && near(a.yaw, b.yaw, 1e-9), `distance ${dist.toFixed(3)} m`);
  }
}
console.log(`\n${total - fails}/${total} PASS${fails ? `, ${fails} FAIL` : ''}`);
process.exit(fails ? 1 : 0);
