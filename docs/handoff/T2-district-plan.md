# Handoff T2 — District Planning Layer

## 1. Goal

Add a district plan for each 2×2 group of v2 cells.

Build each 128×128 m district plan before its four cell plans.

Cut district geometry into 64 m cells.

Keep the 64 m cell as the unit for loading, drawing, and collision.

Support cluster districts beside legacy districts.

## 2. Scope

### 2.1 Files to change

| File | Change |
|---|---|
| `js/gen2.js` | Add selection, cache, cutting integration, anchors, links, and feature protection. |
| `js/gen2-district.js` | Add pure core, validation, clipping, seams, and fixtures. |
| `tools/capture-gen2-district-baseline.mjs` | Add immutable baseline capture. |
| `tests/fixtures/gen2-district-baseline.json` | Store 512 plan hashes and one deterministic report. |
| `tests/unit/gen2-district-baseline.test.mjs` | Test default production regression. |
| `tests/unit/gen2-district.test.mjs` | Test district geometry, links, features, ownership, and body travel. |

Create `tests/fixtures/` before baseline capture.

### 2.2 Files that must not change

- `js/world.js`
- `js/regions.js`
- `js/cells2.js`
- `js/mesh2.js`
- `js/main.js`
- `js/save.js`
- `js/player.js`
- `js/gen2-measure.js`
- `tests/unit/reach.mjs`
- `tests/e2e/gen2.spec.js`
- Prefab files

Keep v1 as the default generator. Keep `?gen=v2` as the v2 entry point.

Keep save schema v1. Do not add dependencies.

### 2.3 Work rules

Use plain JavaScript ES modules.

Put district geometry operations in pure functions.

Keep caches and world integration in `World2`.

## 3. Fixed premises

### 3.1 Constants and geometry

| Name | Value |
|---|---|
| `CELL2` | 64 m |
| `Q2` | 0.5 m |
| District size | 128×128 m |
| `BODY_R2` | 0.4 m |
| `STEP2` | 0.8 m |
| `CONNECT_GAP` | 12 m |
| `PORTAL_CLEAR` | 2 m |
| `GIANT_STRIP` | 6 m |
| `CLUSTER_SHARE` | 0 |
| District selection salt | 7700 |
| District cache limit | 100 |

Use floor levels `-1` (B1), `0` (1F), and `1` (2F).

All T2 source rooms use level `0`. All rectangle edges use the Q2 grid.

Walls are implicit. Floor exists inside the union of same-level rooms.

Two touching rectangles have no wall between them.

A passage through a solid strip requires a passage rectangle.

The raster uses the higher ceiling where room rectangles overlap.

### 3.2 Fixed user decisions D1–D8

| ID | Requirement |
|---|---|
| D1 | Close **AT MOST one** inner link per legacy 2×2 district. |
| D2 | No continuous corridor stretch exceeds 36 m on the shortest path between neighbouring halls. |
| D3 | Ordinary corridor widths use `[1.5,2,2,2.5,3,3.5]` m. |
| D4 | Diagonal widths use `[1.5,2,2,2.5]` m. |
| D5 | Corridor ceilings use `2`, `2.5`, or `3` m. |
| D6 | Connector-room body widths remain 12–16 m. |
| D7 | A diagonal longer than 36 m gets a room in its middle. |
| D8 | Route length has no limit. Stage 02B owns the wall-to-wall distance cap. |

Shift corridor centres by 0.25 m for widths `1.5`, `2.5`, and `3.5` m.

Keep Stage 02B rules in legacy districts and between districts.

Do not generate legacy pruning or diagonals inside cluster districts.

### 3.3 Verified code facts

`js/gen2.js:379-387`, `js/gen2.js:446-450`, `js/gen2.js:626-669`, `js/gen2.js:699-744`, `js/gen2.js:725-732`, `js/gen2.js:752-765`, `js/gen2.js:1053-1059`, `js/gen2.js:1105-1120`.

### 3.4 Start and save safety

Always return `null` from `districtPlan(0,0)`.

Apply this exclusion to forced fixtures and `clusterShare = 1`.

Keep the start district's legacy hall geometry.

With default production options, require byte-identical output and spawn coordinates.

For forced or nondefault neighbours, permit deterministic changes to `restPoint(0,0)` coordinates.

Require the forced spawn to be standable, dry, and at level `0` inside the unchanged start hall.

Do not reserve extra districts to protect spawn coordinates.

