# Handoff T4 — Shared-Wall Openings

## 1. Goal

Add deterministic shared-wall openings between flat v2 cluster rooms.
Support open boundaries, doorways, and pierced rows.
Keep distinct physical source IDs and implicit walls.
Keep floor geometry on Q2.
Support passage, cross-cell headers, and unequal ceilings.
Provide pure geometry to T5/T6.
Never select production topology.

## 2. Scope

### 2.1 Files to change

| File | Change |
|---|---|
| `js/gen2-district.js` | Add builder, validator extension, cut metadata, and two fixtures. |
| `js/gen2.js` | Convert fragments; protect mouths; constrain lamps. |
| `js/mesh2.js` | Add cross-cell ceiling steps. |
| `tests/unit/gen2-openings.test.mjs` | Add nine named core tests. |
| `tests/unit/gen2-openings-mesh.test.mjs` | Add four named mesh tests. |

### 2.2 Protected files

Never change:

- `js/world.js`, `js/regions.js`, `js/cells2.js`, `js/main.js`, `js/save.js`
- `js/player.js`, `js/gen2-measure.js`, `js/rng.js`
- `tests/unit/reach.mjs`, `tests/unit/mesh-helper.mjs`, `tests/e2e/gen2.spec.js`
- T2 tests, baseline fixtures, prefabs, or dependency manifests

Keep unrelated user edits.
Add no dependencies or other feature files.
T2 prohibited `js/mesh2.js` changes during T2.
T4 authorizes only Section 4.8 changes there.
Write red tests before each new behavior.
Make three commits.

## 3. Fixed premises

Treat `docs/handoff/T2-district-plan.md` as fixed.
Keep these T2 signatures:

    buildClusterDistrict(seed,a,b,Y)
    fixtureCluster(a,b)
    fixtureSeamCluster(a,b)
    validateDistrictPlan(raw,a,b)
    clipDistrictRect(rect,i,j)
    cutDistrictCell(district,i,j)

Keep `World2.districtPlan`, `legacySharedInDistrict`, and `makeClusterPlan` interfaces.
Keep other T2 validation, source IDs, sorting, fragments, and seams.
Keep T2 selection, `(0,0)` exclusion, FIFO cache limit 100, and null builder.
Keep `CLUSTER_SHARE=0`, default v1, `?gen=v2`, and saves v1.
Never save opening geometry.
Keep save fallback, legacy plans, and spawn.

| Constant | Value |
|---|---|
| `CELL2`, `Q2`, district | 64 m; 0.5 m; 128×128 m |
| `BODY_R2`, `STEP2`, eye | 0.4 m; 0.8 m; 1.6 m |
| Gap | doorway/row 0.5 m; open 0 m |
| Bridge overlap | 0.5 m each endpoint |
| Minimum height | 2 m |
| Minimum span | open 1.5 m; doorway 3 m; row 8 m |
| End jamb | At least 0.5 m each |
| Row aperture/pier/count | 2.5 m; 1 m; 2–5 |
| Protected mouth | 3 m inward per endpoint/aperture |
| Lamp square/wall clearance | 1.2×1.2 m; 0.6 m |
| Opening grid/link lamps | `step:6`; zero lamps |
| Salts | 8800, 8801 |

Keep decisions D1–D8:

| ID | Fixed requirement |
|---|---|
| D1 | Prune at most one legacy inner link per 2×2 district. |
| D2 | Cap continuous corridor stretch at 36 m on shortest paths between neighbouring halls. |
| D3 | Ordinary/stub/dogleg/winding widths `[1.5,2,2,2.5,3,3.5]` m. Shift centres 0.25 m for widths 1.5/2.5/3.5 m. |
| D4 | Diagonal widths `[1.5,2,2,2.5]` m. |
| D5 | Corridor ceilings 2/2.5/3 m, one third each. |
| D6 | Connector-room body width 12–16 m. |
| D7 | Give diagonals longer than 36 m a middle room. |
| D8 | Never cap turning-route length. Keep the Stage 02B wall-to-wall cap. |

A shared doorway is not an ordinary corridor.
Permit its width of 4 m.
Keep implicit floor unions and maximum ceilings.
Never wall touching physical rectangles.
Never carve rooms or merge IDs.
`Player.canStand` checks floor occupancy, not ceiling height.
Keep aperture height at least 2 m and global collision unchanged.

## 4. Data and functions

