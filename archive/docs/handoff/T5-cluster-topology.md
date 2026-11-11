# Handoff T5 — Cluster Topology

## 1 Goal

Generate deterministic topology for every v2 cluster district.
Use one group across its 12–16 fixed T3 physical source rooms.
Generate the source-room graph before link geometry.
Materialize every selected link without T6 callbacks or unresolved geometry.
Keep one connected source-room component per district.
Keep eight exterior connections and one connected component in the finite mixed-world fixture.

## 2 Scope

### 2.1 Files to change

| File | Required change |
|---|---|
| `js/gen2-district.js` | Add pure topology, room descriptors, link materialization, and explicit geometry preflight. |
| `js/gen2.js` | Always add production anchor topology protection before features. |
| `tests/unit/gen2-cluster-topology.test.mjs` | Add ten exact topology and integration tests. |
| `tests/unit/gen2-cluster-rooms.test.mjs` | Replace only two obsolete T3 link-dependent test assertions. |

Write red tests before each implementation slice.

### 2.2 Files that must not change

Do not modify `js/world.js`, `js/regions.js`, `js/cells2.js`, `js/mesh2.js`, `js/main.js`, or `js/save.js`.
Do not modify `js/player.js`, `js/rng.js`, `js/gen2-measure.js`, or `tests/unit/reach.mjs`.
Do not modify `tests/e2e/gen2.spec.js`, `tests/unit/gen2-openings.test.mjs`, or `tests/unit/gen2-openings-mesh.test.mjs`.
Do not modify other T2/T3/T4 tests, T2 baseline fixtures, prefabs, dependency manifests, or npm scripts.
Do not modify `docs/handoff/T0-02b-finish.md` through `docs/handoff/T4-shared-openings.md`.
Do not regenerate the 512-hash T2 baseline.

## 3 Fixed premises

### 3.1 Dependency precedence

Implement and verify T2–T4 before T5; treat their handoffs as fixed future contracts.
Treat T0 as concurrent work; verify its implementation separately.
Use T3's production builder and `CLUSTER_SHARE=0.5`, not T4's stale null-builder or zero-share placeholders.
Apply T4 openings after T3's production-role validator extension.

### 3.2 Geometry and constants

| Item | Value |
|---|---|
| Cell, district, grid | 64 m; 128×128 m; `Q2=0.5 m` |
| Body, step, eye | 0.4 m half-side; 0.8 m; 1.6 m |
| Production source level | All T3 physical sources `lv:0` |
| Physical rooms | 3–4 per cell; 12–16 per district; one distinct anchor per cell |
| Anchors | `main` or `giant`, `rect`; at most one giant per district |
| Satellites | `small`/`medium`; `rect` or `L` |
| Ceilings | Small `[3,3.5,4]`; medium `[3.5,4,4.5]` |
| Ceilings | Main `[4,4.5,5]`; giant `[4.5,5,5.5]` |
| Ceiling cap | `Y[1]-1.5` |
| Physical/source lamp grid | `step:6` |
| Salts | Selection 7700; rooms 7710; topology 8810; openings 8800/8801 |
| District cache | `this.districts:Map`; FIFO 100; key `${a},${b}` |
| Room/link IDs | `v2:space:${a},${b}:r${k}` / `v2:dlink:${a},${b}:${k}` |
| Production selection | `CLUSTER_SHARE=0.5`; `(0,0)` always legacy |

Preserve all T3 physical templates, 46 draws, room ordering, ceilings, IDs, and grids.
Preserve T2 exterior source bounds `[OX+12,OX+116]×[OZ+12,OZ+116]`.
Preserve four anchors' bands `[64*i+24,64*i+40]` and `[64*j+24,64*j+40]`.
Preserve eight exterior connections, T2's 12–24 m exterior anchor gaps, and half-open clipping.

### 3.3 Fixed user decisions D1–D8

| ID | Rule |
|---|---|
| D1 | Prune at most one legacy ordinary inner link per district; no detour cap. |
| D2 | Shortest neighbouring-hall paths have no continuous corridor stretch above 36 m. |
| D3 | Ordinary/stub/dogleg/winding widths `[1.5,2,2,2.5,3,3.5]` m. |
| D4 | Diagonal widths `[1.5,2,2,2.5]` m. |
| D5 | Ordinary corridor ceilings `[2,2.5,3]` m; one-third each before rejection. |
| D6 | Connector-room body width 12–16 m. |
| D7 | Every accepted diagonal above 36 m receives a middle room. |
| D8 | Unlimited total turning-route length; T0 axial wall-to-wall cap 36 m. |

