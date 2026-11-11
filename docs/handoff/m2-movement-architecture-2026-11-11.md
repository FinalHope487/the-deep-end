# M2 movement architecture (K15 and the feel preset)

Date: 2026-11-11. Status: design by Fable, built by the builder session. Blueprint: `docs/handoff/sample-room-workbench-blueprint-2026-11-11.md` (sections 5, 8, 9, 10).
Scope: smooth wall slide, no snag on steps and edges, pace from a feel preset. Nothing from M3 or M4.

## 1. Facts about the code before M2 (git HEAD 8b780e5; lines will differ after M2)

| Fact | Where |
|---|---|
| The room parser reads the `floor` digit grid but nothing uses it. | `workbench/js/room.js:31,56,68` |
| Geometry draws every floor at y = 0 and every wall from 0 to the ceiling. | `workbench/js/geometry.js:75-91` |
| Solid query: `y < 0` is solid; no floor height. | `workbench/js/geometry.js:19-27` |
| Collision is 8 sample points on a circle, cell type only, no height. | `workbench/js/geometry.js:30-37` |
| Water covers every floor cell at `water-level`. | `workbench/js/geometry.js:109-120` |
| The walker has fixed speed 2.2, radius 0.25, no acceleration, no eye smoothing; keys, mouse and touch are mixed with the movement. | `workbench/js/walk.js` |
| `main.js` builds the walker and calls `walker.update(dt)` with the frame time. | `workbench/js/main.js:95-103` |

## 2. Layers

Dependencies point down. A layer must not import a layer above it.

| # | File | Kind | Purpose | Inputs | Outputs | Must not import |
|---|---|---|---|---|---|---|
| 1 | `js/move/world.js` | pure | Height, solid and water queries built once from the parsed room. | parsed room | world object (section 5) | three.js, DOM, `walk.js`, `intent.js`, `mover.js` |
| 2 | `js/move/mover.js` | pure | Fixed-step simulation of one body. | state, intent, feel, world, dt | new state | three.js, DOM, any shell file |
| 3 | `js/move/intent.js` | shell | Keyboard, mouse and touch become one intent object. | DOM events | intent | `mover.js`, `world.js`, three.js |
| 4 | `js/walk.js` | shell | Joins intent, mover, accumulator and camera. | camera, canvas, room, feel | `createWalker(camera, canvas, room, feel)` with `lookFrom`, `enable`, `disable`, `update(dt)` | nothing above it |

`geometry.js` imports `world.js` for the floor height, so the picture and the collision use the same numbers.

## 3. Intent and state

Intent (one object per step):

| Field | Unit | Meaning |
|---|---|---|
| `moveX` | -1..1 | strafe, +1 = right |
| `moveZ` | -1..1 | walk, +1 = forward |
| `lookDX` | radian | turn since the last read, +x = turn right |
| `lookDY` | radian | tilt since the last read, +y = look down |

State (feet position, world metres):

| Field | Unit | Meaning |
|---|---|---|
| `x`, `z` | m | body centre |
| `y` | m | feet height |
| `vx`, `vz`, `vy` | m/s | velocity |
| `yaw`, `pitch` | rad | view; pitch limit +-1.45 |
| `grounded` | bool | feet on the ground |
| `eye` | m | smoothed eye height in world y |
| `bob` | m | bob offset added to `eye` by the shell |
| `bobPhase` | rad | bob phase |
| `waterDepth` | m | water over the feet: `max(0, waterLevel - y)` |
| `waterDepthPrev` | m | same, one step before |
| `underwater` | bool | `eye < waterLevel` |

## 4. Feel preset (`looks/feel/*.json`)

All keys are required. A missing key is an error (blueprint section 6: no silent skip).

| Key | Unit | Range | Meaning |
|---|---|---|---|
| `walkSpeed` | m/s | 0.5 - 6 | top speed on dry ground |
| `accel` | m/s^2 | 2 - 60 | speed gain toward the wish |
| `decel` | m/s^2 | 2 - 60 | speed loss when no key is held |
| `radius` | m | 0.15 - 0.4 | body circle |
| `eyeHeight` | m | 1.2 - 1.9 | eye above feet |
| `stepHeight` | m | 0.05 - 0.6 | highest rise climbed without a stop |
| `stepSmooth` | s | 0 - 0.4 | eye follow time; 0 = no smoothing |
| `lookSensitivity` | factor | 0.3 - 3 | multiplies `lookDX`, `lookDY` |
| `bobAmp` | m | 0 - 0.06 | eye bob height |
| `bobFreq` | Hz | 0.5 - 3 | bob cycles per second at full speed |

A sheet has an optional `feel` key. When absent, the viewer loads `looks/feel/mid.json` (the same loading path as the other presets; no branch on the id).

## 5. World queries (`world.js`)

| Call | Returns |
|---|---|
| `groundHeight(x, z)` | floor height at the point; `Infinity` for a wall, an opening or outside |
| `blocked(x, z, feetY, radius, climb)` | true when the circle touches a wall cell, or a floor cell that is higher than `feetY + climb` |
| `resolve(x, z, feetY, radius, climb)` | the circle pushed out of every blocking cell, plus the summed push normals |
| `isFloor(cx, cz)`, `isRamp(cx, cz)`, `cellHeight(cx, cz, x, z)` | cell queries; `geometry.js` uses them to draw the same heights |
| `waterDepth(x, z)` | `max(0, waterLevel - groundHeight)` |
| `waterLevel` | m |