### 4.1 Builder and input precedence

Export from `js/gen2-district.js`:

    buildSharedOpening(seed,a,b,k,fromRoom,toRoom,style='auto')
    fixtureOpeningCluster(a,b)
    fixtureOpenBoundaryCluster(a,b)

Return a new mutable link or `null`.
Never mutate inputs.
Validate structure before checking feasibility.
Throw `TypeError('Invalid shared opening')` for malformed inputs, even on unsupported levels.
Return `null` for structurally valid but unsupported level, slope, gap, contact, span, overlap, or explicit style.

| Field | Structural requirement |
|---|---|
| `seed,a,b,k` | Safe integers; `k>=0`; normalize valid `seed>>>0` |
| Source IDs | Distinct `v2:space:${a},${b}:r${index}`; nonnegative safe integer indices |
| `rects` | Nonempty; finite positive Q2 rectangles inside `[128a,128a+128]×[128b,128b+128]` |
| `ceil` | Finite Q2 value at least 2 m |
| `grid` | Finite Q2 `ox,oz,step`; `step>=0.5` |
| `role` | `anchor`/`room`; use T3 extensions only after validator support |
| `lv` | Required numeric integer in `[-1,0,1]` |
| `style` | `auto`, `open`, `doorway`, or `row` |

Treat missing/undefined/null/string/NaN/out-of-domain `lv` as malformed.
Return `null` for valid `lv:-1` or `lv:1`.
Treat absent/undefined/null `slope` as flat.
Accept non-null slope only as a plain object with exactly `{axis,a0,a1,b0,b1,d}`.
Check axis `x` or `z`.
Check finite Q2 numeric `a0,a1,b0,b1` with `a0<a1<=b0<b1`.
Check finite numeric `d`, including positive, zero, or negative.
Return `null` for every valid non-null slope, including `d:0`.
Reject slope primitives, arrays, extra/missing keys, wrong axis, invalid breakpoints, and nonfinite fields.
Check slope structure before unsupported-level checks.
Never add sloped openings.
Reject equal endpoints with `TypeError('Invalid shared opening')`.
Canonicalize endpoints by ascending numeric source index.
Determine facing direction from geometry, not call order.

### 4.2 Source schema and coordinates

Return:

    {id:`v2:dlink:${a},${b}:${k}`,
     from:canonicalLowerIndexSpaceId,to:canonicalHigherIndexSpaceId,
     kind:'shared-opening',rects:[{x0,x1,z0,z1}],
     grid:{ox:rects[0].x0,oz:rects[0].z0,step:6},
     opening:{style,lv:0,axis,c0,c1,s0,s1,height,
              apertures:[{lo,hi}]}}

Store only resolved styles `open`, `doorway`, or `row`.
Use axis `x` for x-normal and `z` for z-normal.
Check `c0<=c1` on the normal axis.
Use `[s0,s1]` for transverse contact.
Check `s0<=lo<hi<=s1` for each aperture.
Create one bridge rectangle per aperture:

| Axis | Rectangle |
|---|---|
| `x` | `{x0:c0-0.5,x1:c1+0.5,z0:lo,z1:hi}` |
| `z` | `{x0:lo,x1:hi,z0:c0-0.5,z1:c1+0.5}` |

Sort by `(x0,z0,x1,z1)` ascending.
Set grid origin from the first sorted rectangle.

### 4.3 Contact search

Enumerate opposite `nx,px,nz,pz` faces of endpoint rectangles.
Subtract intervals backed by positive-area same-source geometry beyond each face.
Intersect exposed transverse face intervals.
Accept only normal gaps 0/0.5 m.
Reject negative gaps and corner contact.
Merge touching/overlapping collinear intervals only with matching `axis,c0,c1`.
Use candidates `{axis,c0,c1,s0,s1}`.
Sort by descending `span=s1-s0`.
Break ties by axis x before z, then ascending `c0,c1,s0,s1`.
Select the first feasible candidate.
Check 0.5 m area overlap with both endpoints across each aperture.

| Style | Gap | Minimum span |
|---|---:|---:|
| `open` | 0 | 1.5 m |
| `doorway` | 0.5 m | 3 m |
| `row` | 0.5 m | 8 m |

For `auto`, use `open` at gap zero.
For gap 0.5 m, select `row` when `drawStyle<0.35 && span>=8`.
Otherwise select `doorway`.
Reuse all five draws for every candidate.
Return `null` if none passes.

