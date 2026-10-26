# Handoff T0 — Stage 02B Completion
## 1 Goal
Complete Stage 02B of the v2 map generator.
Use narrower corridors and lower corridor ceilings.
Keep accepted corridors walkable by the real body.
Add one middle connector room to each accepted diagonal longer than 36 m.
Limit continuous corridor stretches to 36 m on the shortest graph path between neighbouring halls.
Use height-aware Dijkstra for the body-walk cross-check.
Keep pruning and graph measurement.
Remove the walk-mean acceptance gate.
Use four ordered implementation steps and one green commit.
## 2 Scope
### Files to change
- `js/gen2.js`
- `js/gen2-measure.js`
- `js/main.js`
- `tests/unit/reach.mjs`
- `tests/unit/gen2-connections.test.mjs`
- `tests/unit/gen2-detour-walk.test.mjs`
- `tests/e2e/gen2.spec.js`
### Files that must not change
- `js/world.js`
- `js/regions.js`
- `js/cells2.js`
- `js/save.js`
- All prefab files.
- Default generator selection.
- Save schema.
Use plain JavaScript ES modules.
Do not add dependencies.
Keep geometry functions pure.
Keep generation independent of cell planning order.
Preserve unrelated user edits.
Stage only T0 changes.
## 3 Fixed premises
### 3.1 Existing code facts
These references describe existing code, not new requirements.
- `js/gen2.js:8-9`: `CELL2=64`, `Q2=0.5`.
- `js/gen2.js:12-13`: `STEP2=0.8`, `BODY_R2=0.4`.
- `js/gen2.js:350-359`: `edgeCorridor2`, salts `7101/7102`.
- `js/gen2.js:362-389`: `World2`, plan cache.
- `js/gen2.js:379-387`: Cache eviction occurs before insertion when size exceeds 400.
- `js/gen2.js:465-562`: Edge links, portals, and routes.
- `js/gen2.js:509-515`: Existing portal bounds.
- `js/gen2.js:528-562`: Route jog selection and rectangles.
- `js/gen2.js:583-625`: Diagonals, salt `7950`.
- `js/gen2.js:629-769`: Cell plan construction.
- `js/gen2.js:772-790`: Existing eight-argument `addSwitchback`.
- `js/gen2.js:1050-1059`: `safePoint()` and `restPoint(i,j)`.
- `js/gen2-measure.js:117-180`: Hall-centre graph measurement.
- `js/gen2-measure.js:187,224-240`: Route-length quantiles and diagonal orientation counts.
- `tests/unit/reach.mjs:1-65`: Height-aware reach and h=0 walk BFS.
- `tests/unit/gen2-detour-walk.test.mjs:69-101`: Existing 10-pair body cross-check.
- `js/main.js:838-859`: L-hall fixture and lane checks.
- `js/main.js:309-332`: Saved-position validation and fallback.
- `js/save.js:21-52`: Save version 1 stores position data, not generated rectangles.
- `js/player.js:35-54`: Public body collision checks.
### 3.2 World geometry
Cells measure 64x64 m.
Rectangle edges use the 0.5 m grid.
Floors use `lv=-1,0,1`.
The body has a 0.4 m half-side and a 1.6 m eye height.
The highest step is 0.8 m.
Each cell has a primary hall.
Ordinary halls have sides from 20 m to 50 m.
Hall centres stay within 3 m of cell centres.
Hall ceilings stay between 4 m and 6 m, subject to existing upper-floor limits.
Ordinary halls do not touch cell boundaries.
Shared halls can cross cell boundaries.
Rooms are axis-aligned rectangles.
Walls are implicit.
Touching rooms form open floor space.
### 3.3 Fixed decisions D1–D8
**D1 — Pruning:** Keep `PRUNE_SHARE=0.7`.
Close at most one ordinary inner link per 2x2 district.
Choose its shortest eligible ordinary link.
Never close seams, connector-room links, or inter-district links.
Do not cap pruning detours.
**D2 — Acceptance:** Require a maximum corridor stretch of 36 m.
A hall or connector room breaks a stretch.
Measure the shortest graph path between every neighbouring hall pair.
For equal walk distances, prefer the smaller maximum stretch.
Keep `measureWalks` as a report.
Do not add walk-mean or p90 gates.
**D3 — Ordinary widths:** Use `[1.5,2,2,2.5,3,3.5]` m.
Apply to ordinary corridors, connector stubs, doglegs, and winding routes.
Shift centres by positive 0.25 m for widths 1.5, 2.5, and 3.5 m.
Never use negative 0.25 m.
**D4 — Diagonal widths:** Use `[1.5,2,2,2.5]` m.
**D5 — Corridor ceilings:** Use `[2,2.5,3]` m.
Give each value probability one third before geometry rejection.
Apply to ordinary corridors, stubs, routes, and diagonals.
Exclude halls, connector rooms, and B1 maze corridors.
Keep connector-room ceilings at 3.5–4.5 m.
Keep existing hall ceilings.
Keep the showcase head formula:
    Math.min(2.4, hall.ceil - 0.4, o.ceil - 0.4)