Keep the existing invalid-position fallback and save schema:

    {
      v: 1, seed, visited, found,
      elapsed, distance, last, gen,
      x, z, h, yaw
    }

Do not store district geometry in saves.

An invalid old saved position uses the existing fallback to the start.

## 4. Data and functions

### 4.1 Coordinates and core module

For cell `(i,j)`, calculate:

    a = Math.floor(i / 2);
    b = Math.floor(j / 2);

For district `(a,b)`, calculate:

    OX = 128 * a;
    OZ = 128 * b;

Its four cells are:

    [[2*a,2*b], [2*a+1,2*b],
     [2*a,2*b+1], [2*a+1,2*b+1]]

Use mathematical floor for negative coordinates.

Create `js/gen2-district.js`.

Do not import `js/gen2.js` into this module. Avoid circular initialization.

Import only `./rng.js` when the production builder needs randomness.

Define private constants:

    const CELL = 64;
    const GRID = 0.5;
    const DISTRICT = 128;

Export these six named functions:

    buildClusterDistrict(seed, a, b, Y)
    fixtureCluster(a, b)
    fixtureSeamCluster(a, b)
    validateDistrictPlan(raw, a, b)
    clipDistrictRect(rect, i, j)
    cutDistrictCell(district, i, j)

Use this initial production builder:

    export function buildClusterDistrict(seed, a, b, Y) {
      return null;
    }

T3 replaces its body. T2 creates no provisional production rooms.

### 4.2 Constructor and district selection

Add to `js/gen2.js`:

    export const CLUSTER_SHARE = 0;

Use:

    constructor(seed, {
      clusterShare = CLUSTER_SHARE,
      cluster = null
    } = {})

Keep:

    this.seed = seed >>> 0;

Store both options. Initialize `this.districts` before calculating `this.spawn`.

Require finite `clusterShare` in `[0,1]`.

Throw `RangeError('Invalid clusterShare')` for invalid shares.

Require `cluster` to be `null` or a function.

Throw `TypeError('Invalid cluster factory')` otherwise.

Add these `World2` methods:

    districtPlan(a, b)
    legacySharedInDistrict(a, b)
    makeClusterPlan(i, j, district, r)

`districtPlan` returns a deeply frozen plan or `null`.

Use:

    this.districts = new Map();
    key = `${a},${b}`;

Cache `null` values. Use `Map.has(key)` for hits.

Use FIFO eviction with a maximum of 100 entries.

A hit must not change key order.

Before inserting a new key at size 100, delete the oldest key.

Leave `this.plans` unchanged.

Resolve `districtPlan(a,b)` in this exact order:

1. Validate district indices.
2. Return the cached value when its key exists.
3. Cache and return `null` for `(0,0)`.
4. Invoke `cluster(a,b)` when the factory exists.
5. Validate its non-null result.
6. Cache and return the factory result, including `null`.
7. Otherwise draw once with salt 7700.
8. Cache and return `null` when the draw is `>= clusterShare`.
9. Cache and return `null` when the district has a legacy giant or L hall.
10. Call `buildClusterDistrict(this.seed,a,b,this.Y)`.
11. Validate its non-null result.
12. Cache and return the builder result, including `null`.

Use this exact draw:

    mulberry32(hash2(this.seed, a, b, 7700))()

Do not consume the legacy cell random stream during selection.

The factory overrides the share test and legacy shared-hall exclusion.

The start-district exclusion takes priority over the factory.

A factory return of `null` selects the legacy layout.

Throw on invalid non-null results. Do not cache rejected results.

### 4.3 Legacy shared-hall check

Implement:

    legacySharedInDistrict(a, b)

Return true when any of these returns non-null:

    this.megaOf(2*a, 2*b)
    this.megaOf(2*a, 2*b + 1)
    this.lOf(a, b)

Otherwise return false.

Do not call `spaceOf`, `hallOf`, `linkOf`, `connectionOf`, `plan`, or `makePlan` from this helper.

Do not add cluster selection calls inside `megaOf` or `lOf`.

Keep their legacy algorithms unchanged.

### 4.4 District source schema

Use:

    {
      a, b,
      rooms: [{spaceId, lv:0, rects:[{x0,x1,z0,z1}],
               ceil, role, grid:{ox,oz,step}}],
      links: [{id, from, to, kind:'passage',
               rects:[{x0,x1,z0,z1}], grid:{ox,oz,step}}],
      anchors: {'i,j':'spaceId'}
    }