### 4.4 RNG, dimensions, and placement

Reserve salts `8800,8801`; preserve all existing salts, including pruning `7900`.
Use:

    const districtHash=hash2(seed>>>0,a,b,8800);
    const linkHash=hash2(districtHash,k,Math.floor(k/0x100000000),8801);
    const r=mulberry32(linkHash);
    const drawStyle=r(), drawWidth=r(), drawHeight=r();
    const drawOffset=r(), drawReserved=r();

Consume exactly five draws for every structurally valid call, including explicit or infeasible cases.
Reuse these draws for all contact candidates.
Ignore `drawReserved`.
Never consume T2 or legacy cell streams.
Use high `k` word for indices above `2**32`.

Select doorway width:

    W=[1.5,2,2.5,3,4];
    w0=W[Math.floor(drawWidth*5)];
    allowed=W.filter(v=>v<=span-1);
    w=Math.min(w0,Math.max(...allowed));

Return `null` if `allowed` is empty.
Check 0.5 m minimum end jambs.
Select doorway/row height:

    H=[2,2.5,3];
    h0=H[Math.floor(drawHeight*3)];
    height=Math.min(h0,fromRoom.ceil,toRoom.ceil);

Check Q2 height at least 2 m.
For `open`, use:

    height=Math.min(fromRoom.ceil,toRoom.ceil);
    apertures=[{lo:s0,hi:s1}];

Keep the full zero-gap contact without a low header.
For doorway and row, calculate Q2 placement:

    minStart=s0+0.5;
    maxStart=s1-0.5-occupied;
    N=Math.floor((maxStart-minStart)/0.5)+1;
    start=minStart+0.5*Math.floor(drawOffset*N);

Check `N>=1`.
For doorway, calculate `occupied=w` first.
Use `apertures=[{lo:start,hi:start+w}]`.
For row, calculate `n,occupied` before placement:

    n=Math.min(5,Math.floor(span/3.5));
    occupied=n*2.5+(n-1)*1;
    apertures=Array.from({length:n},(_,q)=>({
      lo:start+3.5*q,hi:start+3.5*q+2.5
    }));

Check `n>=2`.
Check 2.5 m apertures and 1 m solid piers.
Consume `drawWidth` without applying it to rows.

### 4.5 Cross-source contacts

Reject bridge area overlap or positive-length edge contact with non-endpoint rooms.
Reject area overlap between different link IDs under T2.
Reject positive-length edge contact between different links when either is shared-opening.
Permit corner contact, endpoint overlap, and same-link rectangle contact.
Keep physical-room-to-room contact rules unchanged.

### 4.6 Validator, ownership, and cutting

Extend `validateDistrictPlan(raw,a,b)` to accept `shared-opening` beside `passage`.
Keep all T2 `passage` rules, including connected union.
Validate each shared aperture against both endpoint sources separately.
Never require connected row apertures.

| Rule | Required value |
|---|---|
| Style | `open`, `doorway`, or `row`; not `auto` |
| Floor | `opening.lv===0`; flat endpoint rooms at `lv:0` |
| Axis/metadata | Axis `x` or `z`; finite Q2-aligned values |
| Contact | Section 4.3 gaps/spans; positive-area endpoint contact |
| Apertures | One for open/doorway; 2–5 for row; sorted and disjoint |
| Shape | Section 4.4 width/pier/count; full span for open |
| Bridge | Exact metadata rectangles and 0.5 m endpoint overlap |
| Height | `2<=height<=Math.min(fromRoom.ceil,toRoom.ceil)` |
| Grid | Canonical first-rectangle origin; `step:6` |

Use these exact errors:

    B = TypeError('Invalid shared opening')
    T = TypeError('Invalid district plan')
    R = RangeError('Invalid district geometry')

| Failure | Error |
|---|---|
| Builder: style, equal IDs, seed/a/b/k, source prefix invalid | B |
| Builder: missing/empty/malformed room, rect, ceiling, grid, role | B |
| Builder: NaN/off-grid input, invalid `lv`, malformed slope | B |
| Authored: missing/empty apertures, style/ID/type malformed | T |
| Authored: malformed slope object, equal/dangling link endpoints | T |
| Authored: NaN/Infinity, off-grid 0.25 m, rectangle mismatch | R |
| Authored: height 1.5 m/excessive, wrong gap/width/pier/count | R |
| Authored: insufficient overlap, third-room area/edge contact | R |
| Authored: different-link area/edge contact | R |
| Authored: valid slope or nonzero endpoint level | R |

