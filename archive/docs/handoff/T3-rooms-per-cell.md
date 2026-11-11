# Handoff T3 — Cluster Room Content

## 1 Goal

Build the physical room content of each production cluster district.

Use the district planning layer defined in `docs/handoff/T2-district-plan.md`.

Complete T2 before implementing T3.

Keep each district 128×128 m.

Keep each cell 64×64 m.

Generate 12–16 physical source rooms per cluster district.

Generate 3–4 physical source rooms per cell.

Give each cell one distinct anchor room.

Use deterministic room templates on the Q2 grid.

Support rectangular and L-shaped physical source rooms.

Connect all physical source rooms with temporary reference passages.

Keep existing anchor features and their random streams.

Protect the required routes through each anchor.

Set production `CLUSTER_SHARE` to `0.5`.

Preserve the legacy layout with `clusterShare:0`.

Preserve the T2 public interfaces.

Do not implement T4, T5, or T6 behavior.

## 2 Scope

### 2.1 Files to change

| File | Change |
|---|---|
| `js/gen2-district.js` | Implement the production builder, templates, roles, ceilings, reference passages, and validation extensions. |
| `js/gen2.js` | Add production-only access protection and set `CLUSTER_SHARE=0.5`. |
| `tests/unit/gen2-cluster-rooms.test.mjs` | Add all T3 geometry, randomness, integration, and production acceptance tests. |
| `tests/unit/gen2-legacy-report.mjs` | Add isolated legacy report execution. |
| `tests/unit/gen2-district-baseline.test.mjs` | Pin legacy plan tests to explicit zero and isolate the legacy report. |
| `tests/unit/gen2-district.test.mjs` | Update the constructor-default assertion to `0.5`. |
| `tests/unit/gen2.test.mjs` | Pin existing constructors to explicit zero. |
| `tests/unit/gen2-mesh.test.mjs` | Pin existing constructors to explicit zero. |
| `tests/unit/gen2-connections.test.mjs` | Pin constructors and existing report calls to legacy behavior. |
| `tests/unit/gen2-detour-walk.test.mjs` | Pin existing constructors to explicit zero. |
| `tests/unit/gen2-coverage.test.mjs` | Pin constructors and existing report calls to legacy behavior. |
| `tests/unit/gen2-paths.test.mjs` | Pin existing constructors to explicit zero. |
| `tests/unit/gen2-connection-walk.test.mjs` | Pin constructors and existing report calls to legacy behavior. |

T2 creates `js/gen2-district.js` before T3 starts.

T2 creates the two district test files before T3 starts.

Preserve unrelated existing edits in every changed file.

Use plain JavaScript ES modules.

Use only existing dependencies.

### 2.2 Files that must not change

Do not change:

- `js/world.js`
- `js/regions.js`
- `js/cells2.js`
- `js/mesh2.js`
- `js/main.js`
- `js/save.js`
- `js/player.js`
- `js/gen2-measure.js`
- `js/rng.js`
- `tests/unit/reach.mjs`
- `tests/e2e/gen2.spec.js`
- `tools/gen2-measure.mjs`
- `tools/capture-gen2-district-baseline.mjs`
- `tests/fixtures/gen2-district-baseline.json`
- `docs/handoff/T0-02b-finish.md`
- `docs/handoff/T1-measurement.md`
- `docs/handoff/T2-district-plan.md`
- `docs/codex-collaboration.md`
- `package.json`
- Prefab files

Do not regenerate the immutable T2 baseline fixture.

Do not add npm scripts.

Do not add dependencies.

Do not replace existing measurement or reachability helpers.

Keep the default game generator as v1.

Keep `?gen=v2` as the v2 entry point.

Keep save schema v1.

## 3 Fixed premises

### 3.1 Implementation order

T2 is a fixed prerequisite design.

T2 was not implemented when the T3 interview started.

Implement and verify T2 before implementing T3.

Use the final T2 contracts, not the earlier pre-T2 implementation.

Keep the six T2 exports:

    buildClusterDistrict(seed,a,b,Y)
    fixtureCluster(a,b)
    fixtureSeamCluster(a,b)
    validateDistrictPlan(raw,a,b)
    clipDistrictRect(rect,i,j)
    cutDistrictCell(district,i,j)

Keep these T2 World2 methods:

    districtPlan(a,b)
    legacySharedInDistrict(a,b)
    makeClusterPlan(i,j,district,r)

Keep T2 source IDs, source ownership, cutting, anchors, and seams.

Keep the existing legacy generator path.

Keep the T2 FIFO district cache.

Keep the T2 immutable district-plan contract.

### 3.2 Geometry constants

Use:

| Constant | Value |
|---|---:|
| `CELL2` | 64 m |
| `Q2` | 0.5 m |
| District width | 128 m |
| District depth | 128 m |
| `BODY_R2` | 0.4 m |
| `STEP2` | 0.8 m |
| Production `CLUSTER_SHARE` | 0.5 |
| District-selection salt | 7700 |
| Production-builder salt | 7710 |
| District cache limit | 100 |
| Legacy cell-plan cache behavior | Unchanged |
| Reference passage transverse width | 3 m |
| Reference passage endpoint overlap | 0.5 m per endpoint |
| Local anchor-to-satellite solid gap | 0.5 m |
| Maximum cross-cell reference gap | 5 m |
| Physical room lamp-grid step | 6 m |
| Reference passage lamp-grid step | 6 m |
| Production room source level | 0 |

Use metres for all geometry coordinates.

Use global coordinates in stored source records.

Use Q2-aligned source rectangle edges.

Use levels `-1`, `0`, and `1` for B1, 1F, and 2F.

All T3 physical source rooms use `lv:0`.

Existing features retain their upper and basement levels.

### 3.3 Fixed user decisions D1–D8

**D1 — Pruning**

Close at most one inner link per legacy 2×2 district.

Do not add a pruning-detour limit.

Keep T2's suppression of legacy pruning inside cluster districts.

**D2 — Corridor stretches**

Limit continuous corridor stretches to 36 m.

Apply this gate to shortest paths between neighbouring halls.

Halls and connector rooms break corridor stretches.

Do not add walk-mean or walk-p90 gates.

**D3 — Ordinary corridor widths**

Use this weighted array:

    [1.5,2,2,2.5,3,3.5]

Apply it to ordinary corridors, connector stubs, doglegs, and winding routes.

Shift centres by positive 0.25 m for widths `1.5`, `2.5`, and `3.5`.

Keep rectangle edges Q2-aligned.

**D4 — Diagonal corridor widths**

Use:

    [1.5,2,2,2.5]

**D5 — Ordinary corridor ceilings**

Use:

    [2,2.5,3]

Give each value probability `1/3` before geometry rejection.

Apply this rule to ordinary corridors, stubs, routes, and diagonals.

**D6 — Connector-room widths**

Keep connector-room body widths at 12–16 m.

**D7 — Long diagonal passages**

Add a middle room to every accepted diagonal longer than 36 m.

Preserve the exact T0 middle-room policy.

**D8 — Turning routes**

Do not cap the complete turning-route length.

Use axial wall-to-wall distance for the corridor-stretch gate.

Keep the T0 wall-to-wall cap at 36 m.

### 3.4 Reference passage classification

T3 creates only short reference passages inside cluster districts.

These links use T2 source `kind:'passage'`.

T2 converts their fragments to plan-room `kind:'corridor'`.

The source links remain short passages.

Do not apply D3 width draws to these source passages.

Do not apply D5 ceiling draws to these source passages.

Keep D3 and D5 for ordinary corridors outside this temporary reference-link design.

T4 owns final short-opening geometry.

T5 owns final room topology.

T6 owns final distance-based links.

The earlier D3/D5 objection is resolved by this classification.

Do not add 4–10 m gallery corridors in T3.

### 3.5 T2 selection and safety

Keep the T2 constructor options:

    constructor(seed,{
      clusterShare=CLUSTER_SHARE,
      cluster=null
    }={})