**D6 — Edge connector rooms:** Keep widths at 12–16 m.
Keep depths at 8–10 m per side, with existing near-hall reductions.
Leave at least 4 m of corridor between each hall and connector room.
Do not apply these widths to diagonal middle rooms.
**D7 — Diagonal rooms:** Add one middle room for accepted diagonal lengths above 36 m.
Try 8x8 m, then 6x6 m.
Reject an orientation when both sizes fail.
Try the opposite orientation before returning `null`.
**D8 — Routes:** Do not cap `route.length`.
Use axial wall-to-wall distance for route stretch.
Cap that distance at 36 m.
Keep full route length for graph-walk costs and route-length reports.
### 3.4 Gallery decision
Do not add 4–10 m gallery corridors in Stage 02B.
Do not add gallery ceilings, side openings, or columns.
Build wide passages as rooms in later room-cluster stages.
Keep D3 and D5 for all Stage 02B corridors.
## 4 Data and functions
### 4.1 Grid functions
Add these private pure functions in `js/gen2.js`:
    function snapCentre2(v, w) {
      return Math.round((v - w / 2) / Q2) * Q2 + w / 2;
    }
    function phase2(w) {
      return snapCentre2(0, w);
    }
    function centreBounds2(lo, hi, w) {
      const a = Math.ceil((lo - w / 2) / Q2) * Q2 + w / 2;
      const b = Math.floor((hi - w / 2) / Q2) * Q2 + w / 2;
      return a <= b ? [a, b] : null;
    }
    function drawCentre2(r, lo, hi, w) {
      const bounds = centreBounds2(lo, hi, w);
      if (!bounds) return null;
      const [a, b] = bounds;
      const count = Math.round((b - a) / Q2) + 1;
      return a + Math.floor(r() * count) * Q2;
    }
Round interval bounds inward.
Return `null` for empty intervals.
Consume one draw for a nonempty `drawCentre2` interval.
Consume zero draws for an empty interval.
Use `w=0` for Q2-aligned centres.
Required phases:
    width:  1.5   2   2.5   3   3.5
    phase:  0.25  0   0.25  0   0.25
Apply the phase exactly once.
### 4.2 Edge corridor generation
Keep:
    edgeCorridor2(seed, i, j, axis)
    edgeSalt2 = { x: 7101, z: 7102 }
Use:
    function edgeCorridor2(seed, i, j, axis) {
      const r = mulberry32(hash2(seed, i, j, edgeSalt2[axis]));
      return {
        t: snapIn2(r, -4, 4),
        w: [1.5, 2, 2, 2.5, 3, 3.5][(r() * 6) | 0],
        ceil: [2, 2.5, 3][(r() * 3) | 0]
      };
    }
Keep draw order `t,w,ceil`.
Use one draw for each field.
Keep `corridor.t` Q2-aligned.
Calculate every ordinary corridor centre with:
    middle + corridor.t + phase2(corridor.w)
Apply this calculation in `linkRects`, `makePlan`, and `routeOf`.
Keep edge connector-room body centres at:
    middle + corridor.t
Do not phase-shift the edge connector-room body.
Phase-shift its narrow corridor stubs.
Keep both stubs inside the connector-room body.
Keep the edge connector-room identifier:
    `v2:space:${axis}:${i},${j}:connector`
### 4.3 Portal placement
Keep:
    portalOf(c, i, j, half, A, B)
Keep salts `7811/7812`.
Use:
    PORTAL_SHARE = 0.15
    PORTAL_MIN = 7
    PORTAL_CLEAR = 2
Use `half=8` for edge connector rooms.
Use `half=corridor.w/2` for ordinary corridors.
Calculate:
    const p = phase2(c.corridor.w);
    const shift = half === 8 ? 0 : p;
`AcrossLo` is the larger transverse lower boundary of both halls.
`AcrossHi` is the smaller transverse upper boundary.
Calculate:
    const lo = AcrossLo - middle + half + 2 - shift;
    const hi = AcrossHi - middle - half - 2 - shift;
    const positive = [Math.max(lo, 7 - shift), hi];
    const negative = [lo, Math.min(hi, -7 - shift)];