Reject invalid districts before cache insertion.
Deep-copy room/link rectangles, grids, opening metadata, and apertures.
Sort rectangle arrays by `(x0,z0,x1,z1)`.
Use post-sort `rectIndex`.
Return a new deeply frozen validated copy without mutable input references.

Extend `cutDistrictCell(district,i,j)` without changing its signature.
Clip source bridges with `clipDistrictRect`; discard zero-area pieces.
Keep T2 half-open cells, anchor-first order, room-before-link order, IDs, and seams.
Include deep-copied full source `opening` metadata on each link fragment.
Freeze cut metadata.
Use clipped fragments alone for floor occupancy.
Keep row aperture rectangles distinct.
Keep T2 one-continuation-interval-per-fragment-face rule.
Convert shared fragments in `makeClusterPlan` to independent mutable rooms:

    {id,lv:0,x0,x1,z0,z1,kind:'corridor',
     ceil:opening.height,lamps:[],spaceId:sourceId,
     seams,grid,opening:deepCopiedOpening}

Omit physical `span` and `role` on link fragments.
Assign numeric IDs in T2 fragment order.
Use `primaryHallId:0` for normal cluster plans.

### 4.7 Protected mouths and lamps

Create one 3 m deep mouth per endpoint per aperture.
Determine endpoint sides from geometry, not `from/to` order.
Use these rectangles:

| Axis | Lower mouth | Upper mouth |
|---|---|---|
| `x` | `{x0:c0-3,x1:c0,z0:lo,z1:hi}` | `{x0:c1,x1:c1+3,z0:lo,z1:hi}` |
| `z` | `{x0:lo,x1:hi,z0:c0-3,z1:c0}` | `{x0:lo,x1:hi,z0:c1,z1:c1+3}` |

Clip each mouth to its owning physical source union.
Then clip to the cell.
Protect the full interval for `open`.
Register mouths before features.
Block straight/switchback flights, voids, splits, showcases, columns, and pools.
Keep T2's 3 m passage mouths and 6 m continuation mouths.
Keep its 2 m pool margin and legacy blockers.
Apply existing hall features only to the primary anchor fragment.

Generate no shared-opening lamps.
Keep T2 physical grids and same-source seams.
Keep 0.6 m clearance from solid walls.
Check the full 1.2×1.2 m lamp square inside its own physical source union.
Never use a different source or bridge for containment.
Partition lamp squares at their edges, source rectangle edges, and Q2 lines.
Check each partition midpoint in that source union.
Keep unique lamp centres and cell ownership.

### 4.8 Ceiling and cross-cell mesh

Keep `cellRaster` maximum-overlap ceiling selection and existing interior steps.
Set bridge ceilings to `opening.height`.
Use higher physical ceilings in endpoint overlaps.
Use bridge height for the exposed 0.5 m doorway strip.
Generate its underside through raster ceilings.
Generate rectangular headers through ceiling steps, not separate objects.
For `open`, keep endpoint ceilings without a low strip.

Add a cross-cell step pass in `buildCell2(world,i,j)` at `lv=0` only.
Inspect four cell boundaries in Q2-wide segments.
Read opening metadata from both adjacent plans.
Deduplicate source link IDs.
Cache neighbour rasters only within one `buildCell2` call.
Use no global cache or recursion.
Let `B` be fixed cell-boundary coordinate and `m` the Q2 segment midpoint.
For each aperture, set `N=[c0-0.5,c1+0.5]`, `S=[lo,hi]`.

| Axis | Boundary | Fixed predicate | Midpoint predicate |
|---|---|---|---|
| `x` | `x=B` | `N.lo<B<N.hi` | `S.lo<=m<S.hi`, `m=z` |
| `x` | `z=B` | `S.lo<B<S.hi` | `N.lo<=m<N.hi`, `m=x` |
| `z` | `x=B` | `S.lo<B<S.hi` | `N.lo<=m<N.hi`, `m=z` |
| `z` | `z=B` | `N.lo<B<N.hi` | `S.lo<=m<S.hi`, `m=x` |