Use positive 0.25 m centre shift for widths 1.5, 2.5, and 3.5 m.
Keep final cluster corridors, diagonals, pruning, link classifications, and stretch enforcement within T6.
Do not add walk mean/p90 or pruning-detour gates.

### 3.4 T2/T4 contracts

Preserve T2 exports `buildClusterDistrict`, `fixtureCluster`, `fixtureSeamCluster`, `validateDistrictPlan`, `clipDistrictRect`, `cutDistrictCell`.
Preserve `World2.districtPlan`, `legacySharedInDistrict`, `makeClusterPlan`, and source `{a,b,rooms,links,anchors}`.
Preserve T2 `passage` and T4 `shared-opening` source kinds.
Keep T4 styles `open`, `doorway`, `row` with normal gaps `0/0.5/0.5` m.
Keep 0.5 m endpoint overlap, doorway widths `[1.5,2,2.5,3,4]`, and heights `[2,2.5,3]`.
Keep doorway end jambs at least 0.5 m; row apertures 2.5 m, piers 1 m, count 2–5.
Keep five independent T4 draws per valid call; opening height at least 2 m; link lamps zero.
Keep T2's 3 m passage and 6 m continuation mouths, T4's 3 m aperture mouths, and T3 spines.
Keep T4 fixture counts `sharedOpeningLinkCount===4`, `totalSourceLinkCount===4`, and `directShare===1` separately.

## 4 Data and functions

### 4.1 Public topology contract

Export `buildClusterTopology(seed,a,b,roomSpec)` from `js/gen2-district.js`.
Use this exact descriptor array:

    roomSpec=[{spaceId,cell,slot,role,shape}]

| Field | Exact rule |
|---|---|
| `seed,a,b` | Safe integers; normalize valid `seed>>>0` |
| `roomSpec` | Dense array; 12–16 records; 3–4 per cell |
| Record | Plain object; prototype `Object.prototype` or `null` |
| Own keys | Exactly five data properties; no symbol, accessor, inherited substitute, or extra key |
| `spaceId` | Index `k` requires `v2:space:${a},${b}:r${k}` |
| `cell` | `0=NW`, `1=NE`, `2=SW`, `3=SE`, in ascending order |
| `slot` | `anchor,E,S`, optional T; this exact order per cell |
| `role` | Anchor `main`/`giant`; satellite `small`/`medium` |
| `shape` | Anchor `rect`; satellite `rect`/`L` |
| Counts | Four distinct anchors; at most one giant; no duplicate `(cell,slot)` |

Use `Reflect.ownKeys` to reject unexpected own symbol or string keys.
Throw `TypeError('Invalid cluster topology')` for every invalid direct-call input.
Do not mutate or freeze caller-owned objects.
Return a deeply frozen new object with this exact shape:

    {
      groupType,
      roomIds:[spaceId],
      edges:[{from:spaceId,to:spaceId}],
      exterior:[{cell,anchor:spaceId,faces:[face,face]}]
    }

Canonicalize each pair by numeric room index: `fromIndex<toIndex`.
Sort edges by `(fromIndex,toIndex)`; reject self-links, duplicates, unknown nodes, and noncandidate pairs.
Keep exactly these exterior records in cell order:

| Cell | Anchor | Faces |
|---|---|---|
| 0 | NW.anchor | `['nx','nz']` |
| 1 | NE.anchor | `['px','nz']` |
| 2 | SW.anchor | `['nx','pz']` |
| 3 | SE.anchor | `['px','pz']` |

Use each actual anchor `spaceId`; omit geometry, link IDs, and topology metadata from source records.

### 4.2 RNG and motif edges

Use exactly two topology draws:

    const r=mulberry32(hash2(seed>>>0,a,b,8810));
    const typeDraw=r(), perimeterDraw=r();
    const o=Math.floor(perimeterDraw*4);

Consume draw two even when no perimeter edge is omitted.
Do not consume T3, T4, or legacy RNG draws for topology selection.

| Draw interval | Group | Weight |
|---|---|---:|
| `[0,.25)` | `tight-cluster` | 25% |
| `[.25,.50)` | `main-and-side` | 25% |
| `[.50,.70)` | `ring` | 20% |
| `[.70,.85)` | `nested` | 15% |
| `[.85,1)` | `gallery-grid` | 15% |