Round both intervals inward to Q2.
Discard empty intervals.
Keep valid intervals in positive, negative order.
Use this draw sequence:
1. Draw the `PORTAL_SHARE` roll.
2. Return the original connection when the roll fails.
3. Filter the two intervals.
4. Return the original connection when no interval survives.
5. Draw once to select a surviving interval.
6. Draw once with `drawCentre2(r,a,b,0)` for `corridor.t`.
Consume no selection draws when the intervals are empty.
Use `shift=0` for edge connector-room portal selection.
Check the actual centre offset against the 7 m minimum.
Keep 2 m portal clearance.
### 4.4 Routes
Keep:
    routeOf(c, i, j, A, B)
Keep salts `7821/7822`.
Keep:
    ROUTE_SHARE = 0.2
    WIND_SHARE = 0.5
    JOG_MAX = 7
Keep kinds `dogleg` and `winding`.
Keep the route shape:
    { kind, rects, line, length, across }
Use the phase-adjusted corridor centre for `cA`.
For each `away` operation, calculate the existing negative and positive candidate intervals.
Filter each interval with `centreBounds2(lo,hi,w)` before selecting a side.
Keep negative, positive order.
Draw once to select a side.
Use `drawCentre2(r,lo,hi,w)` for its across-axis centre.
Use `drawCentre2(r,lo,hi,w)` for each along-axis jog centre.
Return the original connection when a required interval is empty.
Do not consume selection draws for empty intervals.
Keep the existing jog draw order and route rectangle construction.
Keep every rectangle edge on Q2.
Keep every route centreline inside its rectangles.
Keep:
    length = b0 - a1 +
      stops.reduce((sum, [, v0, v1]) =>
        sum + Math.abs(v1 - v0), 0);
Do not cap `length`.
### 4.5 Diagonal stream
Keep:
    diagonalOf(a, b)
Change the helper signature to:
    diagonalTry(a, b, orientation, w, halls, others, middleCeil)
Keep `DIAG_SHARE=0.5` and salt `7950`.
Draw in this order:
1. Diagonal share.
2. First orientation.
3. Width from `[1.5,2,2,2.5]`.
4. Ceiling from `[2,2.5,3]`.
5. `middleCeil = snapIn2(r,3.5,4.5)`.
Return `null` immediately when the share roll fails.
Draw `middleCeil` once before orientation attempts.
Draw it even when the diagonal does not need a middle room.
Reuse it for both orientations.
Keep orientation order `[first,1-first]`.
Do not add a salt or consume the cell plan stream.
Keep:
    const sx = orientation ? -1 : 1;
    const h = w / 2;
    const Cx = (2 * a + 1) * CELL2;
    const xs = Cx - sx * (1 + h);
    const z1 = HP.z1 - h - 2;
    const z3 = HQ.z0 + h + 2;
Do not add 0.25 m to these coordinates.
Keep the existing three corridor rectangles and collision checks.
### 4.6 Diagonal result
Return:
    {
      id, orientation, cells,
      fromSpaceId, toSpaceId,
      w, ceil, rects, line, length,
      middleRoom, corridorLengths, stretch
    }
Use:
    id = `v2:diag:${a},${b}`
For `length<=36`, set:
    middleRoom = null;
    corridorLengths = [length, 0];
    stretch = length;
For `length>36`, require one middle room.
Set:
    corridorLengths = [entry, length - exit];
    stretch = Math.max(...corridorLengths);
Reject the candidate when either corridor length exceeds 36 m.
### 4.7 Diagonal middle-room data
Use:
    middleRoom = {
      spaceId: `v2:space:diag:${a},${b}`,
      kind: 'connector-room',
      lv: 0,
      x0, x1, z0, z1,
      ceil: middleCeil,
      lampGrid: { ox: x0, oz: z0, step: 6 }
    };
Try sizes `[8,6]` m in order.
Use half-sizes `[4,3]` m.
Keep the centre and rectangle edges on Q2.
Use one common `spaceId` across fragments.
### 4.8 Middle-room placement
Use the centreline clipped to the two hall walls:
    [
      [wP, z1],
      [xs, z1],
      [xs, z3],
      [wQ, z3]
    ]
Calculate its cumulative Manhattan length.
Find the point at `length/2`.
Snap its x and z coordinates independently with `snap2`.
Use the same centre for both candidate sizes.
For each candidate, calculate:
    x0 = centreX - halfSize
    x1 = centreX + halfSize
    z0 = centreZ - halfSize
    z1 = centreZ + halfSize