Check the source aperture to cross each qualified transverse seam.
Check bridge floor on both sides of transverse seams.
Check both raster `inside` flags `1`.
Check both `flight`, `open`, and `hole` flags `0`.
Check samples in opening or endpoint/bridge union.
For unequal ceilings, calculate:

    lo=Math.min(ceilA,ceilB);
    hi=Math.max(ceilA,ceilB);

Emit one unmerged Q2-wide quad per qualifying unequal-height segment.
Use y extent `[Y[0]+lo,Y[0]+hi]`.
Emit from the lower-ceiling cell, normal toward its lower sample.
Use two triangles, `shade(C2.wall,0.7,tint)`, and world UV.
Emit zero steps at equal heights.
Never duplicate faces or block apertures.
Keep mesh outside qualified regions.

### 4.9 Four-room fixtures

Build fresh deep clones of `fixtureCluster(a,b)`.
Keep its four rooms, anchors, source IDs, grids, and ceilings.
Replace links `k=0..3`; do not append links.
Use seed `42` with Section 4.4.

| k | Pair | `fixtureOpeningCluster` | `fixtureOpenBoundaryCluster` |
|---:|---|---|---|
| 0 | AB | `doorway` | `open` |
| 1 | CD | `row` | `open` |
| 2 | AC | `doorway` | `doorway` |
| 3 | BD | `row` | `doorway` |

For `fixtureOpenBoundaryCluster`, set local `A.x1=64`, `C.x1=64`.
Keep all other physical rectangles unchanged.
Keep ceilings 4 m and original anchors.
Rebuild links with sequential T2 IDs and specified styles.
Check every builder result non-null.
Validate both completed fixtures.
Calculate:

    sharedOpeningLinkCount=links.filter(l=>l.kind==='shared-opening').length;
    totalSourceLinkCount=links.length;
    directShare=sharedOpeningLinkCount/totalSourceLinkCount;

Check `sharedOpeningLinkCount===4`.
Check `totalSourceLinkCount===4`.
Check `directShare===1`.
Keep T2 fixtures unchanged.

### 4.10 Isolated mesh adapter

Define these test-only helpers in `tests/unit/gen2-openings-mesh.test.mjs`:

    makeOpeningMeshWorld({axis='x',style='doorway',equalHeights=false}={})
    makeMeshPlans(A,B,opening)

Call the second from the first.
Use `makeMeshPlans` for disjoint-coordinate subcases.
Do not submit this adapter to four-anchor validation.
Use x-normal fixture:

    A={x0:20,x1:63.5,z0:50,z1:78,ceil:4};
    B={x0:64,x1:108,z0:50,z1:78,ceil:5};
    opening={style:'doorway',lv:0,axis:'x',
      c0:63.5,c1:64,s0:50,s1:78,height:2.5,
      apertures:[{lo:62.5,hi:65.5}]};
    bridge={x0:63,x1:64.5,z0:62.5,z1:65.5};
    grid={ox:63,oz:62.5,step:6};

Use IDs `v2:space:0,0:r0`, `v2:space:0,0:r1`, `v2:dlink:0,0:0`.
For `open`, set:

    A.x1=64; B.x0=64; c0=c1=64;
    height=4; apertures=[{lo:50,hi:78}];
    bridge={x0:63.5,x1:64.5,z0:50,z1:78};

Set the open grid from its bridge origin.
Check `style:'open'` when `equalHeights=true`.
Use ceilings `4,4` for equal heights; use `4,5` for unequal open.
Transpose x/z and axis for z-normal cases.
Set `world.Y={[-1]:-7,0:0,1:8}`.
Set `world.bodyR=0.4`.

Implement `plan(i,j)` for all cells, including empty cells:

    {i,j,ox:i*64,oz:j*64,rooms:[],pools:[],flights:[],
     voids:[],ladders:[],windows:[],columns:[],primaryHallId:0}

Discover all positive-area occupied cells from A, B, and bridge rectangles.
Use half-open 64 m cells.
Clip source rectangles with `clipDistrictRect`; omit zero-area pieces.
Place physical fragments before links in canonical source/rectangle order.
Assign consecutive numeric plan-room IDs per cell, starting at `0`.
Create independent rooms and `lamps:[]` arrays.
Set `primaryHallId` to the first physical ID; use `0` when absent.
Keep `spaceId`, grid, seams, and independently copied opening metadata.
Set physical `kind:'hall'`.
Set link `kind:'corridor'`, `ceil:opening.height`, and zero lamps.