Treat `nested` as a flat motif; physical split-level group weight is zero.

    0 AB: NW.E--NE.E
    1 AC: NW.S--SW.S
    2 BD: NE.S--SE.S
    3 CD: SW.E--SE.E

Always include all four anchor–E and all four anchor–S edges.
Select additional edges by this exact table:

| Group | Perimeter | Anchor–T | E–T | T–T |
|---|---|---|---|---|
| `tight-cluster` | Exclude `o` | Every T | Every T | None |
| `main-and-side` | Exclude `o` | Every T | None | None |
| `ring` | All four | Every T | None | None |
| `nested` | Exclude `o` | None | Every T | None |
| `gallery-grid` | All four | Every T | Every T | Eligible pairs |

T–T candidates are NW.T–NE.T and SW.T–SE.T only.
Require both T endpoints before selecting either matched pair.
With `N=0`, tight/main/nested share one graph for a fixed `o`.
With `N=0`, ring/gallery share one graph.
Keep group labels distinct for both degeneracies.

### 4.3 Exact graph gates

Let `N` count present T rooms; let `R=12+N`.
Let `P=Number(NW.T&&NE.T)+Number(SW.T&&SE.T)`.
Let `M` count T-bearing E endpoints of omitted perimeter edge `o`.
Set `M=0` for omitted AC or BD.
Let `E` count unique realized internal edges; require one connected component.
Use `cycleRank=E-R+1` after connectivity validation.
Count dead ends as physical source nodes with internal degree one.
Count internal degree by distinct adjacent physical `spaceId`, excluding exterior links.
Require every source room to have degree at least one.

| Group | `E` | Cycle rank | Dead ends | Direct `D` |
|---|---:|---:|---:|---:|
| `tight-cluster` | `11+2*N` | `N` | `2-M` | `8+N` |
| `main-and-side` | `11+N` | `0` | `2+N` | `8+N` |
| `ring` | `12+N` | `1` | `N` | `8+N` |
| `nested` | `11+N` | `0` | `2+N-M` | `8` |
| `gallery-grid` | `12+2*N+P` | `1+N+P` | `0` | `8+N` |

Require anchor internal degree `2+Number(hasT)`, except `nested` degree two.
Define direct as actual source `kind==='shared-opening'` only.
Require `directShare===D/E` and `directCount===D` per motif.
Require all realized T5 endpoint gaps at most 5 m.
Require `directOrShortCount===E` and `directOrShortShare===1` for temporary T5 geometry.
Report `loopPositiveCount/districtCount` with `cycleRank>0`.
Report expected probability `0.584375`; impose no statistical rejection band.
Require observed 128-corpus count 76 and share `0.59375`.

### 4.4 Room descriptors and builder

Add private helpers:

    describeClusterRooms(seed,a,b,Y)
    materializeTopologyLinks(seed,a,b,topology,canonicalRooms,rooms)
    assertTopologyLinkGeometry(a,b,topology,rooms,links)

Return `{roomSpec,canonicalRooms,rooms,anchors}` from `describeClusterRooms`.
Use `canonicalRooms:[{spaceId,cell,slot,role,shape,ceil,rects}]`.
Store their rectangles in NW-canonical district-local coordinates.
Use T3 mutable global source records for `rooms` and T2's four-key map for `anchors`.

    room={spaceId,lv:0,rects:[{x0,x1,z0,z1}],ceil,role,
          grid:{ox,oz,step:6}}
    passage={id,from,to,kind:'passage',rects:[rect],
             grid:{ox:rect.x0,oz:rect.z0,step:6}}
    openingLink={id,from,to,kind:'shared-opening',rects,
                 grid,opening}

Preserve T2's half-open cell cut equation:

    x0=max(rect.x0,64*i); x1=min(rect.x1,64*i+64)
    z0=max(rect.z0,64*j); z1=min(rect.z1,64*j+64)

Discard clips with `x1<=x0` or `z1<=z0`.
Keep common indices across all three room arrays.

Retain T3's exact room draw stream `mulberry32(hash2(seed>>>0,a,b,7710))`.
Use draws 1–2 for `giant=r()<.125` and unconditional `giantCell=Math.floor(r()*4)`.
Use eleven draws for each cell: NW 3–13, NE 14–24, SW 25–35, SE 36–46.
In each cell, draw count, anchor ceiling, then E/S/T role, shape, ceiling in that order.
Use `count=r()<.5?3:4`, role `r()<.6?'small':'medium'`, and shape `r()<.25?'L':'rect'`.
Consume T role/shape/ceiling draws even when T is absent.
Filter role ceilings by `Y[1]-1.5`; select via `Math.floor(r()*eligible.length)`.