Allowed T2 roles are `'anchor'` and `'room'`.

All source links use `kind: 'passage'`.

Use room IDs:

    `v2:space:${a},${b}:r${k}`

Use link IDs:

    `v2:dlink:${a},${b}:${k}`

Use sequential `k` from zero in each array.

Use complete room `spaceId` strings for `from` and `to`.

Both endpoints belong to this district.

Require exactly four anchor keys, one for each cell.

Each anchor value references a source room.

### 4.5 Validation and immutable ownership

Implement:

    validateDistrictPlan(raw, a, b)

Return a new, deeply frozen validated copy.

Copy all nested arrays and objects. Do not mutate `raw`.

Sort **both room and link rectangle arrays** by ascending:

    x0, z0, x1, z1

This canonical order supersedes the earlier raw link rectangle order.

Use post-sort `rectIndex` for fragments.

Throw `TypeError('Invalid district plan')` for:

- Missing required fields or invalid field types.
- Unsafe or noninteger district/cell index arguments `a,b,i,j`.
- Incorrect `raw.a` or `raw.b`.
- Unknown roles or link kinds.
- Empty room arrays or source rectangle arrays.
- Invalid, duplicate, or nonsequential source IDs.
- Missing, extra, or invalid anchor keys.
- Dangling, missing, or equal link endpoints.

The integer-index rule applies only to `a,b,i,j`.

Rectangle edges are finite half-metre values, not necessarily integers.

Throw `RangeError('Invalid district geometry')` for:

- Nonfinite rectangle coordinates.
- Nonpositive rectangle dimensions.
- Rectangle edges outside Q2 or district bounds.
- Invalid ceilings or grid values.
- Invalid anchor bands or exterior gaps.
- Invalid physical-room or passage overlaps.
- Missing positive-area endpoint contact.
- Disconnected source geometry.
- Disjoint continuation intervals on one face.

Require finite room `ceil >= 2`.

Require ceilings to be Q2-aligned.

Require finite, Q2-aligned `grid.ox`, `grid.oz`, and `grid.step`.

Require `grid.step >= 0.5`.

Permit distinct physical rooms to touch along an edge.

Reject positive-area overlap between distinct physical rooms.

Reject positive-area overlap between rectangles of one physical room.

Permit passage overlap with its two endpoint rooms.

Reject passage overlap with non-endpoint rooms.

Reject positive-area overlap between different passage IDs.

Permit same-link rectangles to overlap.

Require one edge-connected union per physical room.

Require one edge-connected or positive-area-overlapping union per passage.

Reject corner-only source connections.

Require positive-area intersection between each passage union and both endpoint-room unions.

Validate continuation intervals for all four cells before accepting the district.

Do not repair invalid geometry.

Do not select legacy layout after a validation error.

### 4.6 Exterior boundary contract

Keep every source rectangle within:

    x0 >= OX + 12
    x1 <= OX + 116
    z0 >= OZ + 12
    z1 <= OZ + 116

For each cell, select its anchor fragment by Section 4.8.

Require that fragment to contain both transverse bands:

    x: [64*i + 24, 64*i + 40]
    z: [64*j + 24, 64*j + 40]

Also validate two outward faces per anchor:

| Cell | Outward faces |
|---|---|
| `(2a,2b)` | `nx`, `nz` |
| `(2a+1,2b)` | `px`, `nz` |
| `(2a,2b+1)` | `nx`, `pz` |
| `(2a+1,2b+1)` | `px`, `pz` |

Calculate each face's gap to its district boundary.

Require:

    12 <= gap && gap <= 24

This gives eight exterior anchor gaps of 12–24 m.

The central bands support legacy transverse corridor positions.

Reject districts that fail either requirement.

Inner cell edges do not use the exterior-gap restriction.

### 4.7 Clipping and fragment shape

Implement:

    clipDistrictRect(rect, i, j)

Calculate:

    ox = i * CELL;
    oz = j * CELL;
    cut = {
      x0: Math.max(rect.x0, ox),
      x1: Math.min(rect.x1, ox + CELL),
      z0: Math.max(rect.z0, oz),
      z1: Math.min(rect.z1, oz + CELL)
    };

Return `null` when:

    cut.x1 <= cut.x0 || cut.z1 <= cut.z0

Use half-open cell ownership:

    [ox, ox + CELL)
    [oz, oz + CELL)