Set:

    export const CLUSTER_SHARE=0.5;

Keep the exact district-selection draw:

    mulberry32(hash2(this.seed,a,b,7700))()

Select a production cluster when the draw is less than `clusterShare`.

Apply T2's start-district exclusion before all other selection logic.

Always return `null` from `World2.districtPlan(0,0)`.

Keep the start exclusion with forced factories and `clusterShare:1`.

Exclude districts with legacy giant or L shared halls from normal production selection.

Keep forced-factory precedence over share selection and shared-hall exclusion.

Preserve the existing invalid-position save fallback.

Do not store district geometry in saves.

Keep the default production spawn safe.

Keep explicit `clusterShare:0` byte-identical to the T2 legacy baseline.

### 3.6 Architecture

Use pure functions for district room geometry.

Keep caches and runtime integration inside World2.

Keep geometry independent of cell planning order.

Do not consume the legacy cell random stream during production district construction.

Do not use rejection sampling in the production room builder.

Do not use random retries in the production room builder.

Do not reduce a selected room count after geometry selection.

Do not add fallback room layouts.

Use one deterministic template for each selected role and slot.

### 3.7 T2 validation rules

Preserve T2's validated source schema.

Return deeply frozen validated district plans.

Keep canonical rectangle ordering:

    x0,z0,x1,z1

Reject positive-area overlaps between distinct physical rooms.

Reject positive-area overlaps between rectangles of one physical room.

Require each physical room's rectangle union to be edge-connected.

Require every passage to have positive-area contact with both endpoints.

Reject passage overlap with non-endpoint physical rooms.

Reject positive-area overlap between distinct passage IDs.

Keep continuation and seam validation unchanged.

Keep the T2 exterior boundary contract.

Keep the T2 anchor selection contract.

Keep the T2 error classes and messages.

## 4 Data and functions

### 4.1 Production builder

Replace the T2 null-producing implementation of:

    export function buildClusterDistrict(seed,a,b,Y)

Keep this exact signature.

Return:

    validateDistrictPlan(raw,a,b)

Do not return the mutable raw object.

Do not add exported builder helpers.

Do not add extra source-plan fields.

Validate inputs before constructing the RNG.

Apply these validation steps in order:

1. Validate `a` and `b` as safe integers.
2. Validate `Y` as a non-null object.
3. Require finite `Y[1]`.
4. Calculate `cap=Y[1]-1.5`.
5. Filter all four production ceiling arrays.
6. Require each filtered array to be nonempty.
7. Normalize `seed` with `seed>>>0`.
8. Construct the production district RNG.
9. Generate source rooms and reference passages.
10. Validate and freeze the complete source plan.

Use T2's exact invalid-index error:

    TypeError('Invalid district plan')

Use this error for nonfinite `Y[1]` and empty ceiling arrays:

    RangeError('Invalid district ceiling range')

Ignore `Y[-1]` and `Y[0]` inside the production builder.

Do not change World2's existing height generation.

Allow direct production-builder calls for district `(0,0)`.

Apply the start exclusion only inside `World2.districtPlan`.

### 4.2 Source-plan shape

Use:

    {
      a,
      b,
      rooms:[
        {
          spaceId,
          lv:0,
          rects:[{x0,x1,z0,z1}],
          ceil,
          role,
          grid:{ox,oz,step:6}
        }
      ],
      links:[
        {
          id,
          from,
          to,
          kind:'passage',
          rects:[{x0,x1,z0,z1}],
          grid:{ox,oz,step:6}
        }
      ],
      anchors:{
        'i,j':'spaceId'
      }
    }

Use exactly four anchor keys.

Give each anchor a distinct physical source room.

Keep complete source `spaceId` values in the anchor map.

Use sequential room IDs:

    `v2:space:${a},${b}:r${k}`

Use sequential link IDs:

    `v2:dlink:${a},${b}:${k}`

Start both ID counters at zero.

Use source `spaceId` values for link endpoints.

Keep T2 fixture roles:

    anchor
    room

Extend the accepted production roles with:

    small
    medium
    main
    giant

Do not change the existing fixture records.

Do not reinterpret the legacy giant-hall generator as the `giant` room role.

### 4.3 Room counts

Select one cell count independently for each of the four cells.

Use:

    count = r()<0.5 ? 3 : 4;

Each cell contains:

- One anchor.
- One E satellite.
- One S satellite.
- One optional T satellite.

Include T only when `count===4`.

Count each physical source room once by `spaceId`.

Exclude passage fragments from physical-room counts.

Exclude feature-generated rooms from physical-room counts.

Exclude upper and basement rooms from physical-room counts.

Require:

    3 <= roomsPerCell && roomsPerCell <= 4
    12 <= roomsPerDistrict && roomsPerDistrict <= 16

Every production physical source room belongs wholly to one cell.

Do not count separate rectangles of an L-shaped room as separate rooms.

### 4.4 Anchor roles and giant selection

Give every cell one anchor.

Assign role `main` to every anchor initially.

Select a district giant flag with probability `1/8`.

Select the giant cell uniformly from the four cell indices.

Consume the giant-cell draw even when the giant flag is false.

When selected, change exactly one anchor role to `giant`.

Keep the other three anchors as `main`.

Allow at most one `giant` source room per district.

Use the giant flag only for the physical room role.

Do not invoke the legacy giant-hall generator.

### 4.5 Satellite roles and shapes

Select each satellite role independently.

Use:

    role = r()<0.6 ? 'small' : 'medium';

Select each satellite shape independently.

Use:

    shape = r()<0.25 ? 'L' : 'rect';

Select the role before the shape.

Select the ceiling after the shape.

Use the same distributions for E, S, and T.

Consume all T draws when T is absent.

Omit absent T source geometry.

Do not create absent T source IDs.

Keep anchors rectangular.

Do not create L-shaped anchors.

### 4.6 District coordinates

Calculate:

    OX=128*a;
    OZ=128*b;

Use NW as the canonical cell.

Use district-local coordinates for canonical templates.

The canonical NW cell covers:

    x:[0,64]
    z:[0,64]

Use these four transforms:

| Cell | X transform | Z transform |
|---|---|---|
| NW | `x` | `z` |
| NE | `128-x` | `z` |
| SW | `x` | `128-z` |
| SE | `128-x` | `128-z` |

For a reflected interval `[lo,hi]`, return:

    [128-hi,128-lo]

Apply reflections before adding `OX` and `OZ`.

Transform complete rectangle intervals, not individual edges in their original order.

Add district offsets after transforming both axes.

Use mathematical floor for negative district and cell indices.

Process cell order:

    NW,NE,SW,SE

Map these cells to indices:

    NW = [2*a,   2*b]
    NE = [2*a+1, 2*b]
    SW = [2*a,   2*b+1]
    SE = [2*a+1, 2*b+1]

### 4.7 Canonical anchor templates

Use these exact NW-canonical rectangles:

| Role | x0 | x1 | z0 | z1 | Area |
|---|---:|---:|---:|---:|---:|
| `main` | 16 | 48 | 16 | 48 | 1024 m² |
| `giant` | 12 | 48 | 12 | 48 | 1296 m² |

Use the same rectangle template for all anchors of one role.

Apply the cell transformation to the selected template.

For `main`, keep both outward gaps at 16 m.

For `giant`, keep both outward gaps at 12 m.

Preserve the central transverse bands:

    x:[24,40]
    z:[24,40]

Use the corresponding transformed bands in the other three cells.

Require all eight exterior anchor gaps to remain between 12 and 24 m.

Keep the T2 exterior source bounds:

    x0 >= OX+12
    x1 <= OX+116
    z0 >= OZ+12
    z1 <= OZ+116

### 4.8 Canonical satellite templates

Use the following complete coordinate table.

All coordinates are NW-canonical.