Floor height rules:
- Without a `floor` grid, every floor cell is height 0 (old rooms behave and render as before).
- A digit `d` is `d * floor-step` metres.
- A ramp cell overrides the digit (section 6).

## 6. Room format additions

The blueprint (section 5, rule 2) allows a new key only for a named reason. Reason for both: the M2 test room (feel has no picture).

| Addition | Form | Meaning |
|---|---|---|
| `floor-step` | `floor-step: 0.15` | height of one digit in the `floor` grid, in metres. Default 0.15. |
| `ramp` | `ramp: x=37..44 z=1..4 dir=E from=0.9 to=1.35` | cells (inclusive ranges) whose floor rises from `from` m at the start edge to `to` m at the far edge in direction `dir` (N, E, S, W; N = toward smaller z). |

Rules:
- `floor` rows may hold digits only.
- A ramp side must meet a wall or a floor of equal height. The geometry draws no riser at a ramp side.
- A digit step needs no new symbol: a riser is drawn where two floor cells differ in height.

## 7. Collision rules

1. The body is a circle of `radius`, on the ground plane.
2. Move by `v * dt`. Then call `resolve`: push out of each blocking cell, nearest cell first, up to 4 passes.
3. Remove only the velocity part that goes into a push normal. The rest slides along the wall.
4. A floor cell blocks only when its height at the nearest point is above `feetY + stepHeight`.
5. Ground follow after the move, at the body centre:
   - ground higher than feet: feet go up at once (step or ramp); the eye follows with `stepSmooth`;
   - ground lower and the drop is at most `stepHeight` and the body was grounded: feet snap down;
   - a larger drop: free fall (g = 9.8 m/s^2) to the ground.
6. Climbing out of water that is deeper than `stepHeight` below the edge is blocked. This is a result of rule 4.

## 8. Fixed step

- `FIXED_DT = 1/120 s`. `advance(sim, intent, feel, world, frameDt)` adds `min(frameDt, 0.1)` to an accumulator and runs `step` once per full `FIXED_DT`.
- Look deltas go into the first step of a frame; held keys apply to every step. `advance` returns the look it did not use (no full step in that frame); `intent.unread` keeps it for the next frame.
- The same input gives the same state at 30, 60 and 120 frames per second, up to the unused part of the accumulator (less than one step).

## 9. Extension points for M4

M4 does not change layers 1 to 4. It changes only these places:

| Capability | Entry | Use |
|---|---|---|
| K13 entry feedback | `state.waterDepth`, `state.waterDepthPrev` | entry = `waterDepthPrev === 0 && waterDepth > 0`; exit = the reverse; the shell reads it after `advance` |
| K14 underwater | `state.underwater`, `world.waterLevel` | the viewer switches the look when `underwater` is true |
| Slowdown by depth | `speedScale(depth, feel)` in `mover.js` (returns 1 in M2) | `wishSpeed = walkSpeed * speedScale(state.waterDepth, feel)`; M4 adds `wadeSpeed`, `swimSpeed` keys |

Not available in M2: the water look uses `room.waterLevel` as depth everywhere (`kit/water.js`); it does not follow the floor height.

## 10. Not in M2

Jump, swim, dive, slide, crouch, sound, K13, K14, K6, rooms or presets beyond the test room and the three feel presets, any sheet page (M3).

## 11. Test room and presets

- Room `rooms/feel-test.room.txt`: unit 0.25 m, `water-level: 0.9`, `floor-step: 0.15`. Contains a 0.15 m step, a 0.45 m block, a ramp (0.9 to 1.35 m over 2 m), a door 0.75 m wide, a pool edge, and three pools of depth 0.3, 0.6 and 0.9 m.
- Presets: `looks/feel/heavy.json`, `mid.json`, `light.json`. Sheets: `sheets/m2-feel-heavy.json`, `m2-feel-mid.json`, `m2-feel-light.json`.
- World position of an interior metre `m` is `0.25 + m` (the border wall is one cell). Door gap: x 7.25 to 8.0, z 5.25 to 5.5. Ramp: x 9.25 to 11.25, z 0.25 to 1.25, platform to x 12.25. High block: x 7.75 to 9.25, z 2.25 to 4.25. Low step: x 5.25 to 6.75, same z. Pools (x 0.25 to 3.75): depth 0.3 at z 0.75 to 2.75, 0.6 at z 3.25 to 5.25, 0.9 at z 5.75 to 7.75. Dry floor is height 0.9.
- The feel is judged only by the user, by walking.

## 12. How to check

| Check | Command |
|---|---|
| Invariants, no browser | `node workbench/feel-check.mjs` |
| Old picture unchanged | `node workbench/shots.mjs m1-pool15-e5 --stage=final --out=water-e5-t5` |
| Test room picture | `node workbench/shots.mjs m2-feel-mid --stage=final --out=m2-feel-room` |
| Walk on desktop or phone | `node workbench/serve.mjs --lan`, then open `/index.html?sheet=m2-feel-mid&stats=1` |

`feel-check.mjs` prints PASS or FAIL for each invariant and each preset: no NaN; never inside a wall; a 45 degree wall run keeps more than half of the speed along the wall; a low step is climbed and a high one blocks; the ramp is climbed; the door is passed; walking off the pool edge ends with the feet on the pool floor for each depth; the same result at frame times 1/30 and 1/120.