Implement:

    cutDistrictCell(district, i, j)

Accept only a validated district plan.

Require safe integer cell indices.

Throw `RangeError('Cell outside district')` for a valid cell outside its district.

Return a new, deeply frozen result:

    {
      fragments: [{sourceType,sourceId,rectIndex,rect,
                   lv,kind,ceil,role,seams,grid}],
      primaryFragmentIndex: 0
    }

Use `sourceType: 'room'` or `'link'`.

Use room `spaceId` or link `id` as `sourceId`.

Omit `role` on link fragments.

Create one fragment per positive-area clipped rectangle.

Put the selected anchor fragment first.

Order remaining physical fragments by room index and rectangle index.

Then order links by link index and rectangle index.

Use the canonical post-sort rectangle index.

Do not return mutable references to district data.

### 4.8 Anchor and plan-room records

Find all anchor fragments with positive area in a cell.

Select the fragment with maximum area:

    (x1 - x0) * (z1 - z0)

Break equal-area ties by ascending:

    x0, z0, x1, z1

Require one selected anchor fragment per cell.

Put it at `fragments[0]`.

Assign numeric plan-room IDs from zero in fragment order.

All converted fragments have these plan-room fields:

    {id,lv:0,x0,x1,z0,z1,ceil,kind,
     lamps:[],spaceId:sourceId,seams,grid}

For physical fragments, set:

    kind = 'hall';
    span = 'cluster';
    role = source.role;

For link fragments, set:

    kind = 'corridor';
    ceil = Math.min(3, fromRoom.ceil, toRoom.ceil);

Omit `span` and `role` on link fragments.

A link ceiling is `2`, `2.5`, or `3` m.

Set:

    plan.primaryHallId = 0;
    plan.mega = null;

Create independent mutable plan-room objects.

Copy `seams` and `grid`. Create separate `lamps: []` arrays.

Do not mutate frozen district data.

For cluster cells, return this from `hallOf(i,j)`:

    {x0,x1,z0,z1,spaceId}

Use the selected anchor fragment and source ID.

Do not call `plan` or `makePlan` from `hallOf`.

Keep legacy `hallOf` behavior unchanged for legacy cells.

### 4.9 Continuations and seams

Give every grid-backed fragment:

    seams: {px:false,nx:false,pz:false,nz:false}

Compute continuations on **every fragment face**.

Include faces inside one cell and across cell boundaries.

Use all source rectangles with the same logical room `spaceId` or link `id`.

Require source geometry strictly beyond the tested face.

For fragment `f` and same-source rectangle `r`, use:

| Face | Coordinate | Continuation condition |
|---|---|---|
| `px` | `x = f.x1` | `r.x0 <= x && r.x1 > x` |
| `nx` | `x = f.x0` | `r.x0 < x && r.x1 >= x` |
| `pz` | `z = f.z1` | `r.z0 <= z && r.z1 > z` |
| `nz` | `z = f.z0` | `r.z0 < z && r.z1 >= z` |

Do not count an own-source boundary without geometry beyond it.

Clip each transverse interval to the fragment face.

For x faces:

    lo = Math.max(f.z0, r.z0);
    hi = Math.min(f.z1, r.z1);

For z faces:

    lo = Math.max(f.x0, r.x0);
    hi = Math.min(f.x1, r.x1);

Ignore intervals with `hi <= lo`.

Sort intervals by `lo`, then `hi`.

Merge touching or overlapping intervals when:

    next.lo <= current.hi

Set the merged interval to:

    {lo:current.lo,hi:Math.max(current.hi,next.hi)}

Store `false` when no interval remains.

Store `{lo,hi}` when one interval remains.

Reject two disjoint intervals on one face with:

    RangeError('Invalid district geometry')

Exact examples:

| Intervals | Result |
|---|---|
| `[10,12]`, `[12,14]` | `[10,14]` |
| `[10,12]`, `[11,14]` | `[10,14]` |
| `[10,11]`, `[12,13]` | Error |
| Zero-length contact | `false` |

Keep source IDs, ceilings, and grids equal across cross-cell continuations.

Do not place a wall across a continuation.

### 4.10 Shared lamp grids

Give every fragment of one logical source the same global grid:

    {ox,oz,step}

Use `seams` to mark open fragment faces.

Keep 0.6 m clearance from solid walls.

Assign each lamp to the fragment containing its centre under half-open ownership.