| Slot | Role | x0 | x1 | z0 | z1 | Area |
|---|---|---:|---:|---:|---:|---:|
| E | `small` | 48.5 | 61.5 | 27 | 37 | 130 m² |
| E | `medium` | 48.5 | 63.5 | 24.5 | 39 | 217.5 m² |
| S | `small` | 27 | 37 | 48.5 | 61.5 | 130 m² |
| S | `medium` | 24.5 | 39 | 48.5 | 63.5 | 217.5 m² |
| T | `small` | 48.5 | 61.5 | 41 | 51 | 130 m² |
| T | `medium` | 48.5 | 63.5 | 40 | 54.5 | 217.5 m² |

Always generate E and S.

Generate T only for four-room cells.

Keep E and T on the inward x side.

Keep S on the inward z side.

Keep E and T separated along z.

Keep S clear of E and T.

Keep a 0.5 m solid gap between each satellite and its anchor.

Keep all other physical source rooms free of positive-area overlap.

Apply the complete cell transformation before storing coordinates.

### 4.9 Exact L-shaped geometry

Use two rectangles for each L-shaped satellite.

Keep both rectangles positive in area.

Keep their interiors disjoint.

Join the rectangles along a positive-length edge.

For E and T, start with the selected bounding rectangle:

    [x0,x1] × [z0,z1]

Remove this far-side corner:

    [x1-3,x1] × [z0,z0+3]

Emit these raw rectangles in order:

    [
      {x0:x0,   x1:x1-3, z0:z0,   z1:z1},
      {x0:x1-3, x1:x1,   z0:z0+3, z1:z1}
    ]

For S, remove:

    [x0,x0+3] × [z1-3,z1]

Emit these raw rectangles in order:

    [
      {x0:x0,   x1:x1, z0:z0,   z1:z1-3},
      {x0:x0+3, x1:x1, z0:z1-3, z1:z1}
    ]

Apply the cell transformation to both rectangles.

Let T2 validation apply the final canonical rectangle ordering.

Keep the entry side of every L-shaped room connected to its reference passage.

Do not remove the cross-cell passage band.

Use these exact source-room areas:

| Role | Rectangle | L-shape |
|---|---:|---:|
| `small` | 130 m² | 121 m² |
| `medium` | 217.5 m² | 208.5 m² |
| `main` | 1024 m² | Not allowed |
| `giant` | 1296 m² | Not allowed |

Do not calculate the area from the L bounding box.

Calculate the area from its two non-overlapping source rectangles.

### 4.10 Role ceilings

Use these exact ceiling arrays:

| Role | Ceiling candidates |
|---|---|
| `small` | `[3,3.5,4]` |
| `medium` | `[3.5,4,4.5]` |
| `main` | `[4,4.5,5]` |
| `giant` | `[4.5,5,5.5]` |

Calculate:

    cap=Y[1]-1.5;

For every production role, calculate:

    eligible=CEILINGS[role].filter(h=>h<=cap);

Keep the original candidate order.

Require every eligible array to be nonempty.

Use one ceiling draw per room or reserved satellite slot.

Select:

    ceil=eligible[Math.floor(r()*eligible.length)];

Consume the ceiling draw for absent T.

Keep all source ceilings Q2-aligned.

Keep all physical source ceilings at least 3 m.

Do not replace an invalid ceiling with a fallback value.

Use:

    RangeError('Invalid district ceiling range')

for a nonfinite `Y[1]` or an empty eligible array.

### 4.11 Lamp grids

Use one global grid per logical source room.

For each physical source room, calculate:

    grid={
      ox:Math.min(...rects.map(q=>q.x0)),
      oz:Math.min(...rects.map(q=>q.z0)),
      step:6
    };

Use transformed global rectangles for this calculation.

Use the same grid for all fragments of one source room.

For each reference passage, use:

    grid={
      ox:rect.x0,
      oz:rect.z0,
      step:6
    };

Keep T2's lamp ownership rules.

Keep 0.6 m clearance from solid walls.

Keep the existing grid-backed seam behavior.

Do not emit duplicate lamp centres.

Do not add random lamp-grid origins.

### 4.12 Reference-link graph

Create a connected tree over all physical source rooms.

Let `R` be the physical source-room count.

Generate exactly:

    L=R-1

reference links.

Use T2 source `kind:'passage'` for every link.

Use one rectangle per link.

Give every reference passage a 3 m transverse width.

Keep all passage rectangle edges Q2-aligned.

Require positive-area overlap with both endpoint rooms.

Reject overlap with non-endpoint physical rooms.

Reject positive-area overlap with other reference passage IDs.

Do not add internal ordinary corridors.

Do not use a generated route to replace a reference passage.

### 4.13 Local anchor-to-satellite passages

Use these NW-canonical rectangles:

| Link | x0 | x1 | z0 | z1 |
|---|---:|---:|---:|---:|
| Anchor–E | 47.5 | 49 | 30.5 | 33.5 |
| Anchor–S | 30.5 | 33.5 | 47.5 | 49 |
| Anchor–T | 47.5 | 49 | 44.5 | 47.5 |

Generate Anchor–E and Anchor–S for every cell.

Generate Anchor–T only when T exists.

Apply the owning cell transformation.

Add the district origin after reflection.

Each passage spans a 0.5 m solid gap.

Each passage extends 0.5 m inside the anchor.

Each passage extends 0.5 m inside its satellite.

Preserve the exact 3 m transverse interval.

Do not let an L-shaped notch remove the passage entry.

### 4.14 Cross-cell reference passages

Use exactly these three cross-cell links:

    AB: NW.E -> NE.E
    AC: NW.S -> SW.S
    BD: NE.S -> SE.S

Use AB, AC, and BD in that order.

Do not add a CD link.

The complete reference graph remains a tree.

Keep a private builder-local map from cell and slot labels to source room records.

Use this exact map structure during construction:

    const roomBySlot={
      NW:{anchor:null,E:null,S:null,T:null},
      NE:{anchor:null,E:null,S:null,T:null},
      SW:{anchor:null,E:null,S:null,T:null},
      SE:{anchor:null,E:null,S:null,T:null}
    };

Set each entry to its generated source room record.

Keep `T:null` when the T satellite does not exist.

Do not add cell labels or slot labels to T2 source records.

Resolve the cross-cell endpoint labels through this private map.

Use this exact label mapping:

| Label | Source room |
|---|---|
| `NW.E` | `roomBySlot.NW.E` |
| `NE.E` | `roomBySlot.NE.E` |
| `NW.S` | `roomBySlot.NW.S` |
| `SW.S` | `roomBySlot.SW.S` |
| `NE.S` | `roomBySlot.NE.S` |
| `SE.S` | `roomBySlot.SE.S` |

Calculate a private bounding box from every endpoint source room's complete rectangle array.

Use all transformed global source rectangles.

Define this private helper in `js/gen2-district.js`:

    function boundsOfSourceRoom(room){
      return {
        x0:Math.min(...room.rects.map(q=>q.x0)),
        x1:Math.max(...room.rects.map(q=>q.x1)),
        z0:Math.min(...room.rects.map(q=>q.z0)),
        z1:Math.max(...room.rects.map(q=>q.z1))
      };
    }

Call this helper after transforming the source rectangles to global coordinates.

Do not call it on canonical local rectangles.

Do not calculate bounds from only the first source rectangle.

Do not add scalar `x0`, `x1`, `z0`, or `z1` fields to source room records.

For the six endpoint labels, calculate:

    const NW_E=boundsOfSourceRoom(roomBySlot.NW.E);
    const NE_E=boundsOfSourceRoom(roomBySlot.NE.E);
    const NW_S=boundsOfSourceRoom(roomBySlot.NW.S);
    const SW_S=boundsOfSourceRoom(roomBySlot.SW.S);
    const NE_S=boundsOfSourceRoom(roomBySlot.NE.S);
    const SE_S=boundsOfSourceRoom(roomBySlot.SE.S);

Use these calculated bounding boxes in every cross-cell passage formula.