The original fixture occupies `(0,0),(1,0),(0,1),(1,1)`.
In each original occupied cell, set physical `id:0` and link `id:1`.
Do not apply these counts to disjoint subcases.
Implement `roomAt(lv,x,z)` through half-open source floor union.
Return its room or `null`.
Make `flightAt()` return `null`.
Call `loadMesher()` before importing `buildCell2`.
Exhaust `.next()` until `done===true`; read final `value.static`.
Use `quadsOf`, `coplanarOverlaps`, and coordinate tolerance `1e-6`.

## 5. Procedure

Make three future green commits.
Write red tests first.
Never commit failing tests.
Do not implement during review.

| Slice | Red tests first | Change | Commit message |
|---|---|---|---|
| 1 | Schema, draws, contact, errors, fixtures | Implement Sections 4.1–4.6 and 4.9. | `feat(gen2): add shared-opening core` |
| 2 | Cutting, body passage, mouths, lamps, cache | Implement Section 4.7 and cell conversion. | `feat(gen2): integrate shared-opening cuts and clearance` |
| 3 | Headers, seams, ownership, duplicate faces | Implement Sections 4.8 and 4.10. | `feat(gen2): mesh shared-opening cell seams` |

After each slice, run:

    node --test tests/unit/gen2-openings.test.mjs
    npm run test:unit

After slice 3, also run:

    node --test tests/unit/gen2-openings-mesh.test.mjs

Check exit code zero from every green check.
After all slices, run:

    npm run build
    npm test -- --project=desktop

Check both commands to exit zero.

## 6. Acceptance tests

Use exactly nine named core tests in `tests/unit/gen2-openings.test.mjs`.
Use exactly four named mesh tests in `tests/unit/gen2-openings-mesh.test.mjs`.
Keep all subcases inside these 13 top-level tests.

### 6.1 `opening: dimensions and Q2 grid`

Test all styles, both normal axes, and districts `(1,1)` and `(-1,-1)`.
Check Section 4.3 gaps/spans and Section 4.4 placement.
Check Q2 rectangle edges and 0.5 m endpoint overlap.
Cover door widths `[1.5,2,2.5,3,4]` and heights `[2,2.5,3]` with explicit cases.
Check 0.5 m minimum doorway end jambs.
Check row apertures 2.5 m, piers 1 m, and count 2–5.
Check no open-boundary piers or link lamps.
Check canonical IDs, grid `step:6`, and `height<=Math.min(ceilA,ceilB)`.

### 6.2 `opening: deterministic draws and endpoint reversal`

Use seeds `[1,2,3,7,42,99,1234,20261024]`.
Test districts `(1,1)`, `(-1,-1)` and `k=0..3` for each seed.
Calculate all five Section 4.4 draws independently.
Compare exact style, width, height, offset, and source JSON.
Reverse endpoints; require identical serializations.
Check exactly five draws for explicit styles and `auto`.
Use exact comparisons.
Check distinct derived hashes for `k=0` and `k=2**32`.

### 6.3 `opening: contact choice and infeasibility`

Test axes x/z and gaps 0/0.5/1 m.
Test corner contact, spans below 1.5/3/8 m, equal-length ties, and disjoint exposure.
Test L-shaped same-source faces, endpoint reversal, and thin endpoints.
Check Section 4.3 sort and first feasible contact.
Check `null` for levels `-1`/`1` with valid structure.
Check `null` for valid slope objects, infeasible contact, and incompatible explicit styles.
For `lv:1,slope:false`, require `TypeError('Invalid shared opening')`.
Treat absent, undefined, and null slopes as flat.
Check `null` for structurally valid slopes with `d:-0.5`, `0`, or `0.5`.

### 6.4 `opening: malformed metadata rejected`

Apply exact B/T/R error messages from Section 4.6.
Test B cases:

| Group | Inputs |
|---|---|
| Arguments | Invalid style; equal endpoints; invalid seed/a/b/k; wrong source prefix |
| Room | Empty/malformed rects; NaN/off-grid edges; bad ceiling/grid/role |
| Level | Missing/wrong-type `lv`; NaN; noninteger; out-of-domain |
| Slope primitives | `false`, `true`, `0`, `1`, `''`, `[]`, `{}` |
| Slope objects | Missing/extra keys; wrong axis; inverted breaks; NaN; Infinity |