Resolve coincident centres by canonical fragment order.

Do not emit duplicate lamp centres for one logical source.

Apply the same rule to internal same-cell continuations.

Keep legacy `overWall` behavior unchanged.

### 4.11 Inner district links

The four canonical inner edges are:

    [[2*a,2*b,'x'], [2*a,2*b+1,'x'],
     [2*a,2*b,'z'], [2*a+1,2*b,'z']]

For each cluster inner edge, return from `linkOf`:

    {
      id: `v2:edge:${axis}:${i},${j}`,
      axis, fromSpaceId, toSpaceId,
      mode: 'district'
    }

Use the source cell anchor for `fromSpaceId`.

Use the adjacent cell anchor for `toSpaceId`.

Do not include `corridor`, `route`, `gaps`, `eligible`, or `parts`.

Make `connectionOf` return this record unchanged.

Make `linkRects` return `[]` for `district` mode.

Check `con.mode` before accessing `con.corridor`.

Skip legacy corridor construction for inner district edges.

Return `null` from `closedOf(a,b)` for cluster districts.

Return `null` from `diagonalOf(a,b)` for cluster districts.

Keep both methods unchanged for legacy districts.

### 4.12 Outer district links

Use the existing `linkOf` algorithm between districts.

Use the cluster anchor returned by `hallOf`.

Keep Stage 02B corridors, portals, routes, connectors, widths, ceilings, and stretch rules.

Keep canonical edge IDs.

Do not prune outer-district edges.

Each cluster cell has two inner edges and two outer edges.

Visit all four neighbour records.

Skip both `district` records.

Emit two outer corridor halves per cluster cell.

Use existing connector-room and route clipping.

A cluster district has eight outer boundary edges.

### 4.13 Protected mouths and features

Register protected mouths before anchor features.

For each district passage entering the anchor, create a 3 m deep mouth.

Use the passage's transverse interval.

For each anchor continuation, create a 6 m deep mouth.

Use the continuation interval.

Clip each protected rectangle to the anchor piece.

Do not merge protected mouth rectangles.

Apply the mouths to straight flights, switchback flights, voids, splits, showcases, and columns.

Append cluster mouths to the anchor pool blockers.

Keep the existing pool overlap margin of 2 m.

Do not change legacy pool blockers.

Use only the primary anchor fragment for existing hall features.

Give non-anchor physical room fragments lamps only.

Give secondary anchor fragments lamps only.

Do not call `addColumns` for these fragments.

Keep existing upper, basement, and showcase feature rules.

### 4.14 Exact `makePlan` branch and random stream

Call `ownHall(i,j)` **once** at the start of `makePlan`.

Use its five existing draws and the returned advanced stream `r`.

Place the branch after this call and before legacy plan creation.

Use:

    makePlan(i, j) {
      const {r,rect:own,ceil:hallCeil} = this.ownHall(i,j);
      const a = Math.floor(i / 2);
      const b = Math.floor(j / 2);
      const district = this.districtPlan(a,b);
      if (district) return this.makeClusterPlan(i,j,district,r);
      // Existing legacy makePlan body follows.
    }

Implement:

    makeClusterPlan(i, j, district, r)

Create this mutable plan:

    {
      i,j,ox:i*CELL2,oz:j*CELL2,
      rooms:[],pools:[],flights:[],voids:[],
      ladders:[],windows:[],columns:[],
      primaryHallId:0,mega:null
    }

Use the existing `room(lv,rect,ceil,kind)` creation contract.

Start numeric room IDs at zero. Continue the counter for generated rooms.

These operations consume zero draws from `r`:

- District selection and validation.
- Cutting and fragment ordering.
- Anchor selection and seam calculation.
- Grid assignment and fragment creation.

Use the advanced `r` for anchor features.

Keep the original random draw order for these features.

Keep independent salted random streams for existing salted features.

Use this cluster assembly order:

1. Add the primary anchor fragment.
2. Add other physical room fragments.
3. Add district passage fragments.
4. Visit four neighbour records.
5. Skip two inner district records.
6. Add two outer corridor halves.
7. Add boundary connector-room halves.
8. Register protected mouths.
9. Generate flights to 2F and B1.
10. Generate voids.
11. Generate the hall split.
12. Generate the showcase and window.
13. Generate pools.
14. Generate the B1 maze.
15. Generate columns.
16. Generate lamps.