For AB, use:

    x0=NW_E.x1-0.5;
    x1=NE_E.x0+0.5;
    z0=OZ+30.5;
    z1=OZ+33.5;

For AC, use:

    x0=OX+30.5;
    x1=OX+33.5;
    z0=NW_S.z1-0.5;
    z1=SW_S.z0+0.5;

For BD, use:

    x0=OX+94.5;
    x1=OX+97.5;
    z0=NE_S.z1-0.5;
    z1=SE_S.z0+0.5;

Use the calculated global bounding boxes for every endpoint face.

Use the source room records' `spaceId` values for link endpoints.

Do not use local numeric plan-room IDs as link endpoints.

Keep the bounding-box objects private to the builder.

Do not store the bounding boxes in the validated T2 source plan.

The cross-cell wall-to-wall gap depends on endpoint roles:

| Endpoint roles | Gap |
|---|---:|
| `small` and `small` | 5 m |
| `small` and `medium` | 3 m |
| `medium` and `small` | 3 m |
| `medium` and `medium` | 1 m |

Require:

    1 <= crossCellGap && crossCellGap <= 5

Extend every cross-cell passage 0.5 m into each endpoint.

Keep the transverse width at 3 m.

Keep passage geometry clear of L-shaped notches.

### 4.15 Reference-link ordering and IDs

Emit all physical source rooms first.

Use this room order:

    NW.anchor
    NW.E
    NW.S
    NW.T when present
    NE.anchor
    NE.E
    NE.S
    NE.T when present
    SW.anchor
    SW.E
    SW.S
    SW.T when present
    SE.anchor
    SE.E
    SE.S
    SE.T when present

Assign sequential source-room IDs from zero.

Emit local links next.

Use this local link order for each cell:

    anchor -> E
    anchor -> S
    anchor -> T when present

Process cells in NW, NE, SW, SE order.

Append cross-cell links in this order:

    AB
    AC
    BD

Assign sequential link IDs from zero.

For all links, use:

    kind:'passage'

For all links, use one global rectangle.

For all links, use grid step 6.

Do not reorder links after generation.

Allow T2 to sort each link's rectangle array.

### 4.16 Reference passage ceilings

Keep T2's fragment conversion:

    ceil=Math.min(3,fromRoom.ceil,toRoom.ceil);

All T3 physical source rooms have ceilings at least 3 m.

Therefore every T3 reference passage converts to ceiling 3 m.

Do not draw separate random ceilings for reference passages.

Do not consume the D5 ordinary-corridor ceiling stream.

Keep ordinary corridor ceilings unchanged outside these reference passages.

### 4.17 Production random stream

Use exactly one production-builder stream:

    const r=mulberry32(hash2(seed>>>0,a,b,7710));

Do not use the legacy cell stream.

Do not use district-selection salt 7700 for room content.

Do not add production-builder salts.

Consume exactly 46 draws per district builder call.

Consume all scheduled draws even when a selected room does not exist.

Use these first two draws:

| Draw | Operation |
|---|---|
| 1 | `giant=r()<0.125` |
| 2 | `giantCell=Math.floor(r()*4)` |

Consume draw 2 unconditionally.

Use this giant-cell index map:

    0=NW
    1=NE
    2=SW
    3=SE

Consume 11 draws for each cell.

Use this exact local sequence:

| Cell draw | Operation |
|---|---|
| 1 | Room count |
| 2 | Anchor ceiling |
| 3 | E role |
| 4 | E shape |
| 5 | E ceiling |
| 6 | S role |
| 7 | S shape |
| 8 | S ceiling |
| 9 | T role |
| 10 | T shape |
| 11 | T ceiling |

Use this complete global sequence:

| Draw numbers | Cell |
|---|---|
| 1–2 | Giant selection |
| 3–13 | NW |
| 14–24 | NE |
| 25–35 | SW |
| 36–46 | SE |

Require:

    2+4*11===46

Do not draw randomness during template transformation.

Do not draw randomness during source ID assignment.

Do not draw randomness during link construction.

Do not draw randomness during grid construction.

Do not draw randomness during validation.

### 4.18 Anchor-feature allocation

Keep the complete T2 anchor-feature policy.

Use only the primary anchor fragment for existing large features.

Generate these features through the existing helper paths:

1. Straight flights and switchback flights.
2. Voids.
3. Hall split attempt.
4. Showcase and window.
5. Pools.
6. B1 maze.
7. Columns.
8. Lamps.

Use T2's exact full assembly order.

Keep the original `r` from `ownHall(i,j)` for anchor features.

Keep existing salted streams for existing salted features.

Do not consume this stream during district room construction.

Keep existing feature draw order.

Keep existing feature selection thresholds.

Do not add large features to non-anchor physical rooms.

Give non-anchor physical room fragments lamps only.

Give secondary anchor fragments lamps only.

Do not call `addColumns` for those fragments.

Do not change sealed showcase behavior.

Exclude sealed showcases from physical-source-room reachability targets.

Do not exempt any actual physical source room.

### 4.19 Production-only access protection

Add this private helper in `js/gen2.js`:

    function clusterAccessMouths(
      hall,
      baseMouths,
      exteriorEntries,
      i,
      j,
      hasT
    )

Return a new array.

Do not mutate the input arrays.

Use `hall` as the selected primary anchor fragment.

Use `baseMouths` as the complete existing T2 protected-mouth array.

Use `exteriorEntries` for actual outer-district corridor mouths.

Each exterior entry has this shape:

    {
      axis:'x'|'z',
      side:-1|1,
      mid:number
    }

Use the final corridor mouth's transverse midpoint for `mid`.

Preserve 0.25 m midpoint offsets from D3.

Use `i,j` as global cell indices.

Use `hasT` to control the T spur.

### 4.20 Production-template recognition

Find the primary source room with the primary fragment's `sourceId`.

Look up that `spaceId` in `district.rooms`.

Activate extra protection only for source role `main` or `giant`.

Keep the existing T2 protection behavior for roles `anchor` and `room`.

For a production cell, calculate its exact global bounds:

    const cellX0=64*i;
    const cellX1=64*i+64;
    const cellZ0=64*j;
    const cellZ1=64*j+64;

Count physical source rooms only when every required predicate is true.

Use this exact predicate:

    const productionRoles=new Set([
      'small','medium','main','giant'
    ]);

    const belongsToCurrentCell=room=>
      room.lv===0 &&
      productionRoles.has(room.role) &&
      room.rects.every(q=>
        q.x0>=64*i &&
        q.x1<=64*i+64 &&
        q.z0>=64*j &&
        q.z1<=64*j+64
      );

Use the current cell indices `i,j`.

Do not use the district origin as the cell origin.

Do not count rooms that belong to the other three district cells.

Require all source rectangles of a counted room to satisfy the current-cell bounds.

Count distinct `spaceId` values only after applying the complete predicate.

Calculate:

    const physicalIds=new Set(
      district.rooms
        .filter(belongsToCurrentCell)
        .map(room=>room.spaceId)
    );

    const physicalCount=physicalIds.size;

Require:

    physicalCount===3 || physicalCount===4

Set:

    const hasT=physicalCount===4;

Reject other production counts with:

    TypeError('Invalid district plan')

Do not add source fields to identify production templates.

Do not use cell-local numeric room IDs for this check.

Keep T2 fixture anchor/room feature paths unchanged.

### 4.21 Canonical protection spines

Use the canonical NW anchor rectangle.

Define its lower coordinates from the selected role:

    main:  anchor.x0=16, anchor.z0=16
    giant: anchor.x0=12, anchor.z0=12

Define the horizontal spine:

    {
      x0:anchor.x0,
      x1:48,
      z0:30,
      z1:34
    }

Define the vertical spine:

    {
      x0:30,
      x1:34,
      z0:anchor.z0,
      z1:48
    }

Define the T spur:

    {
      x0:30,
      x1:48,
      z0:44,
      z1:48
    }