Include exact bad slopes:

    {axis:'q',a0:0,a1:1,b0:2,b1:3,d:0.5}
    {axis:'x',a0:2,a1:1,b0:3,b1:4,d:0.5}
    {axis:'x',a0:0,a1:1,b0:2,b1:3,d:NaN}
    {axis:'x',a0:0,a1:1,b0:2,b1:3,d:Infinity}

Test authored T for missing/empty apertures, invalid style/IDs, and wrong types.
Test authored R for NaN/Infinity, off-grid 0.25 m, and rectangle mismatch.
Test height 1.5 m/excessive, wrong gap/width/pier/count, and insufficient 0.5 m overlap.
Test third-room and different-link positive-area overlap.
Test their positive-length side contacts.
Check valid endpoint overlap and corner-only third-room contact to pass.
Check no rejected cache entry or input mutation.

### 6.5 `opening: four-link direct share`

Use both Section 4.9 fixtures at `(1,1)`, seed `42`.
Check four physical sources.
Check `sharedOpeningLinkCount===4`.
Check `totalSourceLinkCount===4`.
Check `directShare===1`.
Check unique sequential source IDs.
Check original T2 anchors.
Check successful validation of both fixtures.
Compare complete source serialization from independent calls.
Check original T2 fixtures unchanged.

### 6.6 `opening: body crosses every aperture both ways`

Force each fixture in district `(1,1)` through T2 `cluster` using seed `42`.
For each aperture, set `s=(lo+hi)/2`.
Sample x-normal `(x,s)` from `x=c0-1` to `c1+1`.
Transpose coordinates for z-normal.
Advance in 0.25 m steps in both directions.
Set prior player position before each check.
Require:

    Player.canStand(world,x,z,0)===true
    world.surfaceAt(x,z,0).h===0
    Number.isNaN(world.surfaceAt(x,z,0).wl)===true

Copy shared surface results before another query.
Check 0.4 m body footprint and perimeter.
Check clearance >=2 m, above eye 1.6 m.
At each row pier midpoint, require:

    world.blockedAt(x,z,0)===true
    player.canStand(world,x,z,0)===false

Never use a different aperture to prove passage.
Check no piers for `open`.
For AB, set:

    const {c0,apertures}=district.links[0].opening;
    const start=[c0-1.5,(apertures[0].lo+apertures[0].hi)/2,0];

Check start standable, dry, inside A, and inside the AB mouth.
Call `reachSet(world,128,128,256,256,start)` from unchanged `tests/unit/reach.mjs`.
Find a reached state in each source A/B/C/D with `h===0`.
Check strict footprint containment:

    x-0.4>rect.x0 && x+0.4<rect.x1
    z-0.4>rect.z0 && z+0.4<rect.z1

Check `canStand===true`, height zero, and NaN water.
Never use fixed start `[189,160,0]`.

### 6.7 `opening: mouths stay clear`

Use both fixtures.
Check two 3 m endpoint mouths per aperture before clipping.
Check transverse interval `[lo,hi]` and source-union/cell clipping.
Reject mouth occupation by straight/switchback flights, voids, splits, showcases, columns, or pools.
Keep the T2 2 m pool margin and blocker rules.
Test mouths crossing cell boundaries.
Protect the full shared interval for `open`.

### 6.8 `opening: no link lamps or room lamp leaks`

Check zero shared-fragment lamps.
Check full 1.2×1.2 m physical lamp squares using Section 4.7 subdivision.
Check each positive-area part in its own source union.
Reject leaks to other sources and solid walls.
Check identical grids across source fragments and unique lamp centres.
Keep T2 seams and legacy lamps.

### 6.9 `opening: cut order and eviction`

Use seed `42`, district `(1,1)`, and both fixtures.
Use cells `[[2,2],[3,2],[2,3],[3,3]]`.
Build forward/reverse orders in independent worlds.
Compare complete source/cell `JSON.stringify` values.
Check deeply frozen validated/cut metadata and independently mutable cell metadata.
Force only `(1,1)`.
Capture its source and four cell plans.
Run:

    for(let a=1;a<=451;a++) world.districtPlan(a,0);

Check cache size 100 and FIFO keys `"352,0"` through `"451,0"`.
Check `"1,1"` absent.
Recreate:

    const recreated=world.districtPlan(1,1);