Use fixed NW-canonical physical templates:

| Variant | x0 | x1 | z0 | z1 |
|---|---:|---:|---:|---:|
| Main | 16 | 48 | 16 | 48 |
| Giant | 12 | 48 | 12 | 48 |
| Small E | 48.5 | 61.5 | 27 | 37 |
| Medium E | 48.5 | 63.5 | 24.5 | 39 |
| Small S | 27 | 37 | 48.5 | 61.5 |
| Medium S | 24.5 | 39 | 48.5 | 63.5 |
| Small T | 48.5 | 61.5 | 41 | 51 |
| Medium T | 48.5 | 63.5 | 40 | 54.5 |

For L-shaped E/T, use:

    [{x0,x1:x1-3,z0,z1},{x0:x1-3,x1,z0:z0+3,z1}]

For L-shaped S, use:

    [{x0,x1,z0,z1:z1-3},{x0:x0+3,x1,z0:z1-3,z1}]

Keep small area 130/121, medium 217.5/208.5, main 1024, giant 1296 m².
Apply interval reflection `[lo,hi] -> [128-hi,128-lo]` before adding `OX=128*a,OZ=128*b`.
Use NW identity, NE x-reflection, SW z-reflection, and SE both reflections.
Compute each global room grid from the minima over all transformed source rectangles; use `step:6`.
Preserve T3 physical-room JSON serialization.

For public `buildClusterDistrict(seed,a,b,Y)`, validate indices before `Y` and ceiling arrays.
Require safe `a,b`, non-null object `Y`, finite `Y[1]`, and nonempty filtered ceiling arrays.
Keep T3 index error `TypeError('Invalid district plan')`.
Keep ceiling error `RangeError('Invalid district ceiling range')`.
Normalize `seed>>>0` after input and ceiling validation; preserve seed coercion.
Pass only the normalized seed into all three generation calls:

    const normalizedSeed=seed>>>0;
    const {roomSpec,canonicalRooms,rooms,anchors}=
      describeClusterRooms(normalizedSeed,a,b,Y);
    const topology=buildClusterTopology(normalizedSeed,a,b,roomSpec);
    const links=materializeTopologyLinks(
      normalizedSeed,a,b,topology,canonicalRooms,rooms);
    assertTopologyLinkGeometry(a,b,topology,rooms,links);
    return validateDistrictPlan({a,b,rooms,links,anchors},a,b);

Call the final validator once; do not validate a provisional tree.
Keep seed pairs `-1/4294967295` and `0/4294967296` equivalent.

### 4.5 Realized links and geometry

Assign sorted edge index `k` to link ID `v2:dlink:${a},${b}:${k}`.
Build local anchor–E/S/T links via `buildSharedOpening(seed,a,b,k,fromRoom,toRoom,'auto')`.
Reject `null`; do not retry with another style.
Keep T4's five-draw opening RNG and metadata unchanged.
Build remaining selected edges as temporary `kind:'passage'` links.
Use one 3 m transverse rectangle and 0.5 m overlap into each endpoint.
Calculate source-room bounding boxes from all rectangles in each union.
For AB/AC/BD/CD, use global source-room bounds:

    AB: x0=NW.E.x1-.5, x1=NE.E.x0+.5,
        z0=OZ+30.5, z1=OZ+33.5
    AC: x0=OX+30.5, x1=OX+33.5,
        z0=NW.S.z1-.5, z1=SW.S.z0+.5
    BD: x0=OX+94.5, x1=OX+97.5,
        z0=NE.S.z1-.5, z1=SE.S.z0+.5
    CD: x0=SW.E.x1-.5, x1=SE.E.x0+.5,
        z0=OZ+94.5, z1=OZ+97.5

Use actual southern source bounds for CD; never reflect already-built AB.
For E–T, calculate canonical E/T bounds before cell reflection:

    {x0:51,x1:54,z0:E.z1-.5,z1:T.z0+.5}

Reflect the complete E–T rectangle once, then add district origin.
For T–T, use global source bounds:

    NW.T--NE.T: {x0:NW.T.x1-.5,x1:NE.T.x0+.5,
                z0:OZ+44.5,z1:OZ+47.5}
    SW.T--SE.T: {x0:SW.T.x1-.5,x1:SE.T.x0+.5,
                z0:OZ+80.5,z1:OZ+83.5}