Generate the T spur only when `hasT===true`.

Reflect these rectangles using the owning cell transformation.

Add the district origin.

Use the transformed canonical centre:

    NW:[32,32]
    NE:[96,32]
    SW:[32,96]
    SE:[96,96]

Add `OX,OZ` to the centre.

Do not replace this centre with the giant anchor's geometric midpoint.

### 4.22 Exterior-mouth protection formulas

Use these private rectangle constructors:

    const H=(xa,xb,z)=>({
      x0:Math.min(xa,xb)-2,
      x1:Math.max(xa,xb)+2,
      z0:z-2,
      z1:z+2
    });

    const V=(x,za,zb)=>({
      x0:x-2,
      x1:x+2,
      z0:Math.min(za,zb)-2,
      z1:Math.max(za,zb)+2
    });

Let the transformed canonical centre be:

    C=[cx,cz]

For an x-facing exterior mouth, calculate:

    px=side>0 ? hall.x1 : hall.x0;
    pz=mid;

Append:

    H(px,cx,pz)
    V(cx,pz,cz)

For a z-facing exterior mouth, calculate:

    px=mid;
    pz=side>0 ? hall.z1 : hall.z0;

Append:

    V(px,pz,cz)
    H(px,cx,cz)

Use the actual primary anchor face.

Use the final existing corridor mouth midpoint.

Do not change the original corridor mouth geometry.

### 4.23 Outward snapping and clipping

Define:

    const outwardSnap=q=>({
      x0:Math.floor(q.x0/Q2)*Q2,
      x1:Math.ceil(q.x1/Q2)*Q2,
      z0:Math.floor(q.z0/Q2)*Q2,
      z1:Math.ceil(q.z1/Q2)*Q2
    });

Apply these steps to each new protection rectangle:

1. Construct the rectangle in global coordinates.
2. Apply `outwardSnap`.
3. Clip the rectangle to the primary anchor fragment.
4. Discard the rectangle when its clipped area is zero.
5. Append the remaining rectangle to the output array.

Use this exact clipping formula:

    const clip=q=>({
      x0:Math.max(q.x0,hall.x0),
      x1:Math.min(q.x1,hall.x1),
      z0:Math.max(q.z0,hall.z0),
      z1:Math.min(q.z1,hall.z1)
    });

Discard when:

    cut.x1<=cut.x0 || cut.z1<=cut.z0

Do not apply outward snapping to original T2 base mouths.

Do not change their coordinates or order.

Do not merge new protection rectangles.

Do not deduplicate new protection rectangles.

Consume zero random draws.

### 4.24 Protection-mouth ordering

Return protected mouths in this exact order:

1. Original T2 `baseMouths`.
2. Horizontal central spine.
3. Vertical central spine.
4. T spur when present.
5. First exterior mouth's two Manhattan rectangles.
6. Second exterior mouth's two Manhattan rectangles.

Use T2 neighbour order:

    +x,-x,+z,-z

Append only actual exterior corridor entries.

Skip the two inner `district` connection records.

Keep all original base mouths before extra spines.

Keep the original T2 3 m passage-mouth protection.

Keep the original T2 6 m continuation-mouth protection.

Pass the final protected-mouth array to the existing feature helpers.

Append cluster protected mouths to the anchor pool blockers.

Keep the existing 2 m pool-blocker margin.

Do not change legacy pool blockers.

### 4.25 Exact quarter-grid fixture

Use:

    hall={
      x0:16,
      x1:48,
      z0:16,
      z1:48
    };

    P={px:16,pz:32.25};
    C={cx:32,cz:32};

Use an exterior `-x` mouth.

Require the snapped and clipped horizontal rectangle:

    {
      x0:16,
      x1:34,
      z0:30,
      z1:34.5
    }

Require the snapped and clipped vertical rectangle:

    {
      x0:30,
      x1:34,
      z0:30,
      z1:34.5
    }

Require every new rectangle edge to be Q2-aligned.

Require the original midpoint to remain exactly `32.25`.

Require outward snapping not to reduce pre-clipping coverage.

Require the original base mouth to remain unchanged.

### 4.26 Split behavior

Keep the existing `addSplit` implementation unchanged.

Keep its original 0.3 attempt threshold.

Keep its invocation position.

Keep its original random stream.

The full horizontal and vertical protection spines intersect every wall-to-wall split candidate.

Therefore production-cluster anchors generate zero successful split features.

Keep the normal rejection behavior of `addSplit`.

Do not create replacement split features.

Do not reduce the protected area to permit splits.

Do not add artificial random draws.

Do not claim unchanged effective feature frequencies.

Unsuccessful split attempts can consume different draws from successful legacy attempts.

Preserve the original procedural draw order.

Keep legacy split behavior unchanged under `clusterShare:0`.

Keep T2 fixture split behavior unchanged.

### 4.27 Legacy report helper

Create:

    tests/unit/gen2-legacy-report.mjs

Export exactly:

    export function legacyReport(
      {seeds,cells}=CORPUS
    )

Import `CORPUS` from the existing measurement module.

Use `node:child_process.execFileSync`.

Use the current Node executable:

    process.execPath

Pass:

    ['--input-type=module','-e',CHILD_SOURCE]

Set the child working directory to the repository root.

Resolve that directory from `import.meta.url`.

Use this child configuration:

    {
      cwd:repoRoot,
      input:JSON.stringify({seeds,cells}),
      encoding:'utf8',
      maxBuffer:67108864
    }

Do not use a shell.

Use a fixed `CHILD_SOURCE` string.

Do not insert caller text into executable JavaScript.

The child source performs these operations in order:

    import {readFileSync} from 'node:fs';
    import {World2} from './js/gen2.js';
    import {measureWorld} from './js/gen2-measure.js';

    World2.prototype.districtPlan=function(){
      return null;
    };

    const args=JSON.parse(readFileSync(0,'utf8'));
    const report=measureWorld(args);

    process.stdout.write(JSON.stringify(report));

Use the prototype override only inside the child process.

Install the override before creating any World2 instance.

Keep the override out of the parent test process.

Parse child stdout as JSON.

Return the complete report, including `cost`.

Propagate child errors.

Do not return a fallback report.

Do not change production World2 prototypes.

### 4.28 Legacy baseline comparison

Use the public constructor for individual legacy plans:

    new World2(seed,{clusterShare:0})

Keep the 512 original plan hashes.

Hash each complete `JSON.stringify(plan)` with SHA-256.

For the complete legacy report, call:

    const {cost,...actual}=legacyReport(CORPUS);

Compare:

    assert.deepEqual(actual,fixture.report);

Calculate:

    const hash=createHash('sha256')
      .update(JSON.stringify(actual))
      .digest('hex');

Require:

    assert.equal(hash,fixture.reportSha256);

Remove only top-level `cost`.

Do not change nested report fields.

Do not regenerate the baseline fixture.

## 5 Procedure

### 5.1 Prerequisites

Complete T0 and T2 before T3 implementation.

Verify all T2 acceptance tests.

Verify the immutable T2 baseline.

Inspect the working-tree status.

Preserve existing unrelated edits.

Do not overwrite the current dirty measurement or reachability helpers.

Use exactly three green implementation commits.

Write a red test before implementing each new behavior.

Do not commit a failing intermediate state.

### 5.2 Commit 1 — Pure production builder

Commit message:

    feat(gen2): build deterministic cluster rooms

**Red test first**

Create `tests/unit/gen2-cluster-rooms.test.mjs`.

Add the pure-builder tests from Section 6.

Require the new tests to fail against T2's null-producing builder.

**Change**

Extend T2 role validation with the four production roles.

Implement the production room builder in `js/gen2-district.js`.

Implement all canonical room templates.

Implement cell transformations.

Implement the 46-draw production stream.

Implement room counts and role selection.

Implement ceiling filtering and selection.

Implement L-shaped rectangles.

Implement the private source-room bounding-box calculation.

Implement the private cell/slot-to-source-room mapping.