Check original source serialization and cache size 100.
Check final keys `"353,0"` through `"451,0"`, then `"1,1"`.
Delete cached cell plans `(2,2),(3,2),(2,3),(3,3)`.
Regenerate all four; require complete original serialization.
Test district `(-1,-1)` for Q2 clipping, metadata, and seams.

### 6.10 `opening mesh: header underside and faces`

Use the original x-normal doorway in Section 4.10.
Check bridge `[63,64.5]×[62.5,65.5]` and exposed strip `[63.5,64]×[62.5,65.5]`.
Check exactly one underside layer at `y=2.5` with area `1.5 m²`.
Check header at `x=63.5,y=[2.5,4]`.
Check boundary step at `x=64,y=[2.5,5]`.
Check six Q2-wide boundary quads with two triangles each.
Check lower-cell ownership and normal toward its lower sample.
Use tolerance `1e-6`.

### 6.11 `opening mesh: normal and transverse cell seams`

Test original x-normal and transposed z-normal fixtures.
Check normal/transverse boundaries at 64.
Check six unequal-height normal steps across `[62.5,65.5]`.
Check floor/ceiling continuity and zero equal-bridge transverse steps.
Apply all four predicates from Section 4.8.

Disjoint x-normal subcase:

    A=[20,63.5]×[10,40]; B=[64,108]×[10,40];
    A.ceil=4; B.ceil=5; height=2.5;
    aperture.z=[20.5,23.5]; normal.x=[63,64.5]; boundary.x=64;

Check six steps at `x=64`.
For `q=0..5`, require z `[20.5+0.5*q,21+0.5*q]`.
Check y `[2.5,5]`, normal toward lower x, and no step at `(64,64.25)`.
The normal and aperture ranges are disjoint.
Transpose to z-normal with seam `z=64`, aperture `x=[20.5,23.5]`.
Check six quads, y `[2.5,5]`, normal toward lower side.

Disjoint transverse subcase:

    axis='x'; A=[4,20.5]×[50,78]; B=[21,40]×[50,78];
    A.ceil=4; B.ceil=5; height=2.5;
    bridge.x=[20,21.5]; aperture.z=[62.5,65.5]; seam.z=64;

Check predicate true at `(20.75,64)` and false at `(64.25,64)`.
Check floor continuity at accepted segment.
Check zero steps at equal bridge ceilings 2.5 m.
Check identical geometry after reversal.

### 6.12 `opening mesh: equal-height seam has no step`

Use `open`, ceilings `4,4`, boundary `x=64`.
Check floor/ceiling continuity, zero boundary steps, and no low header.
Then use ceilings `4,5`.
Check step `x=64,y=[4,5]`.
Check 56 Q2-wide quads across `[50,78]` with lower-cell ownership.
Check no extra low-bridge underside.

### 6.13 `opening mesh: no duplicate or blocked aperture faces`

Use all Section 4.10 and Section 6.11 variants.
Discover all positive-area occupied cells separately for each variant.
Collect `quadsOf` static geometry from every discovered cell.
Never assume four cells for disjoint fixtures.
Filter to the aperture region.
Check `coplanarOverlaps(openingQuads).length===0`.
Reject aperture-blocking vertical faces below opening height.
Check one owner per unequal-height boundary step and none for equal heights.
Check header bottom at lower sampled ceiling.
Use tolerance `1e-6`.

### 6.14 Final regression gate

Check 13 new tests and all T2/unit tests green.
Check successful build and desktop Playwright tests.
Run:

    node --test tests/unit/gen2-openings.test.mjs
    node --test tests/unit/gen2-openings-mesh.test.mjs
    npm run test:unit
    npm run build
    npm test -- --project=desktop

Check each exit code zero.
Keep 512 T2 default hashes.
Keep deterministic report and hash.
Keep default spawn, legacy plans, v1, generator choice, save schema v1, and dependencies.
Never regenerate baseline fixtures or modify protected files.

## 7. Out of scope

T3 owns room counts, sizes, roles, ceilings, packing, feature allocation, and production `CLUSTER_SHARE`.
T5 owns room graphs, clusters, loops, exits, and production direct-link share.
T6 owns distance-based links, connectors, internal diagonals, pruning, corridor stretch, and fallback after `null`.
Never implement production topology or direct-link quota.
Never add slopes, level transitions, doors, animation, curved arches, or global ceiling collision.
Never modify `js/gen2-measure.js` or its production report with forced-fixture measurements.

## 8. Open conflicts with user decisions

None.