Clip boundary routes and connector-room halves to cells.

Use existing feature helpers.

Keep the original legacy code path after the branch.

Do not change legacy random draw order.

### 4.15 Fixed four-room fixture

Implement:

    fixtureCluster(a, b)

Use `OX = 128*a` and `OZ = 128*b`.

All coordinates below are district-local.

Add `OX` to every x value and `OZ` to every z value.

All rooms use `lv:0`, `ceil:4`, and `role:'anchor'`.

Use room IDs:

    `v2:space:${a},${b}:r${k}`

| Room | k | x interval | z interval | Grid origin `(x,z)` |
|---|---:|---|---|---|
| A | 0 | `[20,63.5]` | `[20,63.5]` | `(20,20)` |
| B | 1 | `[64,108]` | `[20,63.5]` | `(64,20)` |
| C | 2 | `[20,63.5]` | `[64,108]` | `(20,64)` |
| D | 3 | `[64,108]` | `[64,108]` | `(64,64)` |

Add district offsets to every grid origin.

Use `grid.step = 6` for every room.

Use link IDs:

    `v2:dlink:${a},${b}:${k}`

| Link | k | From → To | x interval | z interval |
|---|---:|---|---|---|
| AB | 0 | A → B | `[63,64.5]` | `[30.5,33.5]` |
| CD | 1 | C → D | `[63,64.5]` | `[94.5,97.5]` |
| AC | 2 | A → C | `[30.5,33.5]` | `[63,64.5]` |
| BD | 3 | B → D | `[94.5,97.5]` | `[63,64.5]` |

Use complete room IDs in `from` and `to`.

Use `kind:'passage'` for every link.

Use each link's first rectangle global `x0,z0` as its grid origin.

Use `grid.step = 6`.

All links have transverse width 3 m and resulting ceiling 3 m.

Each link bridges a 0.5 m solid strip.

Use these anchors:

    {
      [`${2*a},${2*b}`]: A,
      [`${2*a+1},${2*b}`]: B,
      [`${2*a},${2*b+1}`]: C,
      [`${2*a+1},${2*b+1}`]: D
    }

A, B, C, and D are complete source room IDs.

The fixture does not define production room sizes.

### 4.16 Supplemental seam fixture

Implement:

    fixtureSeamCluster(a, b)

Copy `fixtureCluster(a,b)`.

Preserve IDs, anchors, links, roles, ceilings, and grids.

Append this district-local rectangle to A:

    x: [63.5,66]
    z: [50,54]

Replace B's original rectangle with:

    B0: x [64,108], z [20,49.5]
    B1: x [66,108], z [49.5,63.5]

A crosses the inner x cell boundary.

B has a same-cell continuation.

Keep `fixtureCluster` unchanged.

### 4.17 Determinism and cache ownership

Apply the exact cache, immutable ownership, and determinism contracts in Sections 4.2, 4.5, and 6.5.

## 5. Procedure

Use exactly two green commits.

Write a red test before each new behavior.

Do not commit failing intermediate states.

### 5.1 Commit 1 — Baseline

Commit message:

    test(gen2): capture T2 legacy baseline

First, add a test that requires the baseline fixture.

Confirm that the test fails when the fixture does not exist.

Capture the baseline before the first T2 behavior change.

Create:

    tools/capture-gen2-district-baseline.mjs

Run:

    node tools/capture-gen2-district-baseline.mjs

Write the exact path:

    tests/fixtures/gen2-district-baseline.json

Use `node:fs` with exclusive flag `wx`.

Refuse to overwrite an existing fixture.

Use `node:crypto` SHA-256.

Capture all 512 plans from `CORPUS`.

Use keys:

    `${seed}:${i},${j}`

Hash each `JSON.stringify(plan)`.

Capture `measureWorld(CORPUS)`.

Remove only its top-level `cost` property.

Store the complete remaining report and its JSON SHA-256 hash.

Use this fixture schema:

    {
      "version":1,
      "planSha256":{"seed:i,j":"64-character SHA-256 hex"},
      "report":{},
      "reportSha256":"64-character SHA-256 hex"
    }

Make both baseline tests green.

Never regenerate the baseline to pass a regression test.

Resolve pre-existing failures in their owning topic before baseline acceptance.

### 5.2 Commit 2 — District planning plumbing

Commit message:

    feat(gen2): add district planning plumbing

Use these internal red-first steps:

| Step | Red test first | Change | Green result |
|---|---|---|---|
| 1 | Options and selection | Add constructor, cache, salt, and exclusions. | Selection tests pass. |
| 2 | Pure core | Add validation, cloning, freezing, and fixtures. | Schema tests pass. |
| 3 | Cutting | Add canonical fragments, anchors, seams, and grids. | Geometry tests pass. |
| 4 | Integration | Add cluster branch, outer links, and district mode. | Link and raster tests pass. |
| 5 | Features | Add mouths and pool blockers. | Protection tests pass. |
| 6 | Body | Add fixture reach tests. | Four rooms are reached. |
| 7 | Determinism | Add order and eviction tests. | All comparisons pass. |

Keep the production builder as the null producer.

Keep `CLUSTER_SHARE = 0`.

Run after each green commit:

    node --test tests/unit/gen2-district*.test.mjs
    npm run test:unit
    npm run build
    npm test -- --project=desktop

Require exit code zero from all commands.

## 6. Acceptance tests

### 6.1 Exact test names

Use `tests/unit/gen2-district-baseline.test.mjs` for the first two tests.

Use `tests/unit/gen2-district.test.mjs` for the other tests.

| Exact test name | Assertions |
|---|---|
| `district baseline: 512 default plans unchanged` | Compare all 512 hashes with Section 5.1 baseline. |
| `district baseline: deterministic report unchanged` | Compare full report without `cost` and its hash. |
| `district: constructor option validation` | Test Section 4.2 option types, shares 0 and 1, and default 0. |
| `district: start exclusion` | Check Section 3.4 for default and forced neighbours. |
| `district: fixture ids and geometry` | Compare all Section 4.15 values. |
| `district: clipping stays inside cell` | Check bounds, positive areas, order, and frozen copies. |
| `district: passage seams across four inner edges` | Compare passage IDs, seam intervals, and ceilings. |
| `district: physical room crosses cell seam` | Check Section 6.2 supplemental intervals. |
| `district: primary anchor selection` | Check four anchors, largest area, and lexicographic ties. |
| `district: negative coordinates` | Cut district `(-1,-1)` into cells `(-2,-2)` through `(-1,-1)`. |
| `district: inner mode and legacy suppression` | Check Section 4.11 for all four inner edges. |
| `district: mixed outer boundary` | Check all eight edges from Section 6.4. |
| `district: real body reaches four rooms` | Check both fixtures using Section 6.3 predicates. |
| `district: planning order independent` | Compare four plans in forward, reverse, and post-eviction orders. |
| `district: FIFO eviction and recreation` | Check the exact Section 6.5 key sequences. |
| `district: malformed plans rejected` | Test all Section 4.5 errors and no rejected cache insertion. |
| `district: shared lamp grid` | Check identical source grids, seams, unique lamps, and wall clearance. |

### 6.2 Core and seam assertions

Require:

    CELL2 === 64
    Q2 === 0.5
    2 * CELL2 === 128

Check private core constant values through fixture and clipping results.

For `fixtureSeamCluster(1,1)`, check these global coordinates:

| Source | Face | Coordinate | Interval |
|---|---|---|---|
| A main | `px` | `x=191.5` | `{lo:178,hi:182}` |
| A arm | `nx` | `x=191.5` | `{lo:178,hi:182}` |
| A cross-cell | x boundary | `x=192` | `{lo:178,hi:182}` |
| B0/B1 | `pz`/`nz` | `z=177.5` | `{lo:194,hi:236}` |

Test all interval merge cases from Section 4.9.

For disjoint-seam rejection, clone `fixtureSeamCluster(1,1)`.

Append this district-local A rectangle:

    x: [63.5,66]
    z: [56,58]

Require the main A east face to have candidate intervals:

    [50,54]
    [56,58]

Require `RangeError('Invalid district geometry')`.

Test valid noninteger Q2 rectangle coordinates.

Test invalid noninteger `a,b,i,j` separately.

Require the documented error class and message.

Require invalid plans to remain outside the district cache.

### 6.3 Real-body reachability

Use seed `42` and district `(1,1)`.

Test both `fixtureCluster` and `fixtureSeamCluster`.

Use bounds `[128,128,256,256]`.

Use start:

    const start = [189,160,0];

This point is district-local `(61,32,0)`, inside the protected AB passage mouth.

