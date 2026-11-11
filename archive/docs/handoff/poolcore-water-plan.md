# Poolcore water rooms: implementation plan

Source: ChatGPT chat `https://chatgpt.com/c/6ae5a202-6998-83e8-b920-a2daec2f1c6e` (plan `REVISE-PLAN-1`), checked against the code on 2026-10-31. The user ruled on all items: `docs/decisions/2026-10-31-poolcore-water-rooms.md`. Line numbers are from commit `e62c955`. Re-check them before editing.

Scope: v2 only (`?gen=v2`). Do not change v1 files (`js/world.js`, `js/regions.js`, `js/levels.js`, `js/mega.js`), the default generator, the save format, the 64 m cell, `STEP2` (0.8 m), `WADE_MAX` (1.5 m) or `POOL_MARGIN`.

Water types after the work:

| Type | Use | Rule |
|---|---|---|
| Ordinary pool | Normal rooms | rect, rrect, blob, L. No random ellipse |
| Round-pool hall | Special rectangular hall | True circle at the room centre. At least one per seed |
| Full-flood room | Bright Poolcore room, B1 | The whole open floor is shallow water |

Dark deep pools stay as they are. They do not mix with bright full-flood rooms.

## Phases

| Phase | Items | Done when |
|---|---|---|
| A | 1, 2 | Ordinary pools have no ellipse. Seeds 1 to 256 each hold one round-pool hall |
| B | 3, 4 | A B1 room is flooded edge to edge. Mesh, collision and measure agree |
| C | 5, 6 | Both stair types go down into the water and back. Columns stand on the pool floor |
| D | 7, 8 | Bright room light. Flooded B1 corridors in one cell |
| E | 9, 10 | Spiral stair. Deep-pool railings |

One commit per phase. Run `npm run test:unit` after each item. Run `npm run test:unit:full`, `npm run test:e2e` and the `js/gen2-measure.js` corpus for phase A, B and C.

## Item 1: no random ellipse

- `js/gen2.js:350-376` (`makeShape2`): drop `ellipse` from the draw. Keep `rect`, `rrect`, `blob`, `L`. Keep the relative weights of the four. An `rrect` must not shrink to a full circle.
- Keep `shapeContains` and `shapeOutline` ellipse support (`js/gen2.js:89-128`).
- Use an own random stream for any new draw. Do not change how many numbers an existing stream draws, or the other features of a room move.
- Test (`tests/unit/gen2.test.mjs:60-83`): many seeds, no ordinary pool is an ellipse, the other four shapes still appear. A directly built circle keeps correct contain, outline, mesh and collision.

## Item 2: round-pool hall, guaranteed

Guarantee: for every default v2 seed, the 16 cells i = 2..5, j = 0..3 hold at least one finished, reachable round-pool hall with a complete ring path. District (0,0) is never used.

Pick (pure function `landmarkOf(seed)`):

1. Sort the 16 cells by `hash2(seed, i, j, SALT)`. Use a new salt. Draw nothing from `ownHall`, `megaOf` or `lOf`.
2. The first cell that passes is the hall. It must be a single rectangular own hall: not a giant or L shared hall, not a cluster fragment, both sides at least 32 m, the centre free of protected geometry. `ownHall` half sides are 10 to 25 m (`js/gen2.js:620-624`), so about 36 % of own halls pass the size test.
3. Judge the cells from light layout data (`ownHall`, `spaceOf`, `districtPlan`). Do not build a full `World2.plan()` per candidate.

Fallback (only when all 16 fail): cell (2,0) gets a fixed 32 x 32 m hall, x 144..176, z 16..48, centre (160, 32). District (1,0) becomes legacy (no cluster, no shared hall). Radius 6 m, ring path 3 m. If this fixed hall cannot meet the connection and safety rules, throw a named error. Never delete the pool, never shrink it below the limits, never pick a random cell.

Pool: `hw === hd === 6`, `cx`/`cz` equal to the exact room centre, flat shallow floor, at least 3 m of free ring path.

Order in the plan:

1. Fix the hall and the reserve (pool + ring) first.
2. Keep the existing corridor mouths and district links.
3. Place stairs, voids, showcases and columns outside the reserve.
4. Build the circle with its own shape, not with `makeShape2`.
5. S2 bridges treat the reserve as hard. `plan()` now removes an ordinary pool that meets an S2 reserve (`js/gen2.js:492-524`, `js/gen2-bridge-world.js:126-145`, `js/gen2-s2-runtime.js:124-164`). The round pool must not follow that rule. Reject or re-route the bridge candidate. If a caller injects `bridgeParts` that hit the reserve, throw a named error.
6. S3 rooms must not cut the pool or the ring (`js/gen2-s3-plan.js:326-346`, `js/gen2-s3-rect.js:189-208`).

Tests (new file for the guarantee):