Set temporary passage `grid={ox:rect.x0,oz:rect.z0,step:6}`.
Use fragment ceiling `Math.min(3,fromRoom.ceil,toRoom.ceil)`, equal to 3 m for T3 passages.
Use T4 `opening.height`, full opening metadata, and zero lamps for shared-opening fragments.

### 4.6 Preflight and errors

Run private `assertTopologyLinkGeometry(a,b,topology,rooms,links)` before final validation.
Apply these checks in order:

1. Match realized link count to selected edge count.
2. Match sorted source endpoint IDs to selected canonical pairs.
3. Check sequential IDs `v2:dlink:${a},${b}:${k}`.
4. Reject duplicate, missing, unknown, or self-linked pairs.
5. Match `kind` to anchor versus temporary classification.
6. Check positive, finite, Q2-aligned rectangles.
7. Check district source bounds on every link rectangle.
8. Check finite Q2 grid origins and `step===6`.
9. Require one connected 3 m-wide temporary passage rectangle.
10. Compare temporary geometry with Section 4.5 formulas.
11. Require positive-area contact with both full endpoint unions.
12. Require 0.5 m normal overlap into each temporary endpoint.
13. Reject positive-area overlap with non-endpoint rooms.
14. Reject positive-area overlap between different links.
15. Apply T4 forbidden positive-length edge-contact rules.
16. Check T4 metadata, styles, apertures, widths, heights, gaps, jambs, piers, and exact bridge shape.
17. Check T2 seams/continuations; allow disconnected T4 row-aperture unions.
18. Recheck graph connectivity, degree, cycles, dead ends, and direct count.

Check actual source rectangle unions, not bounding-box intersections alone.
Throw `RangeError('Invalid cluster topology geometry')` for explicit selected-link preflight failures or T4 `null` results.
Propagate T4 structural `TypeError('Invalid shared opening')` unchanged.
Call `validateDistrictPlan(raw,a,b)` without a catch; propagate its existing errors unchanged.
Return the validator's deeply frozen, independently copied source.

### 4.7 Access protection

Add private `topologyAnchorMouths(hall,protectedMouths,districtLinks,i,j)` in `js/gen2.js`.
Always call it for production `main`/`giant` anchors, never for fixture `anchor`/`room` roles.
Call it after T2/T4 mouths and T3 `clusterAccessMouths`, before anchor features.
Calculate `a=Math.floor(i/2)`, `b=Math.floor(j/2)`, and `cellIndex=(i-2*a)+2*(j-2*b)`.
Require `hall.spaceId===district.anchors[`${i},${j}`]` and `cellIndex` in `0..3`.
Select `shared-opening` links incident to the current anchor `spaceId`.
Require the other endpoint to be an owning-cell satellite.
Sort selected links by final `k`, then apertures by stored index.
Set `mid=(lo+hi)/2` for every aperture.
For x-normal, require exactly one `hall.x1===c0` or `hall.x0===c1`.
For x-normal, require `hall.z0<=lo && hi<=hall.z1`.
For z-normal, require exactly one `hall.z1===c0` or `hall.z0===c1`.
For z-normal, require `hall.x0<=lo && hi<=hall.x1`.
Throw `RangeError('Invalid cluster topology geometry')` on ambiguous or unmatched faces.
Use the transformed canonical centre:

    cell 0: [OX+32,OZ+32]
    cell 1: [OX+96,OZ+32]
    cell 2: [OX+32,OZ+96]
    cell 3: [OX+96,OZ+96]

Use T3 width-4 rectangles:

    H(xa,xb,z): x=[min(xa,xb)-2,max(xa,xb)+2], z=[z-2,z+2]
    V(x,za,zb): x=[x-2,x+2], z=[min(za,zb)-2,max(za,zb)+2]

Append `H(faceX,cx,mid)`, then `V(cx,mid,cz)` for x-normal apertures.
Append `V(mid,faceZ,cz)`, then `H(mid,cx,cz)` for z-normal apertures.
Snap each lower bound down to Q2; snap each upper bound up to Q2.
Clip to the primary anchor fragment and owning cell:

    x0=max(q.x0,hall.x0,64*i); x1=min(q.x1,hall.x1,64*i+64)
    z0=max(q.z0,hall.z0,64*j); z1=min(q.z1,hall.z1,64*j+64)