Reject when `overlap2(square,H,1)` holds for any district hall.
Reject when `overlap2(square,q,1)` holds for any unrelated link rectangle.
Permit intersections with the diagonal's own corridor rectangles.
Require positive-area contact with its own corridor.
Clip each axis-aligned centreline segment against the square.
Use inclusive boundaries.
Convert intersections to cumulative wall-to-wall distances.
Sort intervals by entry distance.
Merge touching or overlapping intervals.
Require exactly one positive-length interval `[entry,exit]`.
Require:
    0 < entry && entry < exit && exit < length
Calculate `corridorLengths` from this interval.
Reject when either length exceeds 36 m.
Try 6x6 m after an invalid 8x8 m square.
Try the other orientation after both sizes fail.
Return `null` when both orientations fail.
Do not add a middle room for `length===36`.
### 4.9 Middle-room fragments
In `makePlan`, insert fragments after diagonal corridor fragments.
Insert them before flights, voids, pools, and columns.
Use the existing `clip` and `room` helpers.
For each valid clipped rectangle, create:
    const o = room(0, cut, middleCeil, 'connector-room');
    o.spaceId = diag.middleRoom.spaceId;
    o.span = 'connector';
    o.grid = diag.middleRoom.lampGrid;
    o.seams = { px: false, nx: false, pz: false, nz: false };
Keep numeric room IDs unique inside each cell.
Set `px/nx/pz/nz` when the complete room crosses the respective cell boundary.
Require positive room area on both sides.
Do not create seams for boundary contact alone.
For x seams, use:
    { lo: middleRoom.z0, hi: middleRoom.z1 }
For z seams, use:
    { lo: middleRoom.x0, hi: middleRoom.x1 }
Keep the shared 6 m lamp grid.
Keep seam-aware lamp placement.
Keep diagonal corridor `diagId` values unchanged.
### 4.10 Feature exclusions
After diagonal insertion, define in `makePlan`:
    const diagAvoid = diag?.middleRoom
      ? [clip(diag.middleRoom)].filter(Boolean)
      : [];
    const featureMouths = mouths.concat(diagAvoid);
Pass `featureMouths` to:
- `addSwitchback`
- `flightSlot2`
- `addVoids`
- `addSplit`
- `addShowcase`
- `addColumns`
For straight flights, call:
    flightSlot2(
      r, hall, len,
      featureMouths.concat(plan.flights)
    )
Change the switchback signature to:
    addSwitchback(
      plan, r, hall, mouths, lv, ox, oz,
      room, diagAvoid = []
    )
Call from `makePlan` with:
    this.addSwitchback(
      plan,
      mulberry32(hash2(this.seed, i, j, 7500 + lv)),
      hall, featureMouths, lv, ox, oz,
      room, diagAvoid
    )
Keep `diagAvoid=[]` for other callers.
Keep the existing switchback random stream.
In `addSwitchback`, calculate `entry` after selecting the flight candidate.
Reject the candidate when:
    diagAvoid.some(q => overlap2(entry, q, 1))
Return `false` before calling `room(...)` or `plan.flights.push(...)`.
Keep the fallback to a straight flight.
For straight flights, calculate `hallEntry` before creating the destination room.
Reject when:
    diagAvoid.some(q => overlap2(hallEntry, q, 1))
Do not mutate the plan before these rejection checks.
Append `diagAvoid` to the hall pool blockers.
Use these blockers in `addPool` and `addFallbackPool`.
Do not create pools or columns inside the middle room.
Do not include the diagonal's own corridor rectangles in `diagAvoid`.
Permit overlap between the middle room and its own corridor.
Do not reject 2F or B1 rooms solely for horizontal overlap with the 1F middle room.
Reject 1F flight entries that violate clearance.
Do not consume `plan.r` for the middle room or its exclusions.
### 4.11 Height-aware `walkLength`
Keep:
    walkLength(w, x0, z0, x1, z1, start, done)
Replace FIFO BFS with weighted Dijkstra.
Keep states `[x,z,h]`.
Use keys:
    `${x},${z},${Math.round(h * 4)}`
Use cardinal moves:
    [[0.5,0],[-0.5,0],[0,0.5],[0,-0.5]]
Charge 0.5 m per cardinal move.
Keep destinations inside the search bounds.
Set `Player.x` and `Player.z` to the source before each `canStand`.
Use `w.surfaceAt(nx,nz,h).h` after a valid cardinal move.
Use the existing `reachSet` ladder rule.
Calculate:
    foot = [
      l.x + l.nx * 0.75,
      l.z + l.nz * 0.75,
      l.h0
    ];
    top = [
      l.x - l.nx * 0.45,
      l.z - l.nz * 0.45,
      l.h1
    ];