Implement reference passage construction.

Implement source IDs and source ordering.

Implement source grids.

Return the validated, frozen district plan.

Do not change the production `CLUSTER_SHARE` default in this commit.

Do not change existing feature generation in this commit.

**Green check**

Run the pure-builder tests.

Require all pure-builder tests to pass.

Run the complete verification commands from Section 5.5.

Require all commands to exit with code zero.

Commit only the authorized slice-1 changes.

### 5.3 Commit 2 — Runtime integration and protection

Commit message:

    feat(gen2): protect cluster room access

**Red test first**

Add the integration and feature-protection tests from Section 6.

Add the real-Player reachability tests.

Add the quarter-grid mouth fixture.

Add the production split-suppression assertions.

Require these tests to fail before the integration change.

**Change**

Add `clusterAccessMouths` in `js/gen2.js`.

Implement production-template recognition.

Implement the exact current-cell rectangle predicate.

Implement `hasT` from the current cell's distinct physical source-room count.

Implement the canonical protection spines.

Implement exterior-mouth H/V protection.

Implement outward snapping.

Apply protection only to production anchors.

Keep T2 fixture protection unchanged.

Pass the protected mouths to existing feature helpers.

Keep T2's cluster assembly order.

Keep existing salted random streams.

Keep the original legacy `makePlan` path.

Do not change the production `CLUSTER_SHARE` default in this commit.

**Green check**

Run the new integration tests.

Run the real-Player tests.

Require every physical source room to be reachable.

Require zero successful production split features.

Run the complete verification commands from Section 5.5.

Require all commands to exit with code zero.

Commit only the authorized slice-2 changes.

### 5.4 Commit 3 — Enable production clusters

Commit message:

    feat(gen2): enable production cluster districts

**Red test first**

Add production-share and selection tests.

Add the explicit-zero legacy baseline tests.

Add the legacy report isolation tests.

Require the default-share test to fail before changing the default.

**Change**

Set:

    export const CLUSTER_SHARE=0.5;

Keep explicit `clusterShare:0` behavior unchanged.

Create `tests/unit/gen2-legacy-report.mjs`.

Update the planned T2 baseline tests.

Update the planned T2 constructor-default test.

Apply the mechanical legacy test pinning from Section 5.6.

Preserve existing legacy assertions.

Do not modify measurement source code.

Do not regenerate the baseline fixture.

**Green check**

Require the production default to equal `0.5`.

Require the forced-factory tests to pass.

Require all 512 legacy plan hashes to match.

Require the complete legacy report and hash to match.

Run the complete verification commands from Section 5.5.

Require all commands to exit with code zero.

Commit only the authorized slice-3 changes.

### 5.5 Required verification commands

Run these commands after each green commit:

    node --test tests/unit/gen2-district*.test.mjs
    node --test tests/unit/gen2-cluster-rooms.test.mjs
    npm run test:unit
    npm run build
    npm test -- --project=desktop

Require exit code zero from every command.

During slice 1, add only the tests for implemented pure-builder behavior.

During slice 2, add the integration tests before changing integration code.

During slice 3, add the default-share and legacy-isolation tests before changing their behavior.

Do not weaken an assertion to make a test pass.

Do not change unrelated dirty files.

### 5.6 Mechanical legacy test pinning

Apply this rule to exactly these seven existing files:

    tests/unit/gen2.test.mjs
    tests/unit/gen2-mesh.test.mjs
    tests/unit/gen2-connections.test.mjs
    tests/unit/gen2-detour-walk.test.mjs
    tests/unit/gen2-coverage.test.mjs
    tests/unit/gen2-paths.test.mjs
    tests/unit/gen2-connection-walk.test.mjs

Change every existing one-argument World2 construction in these files.

Use:

    new World2(seed,{clusterShare:0})

instead of:

    new World2(seed)

Apply the same rule to other existing local seed-variable names.

Apply it in module-level fixtures.

Apply it in existing helper functions.

Apply it in nested test loops.

Do not apply this transformation to new production tests.

Replace every existing `measureWorld(...)` invocation in these seven files with `legacyReport(...)`.

Keep the original call arguments.

Update imports to use the new helper.

Remove unused measurement imports.

Keep direct `measurePlan` calls unchanged.

Keep direct `formatReport` calls unchanged.

Keep direct `measureWalks` calls unchanged.

Keep all existing assertions unchanged in meaning.

Keep all existing test names.

Keep all existing legacy expected numeric values.

Do not edit `tests/unit/reach.mjs`.

Do not edit `js/gen2-measure.js`.

Do not include future T1-specific test changes in this transformation.

## 6 Acceptance tests

### 6.1 Test files

Use:

    tests/unit/gen2-cluster-rooms.test.mjs
    tests/unit/gen2-legacy-report.mjs
    tests/unit/gen2-district-baseline.test.mjs
    tests/unit/gen2-district.test.mjs

Retain the seven historical suites listed in Section 5.6.

Use real World2 instances for integration tests.

Use the existing real Player for body tests.

Do not introduce mocked movement behavior.

### 6.2 Fixed pure-geometry corpus

Use:

    seeds=[1,2,3,7,42,99,1234,20261024]

Use district coordinates:

    a=-2..1
    b=-2..1

Process seeds in array order.

Process district rows in ascending `b` order.

Process districts within each row in ascending `a` order.

The corpus contains:

    8 seeds * 16 districts = 128 cases

Call `buildClusterDistrict` directly for each case.

Do not apply production-share selection to this pure-builder corpus.

Use the matching seed's World2 height values.

Do not depend on production district selection.

### 6.3 Exact new test names

Create these tests in:

    tests/unit/gen2-cluster-rooms.test.mjs

Use these exact test names:

1. `cluster rooms: 128 district counts and anchors`
2. `cluster rooms: exact canonical templates`
3. `cluster rooms: reflection and exterior contract`
4. `cluster rooms: roles and L geometry`
5. `cluster rooms: role ceilings and grids`
6. `cluster rooms: exact 46 draw stream`
7. `cluster rooms: reference passage tree`
8. `cluster rooms: immutable geometry and area gates`
9. `cluster rooms: planning determinism`
10. `cluster rooms: protected access and feature allocation`
11. `cluster rooms: real body reaches all source rooms`
12. `cluster rooms: production share and exclusions`
13. `cluster rooms: explicit-zero legacy baseline`

### 6.4 Test: 128 district counts and anchors

Test every case in the fixed 128-district corpus.

Require 12–16 distinct physical source `spaceId` values per district.

Require 3 or 4 physical source rooms per cell.

Use the exact current-cell predicate from Section 4.20 for integrated per-cell counts.

Require all source rectangles of a counted room to remain inside that current cell.

Count distinct `spaceId` values only after applying the cell-boundary predicate.

Require exactly four anchor keys.

Require four distinct anchor source IDs.

Require exactly one anchor per cell.

Require every anchor role to be `main` or `giant`.

Require at most one giant per district.

Require satellite roles to be `small` or `medium`.

Require every source physical room to use `lv:0`.

Exclude reference passages from the physical-room count.

Exclude feature-generated rooms from the physical-room count.

Require the exact count selected by the independent RNG oracle.

Reject any reduced room count.

### 6.5 Test: Exact canonical templates

Compare every anchor rectangle with Section 4.7.

Compare every satellite bounding rectangle with Section 4.8.

Calculate satellite bounds from all transformed global source rectangles.

Use the private bounding-box formula from Section 4.14 as the independent expected calculation.

Cover `main` and `giant` anchor templates.

Cover all six satellite slot/role combinations.

Require every coordinate to match exactly.

Require all coordinates to be Q2-aligned.

Require no production rectangle outside its assigned template.

Require E and S in every production cell.

Require T exactly when the selected count is four.

### 6.6 Test: Reflection and exterior contract

Test all four cell transformations.

Test negative district indices.

Compare transformed rectangles with the exact interval-reflection formula.