Discard nonpositive-area results; do not merge, deduplicate, or reorder rectangles.
Append protected mouths in this order:

1. Original T2 mouths.
2. T4 aperture mouths in link/aperture order.
3. T3 horizontal/vertical spines and optional T spur.
4. T3 exterior strips in `+x,-x,+z,-z` order.
5. T5 aperture-to-centre strips in link/aperture order.

Keep the T3 T spur even when `nested` omits anchor–T.
Pass final mouths to existing feature helpers and anchor pool blockers.
Preserve the T2/T3 2 m pool blocker margin, fixture behavior, and feature RNG streams.

## 5 Procedure

Implement and verify T2–T4 before T5.
Write named red tests before each slice; require green checks before commits.
Preserve concurrent T0 work and unrelated edits.

### 5.1 Commit 1 — Pure graph

Write red `topology: input schema`, `topology: independent RNG and IDs`, and `topology: 320 motif cases`.
Implement the descriptor core and pure graph without changing T3's room draw stream.
Run `node --test tests/unit/gen2-cluster-topology.test.mjs` and `npm run test:unit`.
Require exit code zero.
Commit `feat(gen2): add deterministic cluster topology core`.

### 5.2 Commit 2 — Link materialization

Write red `topology: 128 production cases`, `topology: 64 bridge endpoint combinations`, and `topology: all selected link geometry`.
Materialize selected links, add preflight, and supersede two T3 link-dependent assertions.
Run both `node --test tests/unit/gen2-cluster-topology.test.mjs` and `node --test tests/unit/gen2-cluster-rooms.test.mjs`.
Run `npm run test:unit`; require exit code zero.
Commit `feat(gen2): materialize cluster topology links`.

### 5.3 Commit 3 — Protection and integration

Write the remaining four named red topology tests.
Add anchor protection and real-world acceptance gates.
Run `node --test tests/unit/gen2-cluster-topology.test.mjs`.
Require exit code zero for `npm run test:unit`, `npm run build`, and `npm test -- --project=desktop`.
Commit `feat(gen2): protect topology access and verify reachability`.

## 6 Acceptance tests

### 6.1 Names and core cases

Create `tests/unit/gen2-cluster-topology.test.mjs` with these exact ten tests:

1. `topology: input schema`
2. `topology: independent RNG and IDs`
3. `topology: 320 motif cases`
4. `topology: 128 production cases`
5. `topology: 64 bridge endpoint combinations`
6. `topology: all selected link geometry`
7. `topology: protection and error boundaries`
8. `topology: planning order and eviction`
9. `topology: real body reaches every source`
10. `topology: eight outer edges and mixed component`

For `input schema`, mutate one field per test case.
Reject missing, extra, inherited, accessor, symbol, duplicate, wrong-order, sparse, wrong-type, and non-plain records.
Reject missing anchor/E/S, extra T, wrong slot/role/shape/cell/ID, multiple giants, and invalid seed/index.
Assert `TypeError('Invalid cluster topology')` exactly.
Assert deeply frozen output and unchanged, unfrozen caller inputs.

For `independent RNG and IDs`, reconstruct both 8810 draws independently using `hash2` and `mulberry32`.
Assert T3 builder seed coercion and original ceiling validation priority.

For `320 motif cases`, use district `(1,1)` and all 16 T-presence masks.
Use `main` rectangular anchors and `small` rectangular satellites in T3 source order.
Use each fixed seed for its group and omission index:

| Group | `o=0` | `o=1` | `o=2` | `o=3` |
|---|---:|---:|---:|---:|
| `tight-cluster` | 16 | 20 | 2 | 18 |
| `main-and-side` | 0 | 23 | 7 | 42 |
| `ring` | 5 | 19 | 48 | 10 |
| `nested` | 27 | 52 | 1 | 12 |
| `gallery-grid` | 4 | 60 | 8 | 50 |

Assert `5*4*16===320` cases using an independent edge oracle.
Assert Section 4.3 formulas for `E,R,N,P,M`, cycles, dead ends, internal degrees, and group degeneracies.

### 6.2 Production corpus