Allow both ladder directions.
Require source height difference below 0.3 m.
Require source horizontal distance below 0.75 m.
Snap landing candidates to the start's 0.5 m lattice.
Use the existing floor/ceiling candidate order.
Reject out-of-bounds landings.
Reject landings that fail `Player.canStand`.
Choose the valid landing nearest the ladder endpoint.
Keep candidate order for equal distances.
Charge:
    Math.hypot(
      land[0] - x,
      land[1] - z,
      land[2] - h
    )
Use an indexed binary min-heap with decrease-key.
Store at most one heap entry per discovered state.
Compare entries by:
    [distance, x, z, Math.round(h * 4)]
Ignore equal-cost updates.
Keep heap memory bounded by discovered states.
Return `0` when the start satisfies `done(x,z,h)`.
Return the shortest settled distance when a target is removed from the heap.
Return `Infinity` when the target is unreachable.
Keep `reachSet` and `reaches` signatures unchanged.
### 4.12 Graph measurement
Keep:
    measureWalks(w, cells)
Do not import private `phase2`.
Define locally in `js/gen2-measure.js`:
    const corridorPhase2 = (w) =>
      Math.round(-w / (2 * Q2)) * Q2 + w / 2;
For every non-route corridor link, including edge connector-room stubs, use:
    centre = middle + c.corridor.t +
      corridorPhase2(c.corridor.w);
This centre represents the narrow corridor, not the connector-room body.
Keep edge connector-room body rectangles centred at `middle+t`.
Use `c.route.across` for route endpoint centres.
Keep the existing hall-centre graph and Dijkstra.
Keep the full `route.length` in graph-walk costs.
Keep `dg.length` in the diagonal object and graph-walk cost.
Use these stretch values:
    seam:           0
    straight:       c.gaps[0] + c.gaps[1]
    route:          c.gaps[0] + c.gaps[1]
    connector-room: Math.max(stubA, stubB)
    diagonal:       dg.stretch
Keep the existing connector-stub geometry calculation.
Keep the route-length quantiles.
Keep the diagonal orientation counts.
Do not add a diagonal-length report API.
Keep stretch kinds:
    'seam'
    'straight'
    'connector stub'
    'route dogleg'
    'route winding'
    'diagonal'
For equal graph distances, prefer smaller maximum stretch.
Keep returned fields:
    { i, j, axis, walk, closed, stretch, stretchKind }
Do not add walk-mean or p90 acceptance gates.
### 4.13 L-hall fixture
Change `gen2L` in `js/main.js`.
Keep district ring scan `r=0..8`.
For arm A's outward x edge, calculate:
    const ei = dx > 0 ? A.i : A.i - 1;
    const link = w.connectionOf(ei, A.j, 'x');
Require:
    link.mode === 'corridor'
    !link.route
    link.corridor.w >= 2.5
Find the corresponding corridor in arm A's plan.
Require `kind==='corridor'` and `lv===0`.
Reject rectangles with `diagId` or `routeId`.
Match the outward cell edge exactly.
Require transverse width `===link.corridor.w`.
Continue scanning after failed candidates.
Throw this exact error after scan exhaustion:
    throw new Error(
      'gen2L: no non-route corridor with width >= 2.5 m in 8 district rings'
    );