Require the correct global district offsets.

Require outward anchor gaps of 12 or 16 m.

Require the transverse central bands.

Require all source geometry within the T2 exterior bounds.

Require all physical source rooms wholly inside their owning cells.

Require identical transformed geometry under repeated generation.

### 6.7 Test: Roles and L geometry

Test rectangular `small` rooms.

Test rectangular `medium` rooms.

Test L-shaped `small` rooms.

Test L-shaped `medium` rooms.

Require the exact areas:

    small rectangle:130
    small L:121
    medium rectangle:217.5
    medium L:208.5
    main rectangle:1024
    giant rectangle:1296

Require two rectangles for every L-shaped room.

Require zero positive-area overlap between the two L rectangles.

Require positive-length edge contact.

Require the exact 3×3 m removed corner.

Require passage access to remain outside the removed corner.

Require the fixed corpus to contain both satellite size roles.

Require the fixed corpus to contain both satellite shape types.

Require both rectangular and L-shaped satellites of each size in the corpus.

Keep legacy fixture roles unchanged.

### 6.8 Test: Role ceilings and grids

Use these exact ceiling fixtures for seed `42`, district `(1,1)`:

| `Y` | Required result |
|---|---|
| `{1:9}` | Retain every candidate in all four role arrays. |
| `{1:6.5}` | Giant candidates `[4.5,5]`; retain the other role arrays. |
| `{1:6}` | Giant `[4.5]`; main `[4,4.5]`; retain medium and small arrays. |
| `{1:4}` | Throw the specified RangeError. |
| `{1:NaN}` | Throw the specified RangeError. |
| `{1:Infinity}` | Throw the specified RangeError. |
| `{1:-Infinity}` | Throw the specified RangeError. |
| `{}` | Throw the specified RangeError. |
| `null` | Throw the specified RangeError. |

Require the exact error message:

    Invalid district ceiling range

Require all physical source ceilings to be Q2-aligned.

Require each selected ceiling to belong to its filtered role array.

Require one ceiling draw for each scheduled slot.

Require the correct grid origin for every source-room union.

Require `grid.step===6`.

Require reference passage grid step 6.

Require equal grid records across logical-source fragments.

Require existing fixture roles and grids to remain unchanged.

### 6.9 Test: Exact 46 draw stream

Build an independent test oracle.

Use the public `hash2` and `mulberry32` algorithms as the oracle specification.

Do not call the production builder to calculate expected results.

Reconstruct every scheduled random draw independently.

Require exactly 46 draws.

Require identical giant flags.

Require identical giant-cell indices.

Require identical room counts.

Require identical roles.

Require identical shapes.

Require identical ceilings.

Require identical source rectangle coordinates.

Require identical source-room IDs.

Require identical reference-link IDs.

Require identical link endpoints.

Require identical anchors.

Require identical room and link array ordering.

Verify absent-T draw consumption.

Verify unconditional giant-cell draw consumption.

Verify no extra draw during template transformation.

Test seed normalization:

    seed -1 == seed 4294967295
    seed 0 == seed 4294967296

Compare complete validated serialization for these equivalent seeds.

### 6.10 Test: Reference passage tree

For every pure corpus district, let `R` be its physical source-room count.

Require:

    links.length===R-1

Require exactly three cross-cell links.

Require the cross-cell order AB, AC, BD.

Require one local link per satellite.

Require sequential link IDs.

Require complete source IDs in both endpoints.

Require `kind==='passage'`.

Require one rectangle per link.

Require transverse width exactly 3 m.

Require endpoint overlap of at least 0.5 m along the passage direction.

Require every local solid gap to equal 0.5 m.

Require cross-cell solid gaps to be 1, 3, or 5 m.

Require every cross-cell gap to be at most 5 m.

Require every link to contact both endpoints with positive area.

Require zero passage overlap with non-endpoint physical rooms.

Require zero positive-area overlap between distinct passage IDs.

Require zero isolated source rooms.

Require one connected source-room graph.

Require no generated ordinary internal corridors.

Resolve all six cross-cell endpoint labels with the private mapping from Section 4.14.

Calculate each endpoint bounding box from every transformed global source rectangle.

Compare AB, AC, and BD coordinates with the exact formulas from Section 4.14.

Require correct results for rectangular and L-shaped endpoints.

Require correct results for all four small/medium endpoint combinations.

Require no scalar bounding-box fields on source room records.

### 6.11 Test: Immutable geometry and area gates

Require `validateDistrictPlan` to accept every production case.

Require the returned plan to be deeply frozen.

Require source rectangles to use canonical ordering.

Require valid source IDs.

Require valid anchor keys.

Require no physical-room positive-area overlaps.

Require no same-room rectangle interior overlaps.

Require edge-connected source-room unions.

Require no disconnected passage geometry.

Require all passage endpoints to exist.

Require no corner-only source connections.

Require valid T2 continuation intervals.

Require T2 geometry errors for invalid source geometry.

Calculate each physical-room area from its source-rectangle union.

Sort all sampled physical-room areas numerically:

    const sorted=areas.toSorted((a,b)=>a-b);

Define the median as:

    const median=sorted[Math.floor(sorted.length/2)];

Require:

    median>=120
    median<=280

The exact template area range gives a stronger bound:

    121<=median && median<=217.5

Keep the agreed 120–280 m² gate.

Do not use `measurePlan` room-area totals as individual physical-room areas.

### 6.12 Test: Planning determinism

Use the four forced-body test cases from Section 6.14.

For every case, create separate forced-factory worlds.

Build the four district cells in this order:

    NW,NE,SW,SE

Build them in reverse order in another world:

    SE,SW,NE,NW

Compare complete `JSON.stringify(plan)` values.

Reorder comparison results into canonical NW, NE, SW, SE order.

Evict the selected district from the T2 district cache.

Remove its four cached cell plans.

Recreate the district plan.

Rebuild the four cells.

Require the original complete serialized values.

Keep T2 FIFO behavior unchanged.

Keep T2 immutable cache ownership unchanged.

Require no dependence on the order of district requests.

### 6.13 Test: Protected access and feature allocation

Test production anchors with roles `main` and `giant`.

Test fixture anchors with role `anchor`.

Require fixture-only behavior to remain unchanged.

Require production recognition from source role.

Require exact `hasT` values for counts three and four.

Require the current-cell bounds to use `64*i` and `64*j`.

Require all four rectangle inequalities from Section 4.20.

Require distinct `spaceId` counting after the complete predicate.

Require other district cells' rooms to be excluded.

Require the exact H, V, and T spine coordinates.

Require the exact cell reflections.

Require the exact exterior-mouth formulas.

Require original base mouths to precede extra spines.

Require exterior entries to use the fixed neighbour order.

Require no rectangle merging.

Require zero random draws for protection construction.

Require all new protection edges to be Q2-aligned.

Test the exact `mid=32.25` fixture from Section 4.25.

Require its two expected rectangles.

Require the original mouth midpoint to remain unchanged.

Require original base mouths to remain byte-identical.

Require only the primary anchor fragment to receive large features.

Require non-anchor physical fragments to receive lamps only.

Require secondary anchor fragments to receive lamps only.

Require no non-anchor columns.

Require the original feature helper order.

Require the original feature random-stream inputs.

Require every mandatory reference passage mouth to remain protected.

Require pool blockers to include the extra cluster protection.

Require the existing 2 m pool margin.

Require no successful production split features.

For every tested production-cluster cell, require:

    plan.voids.filter(v=>v.kind==='split').length===0

Require no split-generated `shaft` room in those cells.

Require every wall-to-wall split candidate to intersect a protected spine under the existing clearance rule.

Do not require equal effective split frequencies between legacy and production layouts.

Require unchanged fixture and legacy split behavior.

### 6.14 Test: Real body reaches all source rooms

Use seeds:

    [1,42]

Use districts:

    [(1,1),(-1,-1)]

Use the Cartesian product.