For `128 production cases`, use seeds `[1,2,3,7,42,99,1234,20261024]`.
Use all districts `a,b=-2..1`, iterating seeds, ascending `b`, then ascending `a`.
Call public `buildClusterDistrict` with matching legacy-world `Y`; bypass cluster-share selection.
Assert 12–16 source rooms, 3–4 per cell, T3 geometry/role/ceiling/grid/ID invariants, and deep freeze.
Assert exact group counts `[38,28,23,20,19]` in Section 4.2 order.
Assert 76 loop-positive cases, observed `76/128===0.59375`, and theoretical expectation `0.584375`.
Compare complete physical-room JSON with the independent unchanged T3 source-room oracle.
Assert each case's exact selected edges and Section 4.3 quantitative gates.

### 6.3 Fixed 64 bridge cases

For `64 bridge endpoint combinations`, use district `(1,1)`.
Use variants `0=small-rect`, `1=small-L`, `2=medium-rect`, `3=medium-L`.
Use classes `EE=NW.E--NE.E`, `SS=NW.S--SW.S`, `ET=NW.E--NW.T`, `TT=NW.T--NE.T`.
Read one seed from this matrix for every ordered endpoint-variant pair:

| First | Second | EE | SS | ET | TT |
|---|---|---:|---:|---:|---:|
| 0 | 0 | 1 | 2 | 2 | 142 |
| 0 | 1 | 7 | 11 | 18 | 1035 |
| 0 | 2 | 17 | 1 | 4 | 159 |
| 0 | 3 | 6 | 121 | 107 | 128 |
| 1 | 0 | 5 | 17 | 59 | 1036 |
| 1 | 1 | 74 | 59 | 166 | 197 |
| 1 | 2 | 86 | 16 | 72 | 345 |
| 1 | 3 | 10 | 413 | 330 | 1592 |
| 2 | 0 | 3 | 25 | 35 | 257 |
| 2 | 1 | 9 | 0 | 30 | 580 |
| 2 | 2 | 12 | 43 | 3 | 287 |
| 2 | 3 | 70 | 50 | 77 | 452 |
| 3 | 0 | 37 | 4 | 39 | 443 |
| 3 | 1 | 51 | 14 | 197 | 318 |
| 3 | 2 | 197 | 33 | 350 | 461 |
| 3 | 3 | 97 | 40 | 298 | 4227 |

Do not search seeds during tests; `0..4095` covers only 63 cases.
Call `buildClusterDistrict(seed,1,1,legacy.Y)` for all 64 cases.
Verify variants and selected links with independent 7710 and 8810 oracles.
Find actual links using canonical source endpoint IDs.
Assert exact Section 4.5 rectangle, 3 m width, Q2 edges, and 0.5 m endpoint overlap.
Assert `1.5 m²` intersection with each endpoint's full rectangle union.
Assert no non-endpoint overlap or forbidden link contact.

### 6.4 Geometry and protection

For `all selected link geometry`, inspect every actual source link.
Assert T2 clipping/seams, immutable ownership, and all Section 4.6 preflight conditions.
Assert `sharedOpeningLinkCount===D`, `totalSourceLinkCount===E`, and `directShare===D/E` separately.
Assert `directOrShortCount===E` and `directOrShortShare===1`.

For `protection and error boundaries`, derive H/V rectangles independently from public opening metadata.
Apply Section 4.7 snapping, anchor/cell clipping, source-face checks, and final link/aperture order.
For every expected strip, assert these feature exclusions in public cell plans:

| Feature | Rectangle / condition | Assertion |
|---|---|---|
| Pool | `p.lv===0`; `cx±hw,cz±hd` raw shape bounds | No overlap |
| Column | `c.lv===0`; `c.x±c.r,c.z±c.r` | No overlap |
| Flight | `f` rectangle and `f.hallEntry` | No overlap |
| Void | `v.lv===-1||v.lv===0`; `v` rectangle | No overlap |
| Showcase | `wn.lv===0`; `wn.front` | No overlap |
| Split | `v.kind==='split'` | Count zero |
| Split shaft | `room.kind==='shaft'` generated by split | None |

Use raw pool bounds, not expanded `poolBox()` bounds.
Require Q2-aligned positive-area strips and unobstructed aperture-to-centre access.
Verify dry, level-zero real-Player travel along each strip centreline in 0.25 m steps.
Preserve T2/T4 structural TypeErrors and geometry RangeErrors through public `validateDistrictPlan` fixtures.
Keep original T4 pier and header tests.

### 6.5 Planning order, FIFO, and body