Use `[-0.5,0,0.5]` lane offsets for both legs.
Keep the 0.4 m body half-side.
Keep path sampling at 0.5 m.
Keep existing return fields and walking durations.
Keep both outward and return walks.
## 5 Procedure
Use four ordered steps.
Write the red test before each implementation.
Do not commit intermediate red states.
Keep the existing red 36 m gate visible.
Do not skip or remove it.
Use targeted checks during Steps 1–3.
Commit one green snapshot after Step 4.
### Step 1 — Height-aware walk
Files: `tests/unit/reach.mjs`, `tests/unit/gen2-detour-walk.test.mjs`.
1. Add the four public tests in Section 6.7.
2. Update the 10-pair test in Section 6.8.
3. Run these tests against the h=0 helper.
4. Confirm the expected red results.
5. Implement Section 4.11.
6. Run `node --test tests/unit/gen2-detour-walk.test.mjs`.
7. Require the new tests to pass.
### Step 2 — Geometry and fixture
Files: `js/gen2.js`, `js/main.js`, `tests/unit/gen2-connections.test.mjs`, `tests/e2e/gen2.spec.js`.
1. Add the geometry test in Section 6.2.
2. Confirm failure against the old distributions.
3. Implement Sections 4.1–4.5, excluding diagonal middle rooms.
4. Implement Section 4.13.
5. Run `node --test tests/unit/gen2-connections.test.mjs`.
6. Run the full L-hall e2e path with the desktop project.
7. Require the new geometry and L-hall assertions to pass.
### Step 3 — Route measurement
Files: `js/gen2-measure.js`, `tests/unit/gen2-connections.test.mjs`.
1. Add the route stretch test in Section 6.4.
2. Confirm failure against the previous route stretch.
3. Implement route measurement in Section 4.12.
4. Preserve existing graph-walk costs and route reports.
5. Run `node --test tests/unit/gen2-connections.test.mjs`.
6. Require the route stretch test to pass.
### Step 4 — Diagonal middle room
Files: `js/gen2.js`, `js/gen2-measure.js`, `tests/unit/gen2-connections.test.mjs`, `tests/unit/gen2-detour-walk.test.mjs`.
1. Add diagonal tests from Sections 6.5–6.6.
2. Retain the existing red 36 m gate.
3. Confirm the expected red results.
4. Implement Sections 4.6–4.10.
5. Update diagonal measurement in Section 4.12.
6. Run the complete unit suite.
7. Run the complete desktop e2e suite.
8. Require all tests to pass.
9. Inspect the staged diff.
10. Commit only T0 changes in one green commit.
Use:
    npm run test:unit
    npm test -- --project=desktop
Keep all four steps in one commit when the existing red gate prevents green intermediate snapshots.
Do not weaken the gate.
## 6 Acceptance tests
### 6.1 Corpus
Use `CORPUS` from `js/gen2-measure.js`.
Seeds:
    [1,2,3,7,42,99,1234,20261024]
Cells:
    -4 <= i <= 3
    -4 <= j <= 3
Require 8 seeds, 64 cells per seed, and 896 neighbouring pairs.
### 6.2 Corridor geometry
File: `tests/unit/gen2-connections.test.mjs`.
Test name:
    connections: Stage 02B widths ceilings and rectangle edges follow the Q2 grid
For each non-closed ordinary link, assert:
    [1.5,2,2,2.5,3,3.5].includes(c.corridor.w)
For each accepted diagonal, assert:
    [1.5,2,2,2.5].includes(d.w)
For each 1F corridor room, including routes and stubs, assert:
    [2,2.5,3].includes(room.ceil)
Exclude B1 maze corridors and connector rooms.
Count ceilings by non-closed corridor link.
Require each ceiling value in 25–42% of these links.
For every corridor, route, diagonal, and middle-room rectangle, assert:
    [x0,x1,z0,z1].every(v =>
      v / Q2 === Math.round(v / Q2))
Calculate corridor centres from public rectangle boundaries.
For non-route links, assert:
    (rectAcross0 + rectAcross1) / 2 ===
      middle + c.corridor.t +
      (Math.round(-c.corridor.w / (2 * Q2)) * Q2 +
       c.corridor.w / 2)
Include edge connector-room corridor stubs.
Do not apply this formula to connector-room body centres.
Use public route rectangles to verify jog phases.
Do not call private `phase2` in tests.
For edge connector-room bodies, assert:
    width >= 12 && width <= 16
Exclude rooms with `spaceId` beginning `v2:space:diag:`.
Require matching ceilings across both edge connector-room fragments.
Keep the portal tests.
Require at least 24 offset portals.
Require:
    off.length < ACTIVE.length / 4
Require positive and negative offsets on both axes.
Require offset ordinary corridors and edge connector rooms.
Require actual offsets of at least 7 m.
Require 2 m portal clearance.
Require aligned corridor ends.
Keep route geometry assertions:
    dogleg + winding >= 24
    winding >= 8
    routed.length < (ordinary.length + routed.length) / 4
Require routes on both axes.
Require three rectangles per dogleg and five per winding route.
Require full-width rectangle overlap.
Require one ceiling per route.
Require flat, body-walkable route centrelines.
### 6.3 Edge connector-room regression
File: `tests/unit/gen2-connections.test.mjs`.
Keep existing edge connector-room tests.
Require widths 12–16 m.
Require depths 8–10 m with existing near-hall reductions.
Require 4 m minimum corridor stubs.
Require connected halves across cell boundaries.
Require matching seam intervals and ceilings.
Keep collision and shared-lamp tests.
Keep the seed 1 sample with 12.5 m maximum stub stretch.
Exclude diagonal middle rooms from edge connector-room size tests.
### 6.4 Route stretch
File: `tests/unit/gen2-connections.test.mjs`.
Test name:
    walks: route stretch is the wall-to-wall axial gap, not the route length