Before travel, assert:

    const player = new Player();
    player.x = 189;
    player.z = 160;

    assert.equal(player.canStand(world,189,160,0),true);

    const surface = world.surfaceAt(189,160,0);
    assert.ok(surface);
    assert.equal(surface.h,0);
    assert.equal(Number.isNaN(surface.wl),true);

Call:

    const states = reachSet(world,128,128,256,256,start);

For each source room A, B, C, and D, find one qualifying state `[x,z,h]`.

Require:

    h === 0

Require the full body footprint strictly inside one source-room rectangle:

    x - 0.4 > rect.x0
    x + 0.4 < rect.x1
    z - 0.4 > rect.z0
    z + 0.4 < rect.z1

Set `player.x=x` and `player.z=z`.

Require:

    player.canStand(world,x,z,0) === true
    world.surfaceAt(x,z,0).h === 0
    Number.isNaN(world.surfaceAt(x,z,0).wl) === true

Copy returned surface data before another world query changes its shared object.

Identify targets by source `spaceId`, not numeric plan-room IDs.

Require all four rooms to be reached in each fixture.

### 6.4 Mixed outer boundary

Use seed `42`.

Select only district `(1,1)`:

    const cluster = (a,b) =>
      a === 1 && b === 1 ? fixtureCluster(a,b) : null;

Construct:

    new World2(42,{cluster});

Check these eight canonical outer edges:

    [
      [1,2,'x'], [2,1,'z'],
      [3,2,'x'], [3,1,'z'],
      [1,3,'x'], [2,3,'z'],
      [3,3,'x'], [3,3,'z']
    ]

Require the modes, canonical IDs, and endpoint IDs from Sections 4.11 and 4.12.

Build each edge's two cells in both orders with separate worlds.

Require identical serialized connection records and complete cell plans.

Use `cellRaster(world,i,j,0)` on both sides.

Require at least three consecutive Q2 transverse samples with floor on both sides.

Require equal ceilings at those samples.

For the four inner edges, require bidirectional passage seam and ceiling agreement.

### 6.5 Planning order and cache

Use seed `42` and `fixtureCluster` only in district `(1,1)`.

Use cell order:

    [[2,2],[3,2],[2,3],[3,3]]

Use its exact reverse in another world.

Compare complete `JSON.stringify(plan)` values for all four cells.

Evict district `(1,1)` from the district cache.

Recreate its district plan.

Remove its four cached cell plans.

Regenerate the four cells.

Require the original serialized results.

For FIFO testing, use a fresh forced-fixture world.

Capture:

    const original = world.districtPlan(1,0);

Call:

    for (let a = 1; a <= 451; a++) {
      world.districtPlan(a,0);
    }

Require cache size 100.

Require key order:

    "352,0" through "451,0"

Require `"1,0"` absent.

Recreate:

    const recreated = world.districtPlan(1,0);

Require:

    assert.deepEqual(recreated,original);

Require final key order:

    "353,0" through "451,0"
    "1,0"

Require cache size 100.

### 6.6 Spawn and feature assertions

Apply all default/forced spawn guarantees in Section 3.4.

For spawn inside the unchanged start hall, apply Section 6.3's THREE standable/dry/`h === 0` predicates to its full body.

Require identical spawn values for TWO independent forced worlds with equal seed/options.

Test forced neighbours: seeds `5`, `49`, `61`; both fixture types: seed `42`.

Apply ALL feature contracts in Sections 4.5, 4.9, 4.10, and 4.13.

## 7. Out of scope

Later topics own production geometry and link policy.

| Topic | Responsibility |
|---|---|
| T3 | Room counts, sizes, roles, ceilings, placement, production `CLUSTER_SHARE`, and feature allocation. |
| T4 | Shared-wall strips, openings, widths, heights, placement, and opening-specific cutting. |
| T5 | Cluster topology, groups, loops, dead ends, and exits. |
| T6 | Distance-based links, connectors, internal diagonals, pruning, and corridor-stretch gates. |

T3 replaces `buildClusterDistrict(seed,a,b,Y)` and extends accepted room roles and levels.

T4 and T6 extend accepted link kinds and geometry fields.

T4 extends opening-specific cutting.

T5 supplies production room topology.

T6 supplies internal link policy under D1–D8.

Keep the public T2 interfaces stable.

Do not add forced-fixture measurement to `measureWorld` in T2.

Validate fixtures through direct world, raster, lamp, and real-body tests.

## 8. Open conflicts with user decisions

None.