For `planning order and eviction`, use seed 42 and source district `(1,1)`.
Build cells `[(2,2),(3,2),(2,3),(3,3)]`, then reverse order in an independent forced world.
Compare complete plan JSON in canonical NW,NE,SW,SE order.
Require unchanged source JSON and deep-frozen source/nested records without mutable caller references.
Create FIFO worlds through `World2(seed,{clusterShare:0,cluster:factory})`.
Return valid built sources for all requested nonstart districts; return `null` at `(0,0)`.
Clear constructor-created entries using `world.districts.clear()`.
Cache target `(1,1)`; insert `(a,1)` for `a=2..101`.
Assert size 100, target absent, oldest `'2,1'`.
Reaccess target; assert identical JSON, size 100, oldest `'3,1'`, newest `'1,1'`.
Repeat with target `(-1,-1)` and filler `(a,-1)` for `a=0..99`.
Assert size 100, target absent, oldest `'0,-1'`.
Reaccess target; assert identical JSON, oldest `'1,-1'`, newest `'-1,-1'`.
Inspect `world.districts` Map, not private helper call counts.
Preserve T2's cache-hit-does-not-reorder test.

For `real body reaches every source`, use six forced source worlds:

| Seed | District | Group |
|---:|---|---|
| 2 | `(1,1)` | `tight-cluster` |
| 0 | `(1,1)` | `main-and-side` |
| 5 | `(1,1)` | `ring` |
| 1 | `(1,1)` | `nested` |
| 4 | `(1,1)` | `gallery-grid` |
| 42 | `(-1,-1)` | Use independent 8810 oracle |

Get `Y` from `new World2(seed,{clusterShare:0})`.
Force built source only at the selected district; return `null` elsewhere.
Try starts `[OX+47.5,OZ+32,0]`, `[OX+47,OZ+32,0]`, `[OX+46.5,OZ+32,0]`, `[OX+46,OZ+32,0]` in order.
Choose the first standable, level-zero, dry start; fail after four failures.
Set previous Player coordinates before `canStand`; copy shared `surfaceAt` fields.
Call `reachSet(world,OX+12,OZ+12,OX+116,OZ+116,start)` exactly once per world.
Require every physical source `spaceId` to have a reached `[x,z,h]` with `h===0`.
Require strict containment in one rectangle: `x-0.4>q.x0`, `x+0.4<q.x1`, `z-0.4>q.z0`, `z+0.4<q.z1`.
Require standable, dry, height-zero reached states; exclude only auxiliary sealed showcase rooms.
For each shared aperture, sweep its midpoint from normal coordinate `c0-1` through `c1+1`.
Sample every 0.25 m, forward and reverse; transpose for z-normal apertures.
Require standable, dry, level-zero states at every sample; test each aperture individually.

### 6.6 Outer edges and regression

For `eight outer edges and mixed component`, use seed 42 and district window `a,b=-1..0`.
Force production sources in all three nonstart districts; force legacy at `(0,0)`.
Make vertices for cluster physical `spaceId` and distinct legacy hall `spaceId`.
Add realized cluster source links and nonclosed cell links inside the window.
Deduplicate undirected cell links; merge legacy same-space seams into one vertex.
Do not add cluster `mode:'district'` records as duplicate physical links.
Assert one component, eight canonical outer records per cluster district, and no closed outer links.
Count exterior records even when they leave the finite window.

In `tests/unit/gen2-cluster-rooms.test.mjs`, retain `cluster rooms: exact 46 draw stream`.
Replace only its reference-link ID, endpoint, and order oracle with the independent T5 topology oracle.
Rename `cluster rooms: reference passage tree` to `cluster rooms: selected topology graph`.
Replace `links.length===R-1`, AB/AC/BD-only, no-CD, and every-link-passage expectations.
Require selected sorted links and all Section 4.3 graph gates.
Use isolated legacy reports; never gate production on old `measureWorld` cluster metrics.

## 7 Out of scope

Do not implement T6 final link classes, cluster diagonals, pruning, connector rooms, or corridor-stretch enforcement.
Do not add gallery corridors, slopes, level transitions, animated doors, or new room shapes.
Do not change T3 rooms, RNG, T2 caches, IDs, clipping, rasters, or save fallback.
Do not add topology metadata to district records or saves.
Do not change v1, default generator, `?gen=v2`, save schema v1, or dependencies.
Do not modify existing measurement helpers, other tests, or immutable baselines.
Do not add test-only exports, npm scripts, walk mean/p90 gates, or new direct-share quotas.

## 8 Open conflicts with user decisions

None.