For every routed link, assert:
    c.route.length > c.gaps[0] + c.gaps[1]
Measure each route in an isolated two-cell graph.
Assert:
    measured.stretch === c.gaps[0] + c.gaps[1]
    measured.stretch <= 36
Keep full route length in graph costs and existing route-length quantiles.
Do not require `route.length<=36`.
### 6.5 Diagonal middle rooms
File: `tests/unit/gen2-connections.test.mjs`.
Test name:
    diagonals: middle connector rooms split long corridor runs
For every accepted diagonal, assert:
    d.stretch <= 36
For `d.length<=36`, assert:
    d.middleRoom === null
    d.corridorLengths[0] === d.length
    d.corridorLengths[1] === 0
    d.stretch === d.length
For `d.length>36`, assert:
    d.middleRoom !== null
    d.middleRoom.kind === 'connector-room'
    d.middleRoom.lv === 0
    d.middleRoom.spaceId === `v2:space:diag:${a},${b}`
Require 8x8 m or 6x6 m.
Require ceiling 3.5–4.5 m.
Require lamp step 6 m.
Require Q2-aligned edges.
Require 1 m clearance from district halls and unrelated links.
Require positive-area contact with its own corridor.
Require one positive centreline intersection interval.
Assert:
    d.corridorLengths.every(v => v <= 36)
    d.stretch === Math.max(...d.corridorLengths)
Require shared `spaceId` across fragments.
Require unique numeric room IDs per cell.
Require matching middle-room seams.
Require accepted diagonals walkable in both directions.
Require accepted orientations 0 and 1.
Require an accepted diagonal in a negative district.
### 6.6 Diagonal determinism
File: `tests/unit/gen2-connections.test.mjs`.
Test name:
    diagonals: middle rooms remain deterministic after cache eviction
Enumerate candidates in this exact order:
    for (const seed of CORPUS.seeds)
      for (let b = -2; b <= 1; b++)
        for (let a = -2; a <= 1; a++)
For each candidate, calculate:
    const w = new World2(seed);
    const d = w.diagonalOf(a, b);
Select the first candidate satisfying:
    (a < 0 || b < 0) &&
    d !== null &&
    d.middleRoom !== null
Require an actual accepted long diagonal with a middle room.
Fail the test when no candidate exists.
Do not skip it.
Use the selected district's four cells:
    [
      [2*a,   2*b],
      [2*a+1, 2*b],
      [2*a,   2*b+1],
      [2*a+1, 2*b+1]
    ]
Create all four plans.
Store complete plan JSON and diagonal JSON.
Request exactly 451 distinct other plans:
    for (let k = 0; k < 451; k++)
      w.plan(1000 + k, 1000);
These coordinates exclude the selected district cells.
Assert all four original plans have left the cache.
Recreate the four plans in reverse order.
Assert exact JSON equality for each plan.
Assert exact JSON equality for the diagonal.
Check orientation, width, ceiling, bounds, corridor lengths, fragments, and `spaceId`.
### 6.7 Public body-walk tests
File: `tests/unit/gen2-detour-walk.test.mjs`.
Use the real `Player` through `walkLength`.
Define this deterministic world:
    function ladderWorld(withLadder = true) {
      const floors = [
        {
          x0: -0.5, x1: 0.5,
          z0: -0.5, z1: 0.5, h: 0
        },
        {
          x0: 1, x1: 2.5,
          z0: -0.5, z1: 0.5, h: 4
        }
      ];
      const ladder = {
        x: 0.75, z: 0, nx: -1, nz: 0,
        h0: 0, h1: 4
      };
      const floorAt = (x, z, h) => floors.find(f =>
        x >= f.x0 && x < f.x1 &&
        z >= f.z0 && z < f.z1 &&
        Math.abs(f.h - h) <= 0.8
      );
      return {
        bodyR: 0.4,
        blockedAt(x, z, h) {
          return !floorAt(x, z, h);
        },
        surfaceAt(x, z, h) {
          const f = floorAt(x, z, h);
          return f ? { h: f.h, wl: NaN } : null;
        },
        railHit() {
          return false;
        },
        planAt() {
          return {
            ladders: withLadder ? [ladder] : []
          };
        }
      };
    }
Do not mock private Dijkstra methods.
Test public path results.
**Test name:**
    walkLength: start at target returns zero
Call:
    walkLength(
      ladderWorld(), -0.25, -0.25, 2.25, 0.25,
      [0,0,0],
      (x,z,h) => x === 0 && z === 0 && h === 0
    )
Assert exactly `0`.
**Test name:**
    walkLength: disconnected floors are unreachable without ladder