- Seeds 1..256: one finished round-pool hall in the 16 cells.
- Geometry: `cx`/`cz` equal the room centre, `hw === hd`, radius at least 6 m.
- Ring: a 0.5 m grid with the real body footprint. The ring is continuous and has at least one entry.
- Fallback fixture: force all 16 candidates to fail. Result: cell (2,0), the fixed hall. A fixture with an impossible hard conflict must fail with the named error.
- Order: different cell query order and a cleared cache give the same pool and the same other cells.
- Cross: `clusterShare` 0, 0.5, 1; S2 bridges on and off; S3 on and off.
- Regression: spawn, connectivity, short paths, pool collision, existing seed metrics. List every cell the fallback changes.

Honest limit: "no change to the other cells" cannot hold for the fallback district. State and measure that change.

## Items 3 and 4: full-flood room

- Add room data: normal floor height, pool-floor height, water-surface height, flooded footprint, `fullFlood` flag, and whether columns and stairs are allowed.
- Select about 10 % of the allowed B1 rooms (measure and tune). Depth 0.35 to 0.55 m, fixed, not set by tension. Use an own random stream.
- Geometry: the whole open floor of the room is one water body. Pool floor 0.4 to 0.6 m below the room floor. Water surface about 0.05 m below it. No dry rim, no pool wall at the room edge. Stairs, voids and solid columns are cut out through shared data. Render, collision and measure read one definition.
- Files: `js/gen2.js:861-874, 973-1023, 1339-1378, 1486-1507`, `js/mesh2.js:165-179, 253-315`, `js/gen2-measure.js:27-69`.
- Test: on a 0.5 m grid every open floor sample has water, the depth is in range, `surfaceAt()` equals the mesh floor, no hole and no overlapping floor. Same seed and options give the same plan.

## Item 5: stairs into the water

- Keep the stair end height. Sink the room floor under it. Allow a small structural seam, no big dry landing.
- Both straight and switchback stairs, every direction and height step (`js/gen2.js:200-245, 978-997, 1126-1143`, `js/mesh2.js:345-366, 412-432`).
- Test: the real `Player` walks 1F down to B1, into the water, turns and walks back to 1F (`tests/unit/gen2.test.mjs:246-268, 303-327`).

## Item 6: columns in the water

- Only in `fullFlood` rooms. Today `addColumns` refuses a pool (`js/gen2.js:1326`). Add the exception for this room type only.
- The column base reaches the pool floor. The water surface does not cut a solid column. Keep `COL_CLEAR` 1 m and the entry reserve.
- Files: `js/gen2.js:1304-1335, 1350-1360`, `js/mesh2.js:317-335`.

## Item 7: bright light

- Per-room: lighter, warmer tile colour, more lamps, a relaxed `B1_TINT` for this room type, light green-blue water, existing caustics. Tension and fog rules stay.
- No skylight and no reflection in this version.
- Files: `js/gen2.js:1030-1065`, `js/mesh2.js:12-26, 165-179, 253-314`, `js/main.js:71-114`.
- Test: same seed and place, compare an ordinary B1 room, a bright water room and a deep-pool room by screenshot. Check light seams between rooms.

## Item 8: flooded corridors

- B1, same cell only. A corridor that joins a `fullFlood` room takes the same water level. The junction and the door sill stay continuous in height. A room that does not flood keeps its own rules.
- The B1 maze today floods 35 % of its corridors but keeps the junctions dry (`js/gen2.js:1175-1209`).
- Test: no gap in the water, the real `Player` walks room to corridor and back, the old B1 maze tests still pass.

## Item 9: spiral stair (last)

- Special column room only. Centre column, stair around it, lower end in the water, upper end on a real floor above. Not in the ordinary stair draw. v1 `addSpiral()` (`js/facilities.js:98-125`) is a reference only.
- Test: walk every step both ways, column collision, head room, route between floors.

## Item 10: deep-pool railings

- Named deep-pool or reservoir rooms only. Railings along the dry rim, with real collision through `World2.railHit` (`js/gen2.js:1409`). Never close an entry or a stair. v1 `js/mega.js:98-117` is a reference only.
- Test: mesh and collision agree, the body cannot pass, required routes still pass, shallow pools get no railing.

## Risks to watch

| Risk | Handling |
|---|---|
| Fallback changes district (1,0) | Only when needed. Measure the path and shortcut change |
| S2 removes a round pool | Hard reserve. Reject or re-route the bridge |
| S3 cuts the ring | Reserve before the S3 plan |
| Mesh and collision disagree | One shared water definition. Real walk tests |
| First build cost | Pure function, 16-cell cap, cached |
| Caller injects conflicting data | Named error. No silent downgrade |

## Not in this plan

Round skylights, elliptic wall windows, large organic arches, live water reflection, flooding across several cells or floors, changing the default generator, v1 changes, a bright whole B1.