This gives exactly four test cases.

For each case, create a separate legacy world:

    const legacy=new World2(seed,{clusterShare:0});

Use its existing `Y` values.

Build the selected production source district:

    const source=buildClusterDistrict(
      seed,a,b,legacy.Y
    );

Create a factory that returns `source` only for `(a,b)`.

Return `null` for every other district.

Create the test world with that factory.

Do not depend on production random cluster selection.

Calculate:

    OX=128*a;
    OZ=128*b;

Use these start candidates in order:

    [
      [OX+47.5,OZ+32,0],
      [OX+47,  OZ+32,0],
      [OX+46.5,OZ+32,0],
      [OX+46,  OZ+32,0]
    ]

Select the first candidate satisfying all three predicates:

    player.canStand(world,x,z,0)===true

    world.surfaceAt(x,z,0).h===0

    Number.isNaN(world.surfaceAt(x,z,0).wl)===true

Set `player.x` and `player.z` before each `canStand` call.

Read the surface fields before another world query changes the shared result.

Fail the test when all four start candidates fail.

Do not use a random start position.

Do not teleport to another source room after failure.

Call `reachSet` exactly once per test world:

    const states=reachSet(
      world,
      OX+12,OZ+12,
      OX+116,OZ+116,
      start
    );

For every physical source room, find one qualifying state `[x,z,h]`.

Require:

    h===0

Require the complete body footprint strictly inside one source rectangle:

    x-0.4>rect.x0
    x+0.4<rect.x1
    z-0.4>rect.z0
    z+0.4<rect.z1

Require the state to satisfy the three standable, level-zero, and dry predicates.

Identify each target by source `spaceId`.

Do not identify targets by numeric cell-plan room IDs.

Require all physical source rooms to be reached.

Exclude intentionally sealed showcase rooms.

Exclude other auxiliary feature-generated rooms.

Do not exempt any production physical source room.

### 6.15 Test: Production share and exclusions

Require:

    CLUSTER_SHARE===0.5

Require a default World2 constructor to use share `0.5`.

Require explicit `clusterShare:0` to preserve legacy selection.

Require explicit `clusterShare:1` to use the maximum permitted production selection.

Keep the start-district exclusion for both explicit shares.

Keep the start-district exclusion for forced factories.

Use the exact selection salt:

    7700

Require deterministic district selection from the selection draw.

Require normal selection to exclude legacy shared-hall districts.

Require forced-factory precedence over the share test.

Require forced-factory precedence over shared-hall exclusion.

Require the start exclusion to precede forced-factory selection.

Require factory `null` results to select legacy layout.

Require invalid non-null factory results to throw.

Require rejected plans not to enter the district cache.

Require identical selections for independent worlds with equal seeds and options.

Require mixed production/legacy outer links to preserve T2 contracts.

Require internal cluster edges to use `mode:'district'`.

Require no `gaps`, `corridor`, `route`, `eligible`, or `parts` on district-mode records.

Require Stage 02B external corridor rules to remain unchanged.

### 6.16 Test: Explicit-zero legacy baseline

Use the immutable T2 fixture:

    tests/fixtures/gen2-district-baseline.json

Require all 512 legacy plan hashes to match.

Construct each legacy plan world with:

    new World2(seed,{clusterShare:0})

Require the complete legacy report to match.

Use the isolated `legacyReport(CORPUS)` helper.

Remove only the report's top-level `cost`.

Compare the complete remaining report with the fixture.

Compare its SHA-256 hash with `reportSha256`.

Do not replace expected values.

Do not update baseline hashes.

Do not regenerate the baseline fixture.

### 6.17 Existing T2 regression tests

Keep the T2 test names and assertions.

Keep these baseline test names:

    district baseline: 512 default plans unchanged
    district baseline: deterministic report unchanged

Pin the first test to explicit `clusterShare:0`.

Use the isolated legacy report for the second test.

Keep all T2 geometry, cutting, seam, cache, and ownership tests.

Keep T2 mixed outer-boundary tests.

Keep T2 spawn safety tests.

Keep T2 forced-fixture reachability tests.

Keep T2 malformed-plan rejection tests.

Keep T2 lamp-grid tests.

Update only the T2 constructor-default expectation from zero to `0.5`.

Keep the explicit-zero constructor assertion.

### 6.18 Legacy connection and coverage assertions

In `gen2-connections.test.mjs`, retain all legacy edge and connector-room assertions.

Keep the expected connection-mode counts.

Keep the expected connector-room counts.

Keep the expected graph-component counts.

Keep the expected walk statistics.

Use `legacyReport` for the existing report comparisons.

Use explicit-zero World2 instances for direct legacy comparisons.

In `gen2-coverage.test.mjs`, retain all pure `measurePlan` assertions.

Keep the existing report-order invariance test.

Keep the existing finite-area assertions.

Keep the existing giant/L/connector-room accounting assertions.

Use `legacyReport` for report-level assertions.

Do not weaken expected numeric values.

### 6.19 Production measurement limitation

The existing `measureWorld` implementation does not fully support production cluster districts.

Its current connection code assumes corridor-specific `gaps` fields.

T2 district-mode connection records intentionally omit those fields.

The current `measureWalks` code also uses corridor-specific fields.

Do not add placeholder fields to district-mode records.

Do not use the current mixed-layout `measureWorld` report as a T3 production gate.

Use the independent source-geometry corpus instead.

Use real-Player reachability for integrated access checks.

Use `cellRaster` for compatible local geometry assertions.

Use `measurePlan` only for compatible per-cell geometry measurements.

Use isolated legacy reports for historical regression tests.

Do not claim mixed-layout support from `tools/gen2-measure.mjs`.

The current T1 handoff does not complete the T2 district-mode adapter.

A later T1 integration must add explicit district-mode and multi-room support.

Keep that later work outside T3.

## 7 Out of scope

### 7.1 T4 — Shared openings

T4 owns final shared-wall opening geometry.

T4 owns solid strip thickness and opening forms.

T4 owns opening widths and heights.

T4 owns opening placement along shared walls.

T4 owns opening-specific cutting and collision tests.

T4 can replace T3's temporary short-passage geometry.

Keep T3 source-room identities stable.

### 7.2 T5 — Cluster topology

T5 owns final cluster group types.

T5 owns final room-graph topology.

T5 owns loop frequency and dead-end distribution.

T5 owns main-room exit counts.

T5 owns graph generation before final geometry.

T5 can replace T3's temporary tree topology.

Keep T3 physical-room geometry and source identities stable.

### 7.3 T6 — Link selection

T6 owns final distance-based link selection.

T6 owns short-passage, corridor, and connector-room selection.

T6 owns internal diagonal and pruning policies for cluster districts.

T6 owns final corridor-stretch enforcement inside cluster layouts.

T6 must preserve D1–D8.

T6 can replace T3's temporary reference-link policy.

### 7.4 T1 — Measurement integration

T1 owns the general room-graph measurement model.

A later T1 integration must support T2 `mode:'district'` records.

That integration must support multiple physical source rooms per cell.

It must identify logical physical rooms by `spaceId`.

It must interpret source passage links.

It must support cross-cell connectivity.

It must not require nonexistent corridor `gaps` fields.

It must support mixed cluster and legacy reports.

Do not treat the existing T1 handoff as proof of this integration.

Do not change `js/gen2-measure.js` in T3.

Do not change `tools/gen2-measure.mjs` in T3.

### 7.5 Other exclusions

Do not change v1 generation.

Do not change save schema v1.

Do not change the default generator selection.

Do not change `js/cells2.js`.

Do not change prefabs.

Do not add dependencies.

Do not change existing body collision semantics.

Do not modify T2 public interfaces.

Do not add new production random salts beyond 7710.

Do not add final topology behavior in T3.

Do not add gallery corridors in T3.

Do not implement features during the design-handoff preparation task.

Implement features only during the authorized T3 coding stage.

## 8 Open conflicts with user decisions

None.