Call:
    walkLength(
      ladderWorld(false), -0.25, -0.25, 2.25, 0.25,
      [0,0,0],
      (x,z,h) => x === 1.5 && z === 0 && h === 4
    )
Assert exactly `Infinity`.
**Test name:**
    walkLength: ladder cost uses 3D distance in both directions
Use `ladderWorld(true)`.
Call from `[0,0,0]` to `[1.5,0,4]`.
Call from `[1.5,0,4]` to `[0,0,0]`.
Use bounds:
    [-0.25,-0.25,2.25,0.25]
Require both distances finite.
For each direction, assert:
    Math.abs(result - Math.hypot(1.5, 4)) <= 1e-9
**Test name:**
    walkLength: ladder landing stays inside search bounds
Call:
    walkLength(
      ladderWorld(true),
      -0.25, -0.25, 0.25, 0.25,
      [0,0,0],
      (x,z,h) => x === 1.5 && z === 0 && h === 4
    )
Assert exactly `Infinity`.
Do not assert private heap contents or state keys.
### 6.8 Ten-pair body cross-check
File: `tests/unit/gen2-detour-walk.test.mjs`.
Test name:
    walks: the graph estimate is near a body's shortest height-aware walk, for the longest pairs on both axes
Select the five longest graph-estimated pairs on each axis.
Require exactly 10 samples.
Require at least one negative cell coordinate.
Keep existing dry-point selection and district bounds.
Use target:
    (x,z,h) => x === e[0] && z === e[1] && h === 0
For every sample, assert:
    Number.isFinite(body)
    Number.isFinite(estimate)
    Math.abs(body - estimate) <= 0.25 * estimate
Keep the symmetric 25% assertion.
Do not replace it with `body<=estimate*1.25`.
### 6.9 Final 36 m gate
File: `tests/unit/gen2-connections.test.mjs`.
Keep this exact test:
    walks: on the shortest way between every two neighbouring halls no corridor stretch is longer than 36 m
Collect all corpus pairs.
Assert:
    pairs.length === 896
    pairs.every(p => Number.isFinite(p.walk))
    pairs.every(p => Number.isFinite(p.stretch))
    pairs.filter(p => p.stretch > 36).length === 0
    Math.max(...pairs.map(p => p.stretch)) <= 36
Keep diagnostics for seed, axis, coordinates, closed status, stretch, and stretch kind.
Keep the shortest-path tie rule.
Do not add a walk-mean gate.
### 6.10 L-hall e2e
File: `tests/e2e/gen2.spec.js`.
Keep the existing test name:
    v2 L 形大廳：從外面的普通走廊走進一臂、過格邊進轉角、轉彎過另一條格邊到另一臂，再走回走廊
Require a non-null `gen2L` result.
Require all three hall cells loaded.
Require the chosen corridor width at least 2.5 m.
Require no route on its link.
Use `[-0.5,0,0.5]` for both legs.
Walk from the exterior corridor into arm A.
Cross seam A and turn through the corner.
Cross seam B into arm B.
Return through both seams to the exterior corridor.
Keep existing displacement checks.
Require `floorH===0` at the corner, arm B, and final corridor.
Keep:
    (home.x - g.hallX) * g.dx > 0.25
Require no browser errors.
### 6.11 Regression and commit acceptance
Keep existing tests for:
- Giant halls and L halls.
- Edge connector rooms and stubs.
- Portal offsets and turning corridors.
- Diagonals and closed inner links.
- Negative cells and planning order.
- Cache eviction.
- Floors, flights, pools, voids, columns, and mesh.
- Real body collision and walking.
- Save and continue.
Run:
    npm run test:unit
    npm test -- --project=desktop
Require exit code 0 from both.
Require all Section 6 tests to pass.
Inspect the staged diff before committing.
Exclude unrelated dirty user edits.
Create one final green T0 commit.
## 7 Out of scope
Do not implement Stage 01 room clusters or district room plans.
Do not change room counts, packing, shared-wall openings, or cluster topology.
Do not implement distance-based room links.
Do not add gallery corridors.
Do not change 2F/B1 room mixes, coverage targets, or district themes.
Do not add pruning detour caps.
Do not add walk-mean or p90 gates.
Do not add diagonal-length report fields.
Do not change save version 1.
Saved coordinates can become invalid after map geometry changes.
Keep the existing fallback in `js/main.js:309-332`.
For v2, `safePoint()` returns `null`.
Keep fallback to the start through `restPoint(0,0)`.
Do not change v1, prefabs, the default generator, or dependencies.
## 8 Open conflicts with user decisions
None.
