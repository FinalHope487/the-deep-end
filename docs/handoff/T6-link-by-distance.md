# Handoff T6 — Link by Distance
## 1 Goal
Select links from actual physical room-union gaps. Keep T5 topology and T4 openings. Replace temporary production passages. Preserve exterior geometry. Measure shortest neighboring-hall walks through all rooms/connectors. Gate maximum uninterrupted corridor stretch at 36 m. Report walk means, p90, and detours without numeric gates.

## 2 Scope
| File | Required work |
|---|---|
| `js/gen2-district.js` | Two pure exports, passage generation, metadata, validation, cuts |
| `js/gen2.js` | Independent mutable plan metadata |
| `js/gen2-measure.js` | Full graph, shortest walks, report |
| `tools/gen2-measure.mjs` | Preserve CLI; expose report |
| Add `tests/unit/gen2-link-distance.test.mjs` | Eight source tests |
| Add `tests/unit/gen2-link-distance-measure.test.mjs` | Eight measurement tests |
| `tests/unit/gen2-cluster-topology.test.mjs` | Update superseded passage geometry oracles only |
| `tests/unit/gen2-cluster-rooms.test.mjs` | Only the §6.1 exception |
| `tests/unit/gen2-measure.test.mjs` | Extend graph/report tests |
| `tests/e2e/gen2.spec.js` | Add midpoint smoke |

Do not edit `js/world.js`, `js/regions.js`, `js/save.js`, `js/cells2.js`, `js/main.js`, `js/player.js`, `tests/unit/reach.mjs`, prefabs, dependency handoffs, or npm scripts. Preserve all other `gen2-cluster-rooms` assertions, plus `gen2-district`, `gen2-connections`, `gen2-connection-walk`, `gen2-detour-walk`, `gen2-openings`, and `gen2-openings-mesh` unit tests. Keep v1, saves, generator default, dependencies. Add no public fixture API or game hook.

## 3 Fixed premises
| ID | Requirement |
|---|---|
| D1 | Close at most one legacy inner ordinary edge per district; no detour cap. |
| D2 | Shortest neighboring-hall corridor stretch <=36 m; no mean/p90 gate. |
| D3 | Ordinary, stubs, turns, T6 passage widths `[1.5,2,2,2.5,3,3.5]` m. |
| D4 | Diagonal widths `[1.5,2,2,2.5]` m. |
| D5 | Corridor ceilings `[2,2.5,3]` m equally weighted; keep hall/connector ceilings. |
| D6 | Connector body width 12–16 m. |
| D7 | Diagonals longer than 36 m get middle room. |
| D8 | No turning-route total cap; axial wall-to-wall limit 36 m. |

Use 64 m cells, Q2=0.5 m, 128 m districts, 3–4 source rooms per cell, 12–16 per district. Keep T3 46-draw salt 7710 rooms, T5 salt 8810 five motifs/edges/eight outer exits, and T4 salts 8800/8801 five draws. Keep `buildSharedOpening(seed,a,b,k,fromRoom,toRoom,style='auto')`, its metadata, and protection. Keep one source per selected edge. Do not prune cluster edges or add cluster diagonals. Keep legacy `PRUNE_SHARE` and Stage 02B exterior RNG/geometry.

Keep `CONNECT_GAP=12`, `CONNECT_NARROW=8`, `CONNECT_LONG=30`, `CONNECT_SHARE=0.4` and eligibility:

    gaps.every(g=>g>=12)||
      (gaps.every(g=>g>=8)&&gaps[0]+gaps[1]>30)

Eligible exterior gaps >30 m require connector room. Keep `World2.linkOf`, `connectionOf`, `portalOf`, `routeOf`, `linkRects`, `diagonalOf` unchanged. Use realized form: seam; connector; routed corridor; straight corridor; closed; district source references. Never reroll exterior form or count `district` as a physical link.

## 4 Data and functions
### 4.1 Pure exports
Export only these new functions from `js/gen2-district.js`:

    roomGap2(fromRoom,toRoom)
    classifyRoomLink2({
      physicalGap,sharedOpening,connectorEligible,connectorDraw
    })

`roomGap2`: Require objects with own data `rects`, each a dense nonempty array of plain rectangles. Require own data numeric `x0,x1,z0,z1` on each rectangle. Permit inert extra keys and negative coordinates. Reject accessors without invocation. Require finite Q2 edges and positive area. Compare every rectangle pair:

    dx=Math.max(0,A.x0-B.x1,B.x0-A.x1);
    dz=Math.max(0,A.z0-B.z1,B.z0-A.z1);
    pairGap=Math.hypot(dx,dz);
    result=Math.min(...allPairGaps);

Return zero for area, edge, or corner contact. Never use union bounding boxes; do not mutate inputs.

| `roomGap2` fault | Exact error |
|---|---|
| Wrong/missing structure or coordinate **type**, sparse array, accessor | `TypeError('Invalid room union')` |
| Numeric NaN/Infinity, off-grid, nonpositive area, computed overflow | `RangeError('Invalid room geometry')` |

`classifyRoomLink2`: Require plain object (`Object.prototype` or null) and four own data fields. Permit inert extras. Reject accessors and arrays. Require boolean flags, finite numbers, `physicalGap>=0`, `0<=connectorDraw<1`. Validate all fields before selection. Do not draw RNG or mutate inputs.

| Fault | Exact error |
|---|---|
| Structure/type | `TypeError('Invalid room link classification')` |
| Numeric domain | `RangeError('Invalid room link classification')` |

    if (sharedOpening) return 'shared-opening';
    if (physicalGap<=6) return 'short-passage';
    if (physicalGap>30 && connectorEligible) return 'connector-room';
    if (connectorEligible && connectorDraw<0.4)
      return 'connector-room';
    return 'corridor';

An ineligible gap above 30 m returns `corridor`. Classification does not certify D2 geometry.

### 4.2 Passage metadata and RNG
Keep `kind:'shared-opening'` and T4 `opening` unchanged. Keep `kind:'passage'` for nonshared sources. T6 passages alone receive optional `distance`. Existing authored sources without `distance` stay valid.

    distance={
      form:'short-passage',physicalGap:Number,
      width:Number,ceil:Number,line:[[x0,z0],[x1,z1]],
      measurementGap:Number,routeLength:Number,stretch:Number
    };

Require exactly eight own data fields in a plain object (`Object.prototype` or null). Reject extra string/symbol keys, inherited fields, accessors, and sparse arrays. Require two dense points of two finite coordinates. Require straight axis alignment. Identical points require valid zero-gap face contact. Require width in `[1.5,2,2.5,3,3.5]`, ceil in `[2,2.5,3]`, `ceil<=Math.min(fromRoom.ceil,toRoom.ceil)`, and all distances >=0. Check:

    measurementGap===routeLength
    routeLength===stretch
    stretch===lineGap(line)
    Math.abs(physicalGap-roomGap2(fromRoom,toRoom))<=1e-9

Use exact Q2-derived length comparisons. Physical gap is minimum Euclidean union distance. Measurement gap is selected wall-to-wall centreline length.

Use independent salts 8820/8821 for sorted link index `k`:

    districtHash=hash2(seed>>>0,a,b,8820);
    linkHash=hash2(districtHash,k,Math.floor(k/0x100000000),8821);
    r=mulberry32(linkHash);
    widthDraw=r(); ceilDraw=r();
    width=[1.5,2,2,2.5,3,3.5][Math.floor(widthDraw*6)];
    ceil=[2,2.5,3][Math.floor(ceilDraw*3)];

Draw exactly twice per nonshared selected edge; draw zero times for T4 openings, exterior links, or diagonals. Preserve all other streams.

### 4.3 Production passage geometry
Keep T5 rooms, topology, sorted edges. Build T4 openings for anchor-satellite edges. For other edges, require:

    classifyRoomLink2({
      physicalGap:roomGap2(fromRoom,toRoom),
      sharedOpening:false,connectorEligible:false,connectorDraw:0
    })==='short-passage';

Build one straight rectangle using Section 4.2 width/ceil. Set `OX=128*a`, `OZ=128*b`. Set `phase2(w)=Math.round(-w/(2*Q2))*Q2+w/2`: 0 for 2/3 m widths; +0.25 m for 1.5/2.5/3.5 m.

| Link | Normal axis | Transverse base |
|---|---|---|
| NW.E–NE.E / SW.E–SE.E | x | `OZ+32` / `OZ+96` |
| NW.S–SW.S / NE.S–SE.S | z | `OX+32` / `OX+96` |
| E–T in one cell | z | Canonical `x=52.5` |
| NW.T–NE.T / SW.T–SE.T | x | `OZ+46` / `OZ+82` |

For E–T, add phase in canonical coordinates. Reflect complete rectangle and line once. Use NW identity, NE x, SW z, SE both. Reflect `[lo,hi]` as `[128-hi,128-lo]`, then add OX/OZ. For other links add positive phase globally. Never reflect global geometry twice.

Set transverse full interval `S=[centre-width/2,centre+width/2]`. Identify spatial lower/upper room from normal direction, not source ID. Enumerate normal-facing edges in each complete room union. Require a candidate face to be an actual **union boundary across S**. Check outward Q2 half-square midpoints across S; all must be outside its union. Check inward 0.5 m strip Q2 midpoints across S; all must be inside. Reject partial exposure or support **within S**. Ignore partial face coverage outside S. Choose largest supported outward lower face and smallest supported outward upper face. Require `lowerFace<=upperFace`. Check full-width open between-face strip for endpoint floors; require none. Do not use union bounding-box faces.

Set line endpoints to these faces. Orient from `link.from` to `link.to`; reverse spatial order when required.

    // x normal
    rect={x0:lowerFace-0.5,x1:upperFace+0.5,
          z0:centre-width/2,z1:centre+width/2};
    // z normal
    rect={x0:centre-width/2,x1:centre+width/2,
          z0:lowerFace-0.5,z1:upperFace+0.5};
    grid={ox:rect.x0,oz:rect.z0,step:6};

Require positive Q2 area, complete 0.5 m overlap strips, and actual overlap area `0.5*width` at each end. Keep district exterior bounds. Reject third-room overlap and forbidden link overlap/contact. Set `measurementGap=routeLength=stretch=lineGap(line)`, `physicalGap=roomGap2(fromRoom,toRoom)`. For nonshared zero-gap authored contact, require positive shared face and full-width support; use identical endpoints. Reject corner-only contact. Never retry, move rooms, change edges, or reroll. Throw `RangeError('Invalid cluster topology geometry')` for production preflight failures.

### 4.4 Validation, cuts, plans
Extend `validateDistrictPlan` in this order:

1. Check original IDs, endpoints, kinds, rectangles, grids; inspect own `distance` descriptor without invoking accessors.
2. Reject `distance` on openings; apply unchanged T2 validation to metadata-free passages.
3. Check Section 4.2 schema/types/numeric ranges and Section 4.3 line, faces, strips, rectangle, and grid.
4. Recompute union gap/lengths; check collisions and connectivity.
5. Deep-copy and freeze the validated source and nested metadata.

| Fault | Exact error |
|---|---|
| Source structure/type | `TypeError('Invalid district plan')` |
| Source number/geometry mismatch | `RangeError('Invalid district geometry')` |
| Production preflight | `RangeError('Invalid cluster topology geometry')` |

Preserve T2/T4 errors for metadata-free sources. Accept multi-rectangle authored passages.

Keep T2 half-open clipping:

    x0=Math.max(rect.x0,64*i); x1=Math.min(rect.x1,64*i+64);
    z0=Math.max(rect.z0,64*j); z1=Math.min(rect.z1,64*j+64);

Discard zero-area clips. Copy full `distance` only to metadata-bearing link fragments. Do not clip source line or add metadata to physical room fragments. Deep-copy and freeze each cut's nested metadata independently. Use `distance.ceil` for T6 passage fragments; use unchanged `Math.min(3,endpoint ceilings)` otherwise. In `World2.makeClusterPlan` copy to each mutable link-fragment room:

    if (f.distance) o.distance={
      ...f.distance,line:f.distance.line.map(p=>[...p])
    };

Line endpoints keep source provenance outside the cut cell. Use clipped rectangles for rendering/collision. Share no mutable caller, source, cut, or plan metadata references.

Keep private `topologyAnchorMouths(hall,baseMouths,districtLinks,i,j,cellIds)` and call-site `district.anchors[`${i},${j}`]===hall.spaceId`. Require exactly one face: x lower `hall.x1===c0`, x upper `hall.x0===c1`, z lower `hall.z1===c0`, z upper `hall.z0===c1`. Keep x H→V and z V→H. Never regenerate district inside helper.

### 4.5 Measurement records
Keep `roomGraphFromRecords(records,cells)`, `roomGraph(w,cells)`, `measureWalks(w,cells,{restoreId=null}={})`. Keep kinds `seam,opening,corridor,route,connector,diagonal`.

    records={
      rooms:[{spaceId,kind,lv:0,parts:[{id,i,j,x0,x1,z0,z1}]}],
      links:[{id,a,b,kind,line,bridgeGap?,form?,physicalGap?,stretch?}]
    };
    graph={
      nodes:Map<spaceId,{area,cells,kind,anchor}>,
      edges:[{id,a,b,kind,gap,length,bridgeGap?,form?,physicalGap?,stretch?}]
    };

Extend `readRecords` only for these optional fields. Check own data descriptors; reject accessors and ignore inert extras. Require finite nonnegative `physicalGap,stretch`; require `stretch<=lineGap(line)`. Forms: `short-passage,straight,dogleg,winding,connector-room,diagonal,shared-opening`. Require >=2 finite axis-aligned line points. Verify endpoints on complete union boundaries before sample filtering.
Seams and normal openings require `lineGap===0`. Only openings accept `bridgeGap`, exactly 0.5, with `lineGap===0.5`. Set graph `gap=0` for openings, else `lineGap`. No other nonzero opening exception.
Canonicalize a/b lexicographically; reverse copied line on swap, preserve scalar metadata. Compare all fields including optional values. Merge identical room, fragment, and link declarations; reject conflicts with T1 TypeError. Preserve T1 sampled union area, Q2 anchors, and unique IDs.
Compute `length=man(anchorA,line[0])+lineGap(line)+man(line.at(-1),anchorB)`. Include 0.5 m doorway crossing. T4 open boundary uses identical points. Doorway/row uses first aperture midpoint `(lo+hi)/2` and faces `c0,c1`. Orient via endpoint union boundaries, not source IDs. Keep T1 zero-gap records.

### 4.6 Full graph collector
Add private `collectRoomGraphRecords(w,cells,{restoreId=null}={})` returning `{rooms,links}`. Do not export or mutate world. Dispatch to full graph for **any** non-null sampled district source, including authored fixtures. Otherwise preserve legacy adapter/walker exactly. Worlds without `districtPlan` remain valid.
Collect complete district room unions and links. Clip rectangles into **all** intersected 64 m cells, including outside sample; assign `${spaceId}:rect:${rectIndex}:cell:${i},${j}`. Validate full unions; count sampled parts only for node area. Use one production `kind:'hall'` node per `spaceId`; preserve legacy kinds. Add each declared source link once only when both endpoints have sampled parts. Infer no links from contact.
Read each sampled +x/+z `connectionOf`: substitute source links for `district`, without duplicate edges; omit `closed`. Merge same-space seams, add different-space seams. Keep exterior corridor/trimmed route lines. Add connector node once; split into `${id}:a`, `${id}:b`. Split diagonal at existing middle room. Preserve IDs/geometry. Exclude out-of-sample exterior links and orphan boundary connectors. Merge exact duplicates; reject conflicts.

### 4.7 Authored passage line
Add private `passageLineFromSource(link,fromRoom,toRoom)` for missing `distance`. Sort endpoint IDs. Use full source and passage unions.
First enumerate one-rectangle x/z straight bridges. Require opposing exposed faces, 0.5 m full-width overlap inside both unions, and bridge inside passage but outside endpoint interiors. Use rectangle transverse midpoint. Choose shortest; tie by start `(x,z)`, end `(x,z)`, then x before z. For zero-gap contact, require positive common exposed face; reject corners. Return identical points.
Otherwise build finite Q2 graph of centres `(0.25+0.5*k,0.25+0.5*m)` inside passage union, outside endpoint interiors. Connect cardinal neighbors at 0.5 m, never diagonals. Add endpoint ports at positive-length Q2 cell-edge midpoints on exposed boundaries. Require adjacent passage centres outside endpoints. Connect ports at 0.25 m. Require all segments inside passage-union closure; never cross endpoint interiors. Choose shortest Manhattan port path; tie by start port, end port, complete cell-centre sequence, lexicographically ascending. Remove duplicate/collinear interior points; preserve turns; trim to actual boundaries. Identical endpoints require positive-face contact.
Throw `TypeError(`${link.id}: no passage centreline`)` for unsupported geometry. Omit no declared link. Emit:

    {id:link.id,a:link.from,b:link.to,kind:'corridor',
     form:'straight',line:derivedLine,
     physicalGap:roomGap2(fromRoom,toRoom),
     stretch:lineGap(derivedLine)}

Keep `straight` for turns. Apply no D8 route privilege or production 6 m gate.

### 4.8 Stretch and shortest walks
Every mixed edge requires finite nonnegative stretch:

| Edge | Form | Stretch |
|---|---|---|
| Seam/T4 opening | Omit/`shared-opening` | 0 |
| T6 passage | `short-passage` | `distance.stretch` |
| Authored passage | `straight` | `lineGap(derivedLine)` |
| Exterior straight | `straight` | Wall-to-wall line gap |
| Dogleg/winding | `dogleg`/`winding` | `c.gaps[0]+c.gaps[1]` |
| Connector A/B | `connector-room` | `c.gaps[0]-depthA` / `c.gaps[1]-depthB` |
| Unsplit diagonal | `diagonal` | Declared stretch |
| Split diagonal | `diagonal` | Post-middle-room run |

Calculate `physicalGap` from endpoint unions. True seams use zero; connector stubs use hall-to-connector gap. Keep route length separate. Reject absent/invalid stretch with `TypeError('Invalid room graph stretch')`.
Use undirected room/connector vertices keyed by `spaceId`. Edge cost is graph `length`. Add Manhattan offsets from query hall centres to graph anchors. Rooms break stretches. Use private Dijkstra, minimizing `[walk,maxStretch]` with exact comparisons. Sort nodes by ID and adjacency by edge ID, then destination. Keep first-discovered complete ties. Relax only strictly better tuples; settle each vertex once. Do not optimize path ID sequences.

    candidate.walk=previous.walk+edge.length;
    candidate.stretch=Math.max(previous.stretch,edge.stretch);

Start `stretch=0,stretchKind='seam'`. Keep old kind for equal/smaller new stretch. Replace only for a larger stretch. Labels: opening/seam `seam`; T6 `short passage`; authored/straight `straight`; dogleg `route dogleg`; winding `route winding`; stub `connector stub`; diagonal `diagonal`.
For same-primary-space neighboring cells use `walk=man(cellHallCentreA,cellHallCentreB)`, stretch zero, kind `seam`. Unreachable returns `{walk:Infinity,stretch:Infinity,stretchKind:'unreachable'}`. Keep result fields `i,j,axis,walk,closed,stretch,stretchKind`.
Preserve legacy-only walker, ties, restoreId byte-equivalent. Mixed `restoreId` requires nonempty string or null; replace one sampled closed exterior `connectionOf` with `linkOf`. Keep other closures and diagonals. Reject missing/nonclosed/out-of-sample target with TypeError. Mutate no world. Keep closed-detour functions and reports without gates.

### 4.9 Metrics and text report
Keep `measureWorld({seeds,cells}=CORPUS)` and old fields. Use seeds `[1,2,3,7,42,99,1234,20261024]`, cells `i,j=-4..3`: 64 cells, 112 neighbors per seed, 896 total.
Add `connections.districtInnerEdges` as a nonnegative integer. Add `sourceLinks.selected` and `sourceLinks.forced`, each with eight fields:

    {districts,totalSourceLinks,directCount,directOrShortCount,
     longGapCount,directShare,directOrShortShare,longGapShare}

Append top-level `sourceLinks` after all existing `measureWorld` fields. Preserve adjacent keys `connections,rooms,roomComponents,closedDetour`.
Count complete four-cell districts; deduplicate `(seed,a,b)`. `selected` uses default World2, excluding start and legacy-shared. `forced` builds **every** complete district, including both exclusions. Get `Y` from independent `new World2(seed,{clusterShare:0})`; call `buildClusterDistrict(seed,a,b,Y)` and propagate failures. Respect caller seeds/cells, including empty samples.
Count links once, excluding fragments/stubs. Compute union `physicalGap` on every source link, including openings:

    directCount=count(kind==='shared-opening');
    directOrShortCount=count(kind==='shared-opening'||physicalGap<=6);
    longGapCount=count(physicalGap>30);
    share=count/totalSourceLinks; // zero for no links

Keep T1 graph denominator `rooms.edges`: `rooms.direct=count(gap===0)/rooms.edges`, `rooms.near=count(gap<=6)/rooms.edges`, `rooms.long=count(gap>30)/rooms.edges`. Empty shares are zero. Do not equate source and graph near shares.
Count sampled `district` cell-edge references once in `connections.districtInnerEdges`. Exclude them from mode/unique/eligibility/run/route/closure totals. Never access district `corridor/gaps`. Preserve actual sources, exterior/diagonal reports, walks, stretches, detours. Use full graph for mixed `connections.components`; preserve `roomComponents`.
For zero seeds/cells, both source districts/links/shares, `rooms.edges`, `connections.districtInnerEdges`, `connections.stretch.over36`, `connections.walk.mean/p90` are zero. Empty quantiles are `{n:0}`; never read absent fields. Zero seeds give empty component maps; seeds with zero cells give per-seed zero components. Never substitute CORPUS.
Keep original `formatReport` lines/order. Add `district inner cell edges N` before seven room-graph lines; keep stretch after these lines. Append after cost, before return:

    cluster source links, selected: districts N · links N · direct N (P%) · direct or short N (P%) · gap over 30 m N (P%)
    cluster source links, forced: districts N · links N · direct N (P%) · direct or short N (P%) · gap over 30 m N (P%)

Each summary occupies one line. Use `(share*100).toFixed(1)+'%'`, empty `0.0%`. Preserve CLI default text, `--json`; add no argument or generation change.

## 5 Procedure
Use three slices. Write red tests first; run `npm run test:unit` after each slice. No filtered npm entry exists; add no script. Commit only green slices. Do not push during this document task.

| Slice | Red tests | Change | Green |
|---|---|---|---|
| 1 | Gap/classifier types, thresholds, overflow | §4.1 | `npm run test:unit` |
| 2 | Metadata, 128/64, RNG, FIFO, body, §6.1 exception | §§4.2–4.4 | `npm run test:unit` |
| 3 | Collector, bridge, paths, report, 30 bodies, e2e | §§4.5–4.9 | Final checks |

Run final checks in order:

    npm run test:unit
    npm run build
    node tools/gen2-measure.mjs --json
    npm test -- --project=desktop

Require zero exit codes, no test failures, valid JSON. No implementation checks have run in this interview.

## 6 Acceptance tests
### 6.1 Exact test names
Use `tests/unit/gen2-link-distance.test.mjs` for the first eight tests:

| Test name | Coverage |
|---|---|
| `link distance: strict inputs and union geometry` | §4.1; L unions, contact, negative coords, error split, overflow, immutability |
| `link distance: classification thresholds` | §6.2 |
| `link distance: passage metadata and validation` | §§4.2–4.4; errors, support, copies |
| `link distance: 128 forced districts` | §6.3 |
| `link distance: 64 bridge variants and four reflections` | T5 §6.3 |
| `link distance: widths ceilings and independent RNG` | 8820/8821; two draws, five widths, three ceilings |
| `link distance: planning order FIFO and immutable sources` | T5 §6.5; §4.4 |
| `link distance: six real body worlds` | §6.4 |

Use `tests/unit/gen2-link-distance-measure.test.mjs` for the next eight:

| Test name | Coverage |
|---|---|
| `link distance measure: opening bridge and reversal` | §6.5 |
| `link distance measure: sampled rooms and link deduplication` | §§4.5–4.6; identical merge, partial rooms, boundary connectors |
| `link distance measure: competing full graph paths` | §6.6 |
| `link distance measure: legacy walk compatibility` | Mock/legacy outputs, ties, restoreId, diagonals |
| `link distance measure: default corpus stretch and components` | §6.3 |
| `link distance measure: selected and forced report denominators` | §4.9; JSON/text |
| `link distance measure: empty and malformed samples` | Duplicate cells, bridge/stretch errors, no NaN |
| `link distance measure: thirty body walks` | §6.7 |

In `tests/unit/gen2-cluster-rooms.test.mjs`, update only two passage assertions in `cluster rooms: selected topology graph`. Obtain expected `w` from an independent §4.2 RNG oracle. Require `distance.width===w`, `dx===w||dz===w`, and each endpoint overlap area `===0.5*w`. Preserve every other T3 room, count, source, and topology assertion. Preserve the test count.

Preserve T5 topology, T4 apertures/mesh, T1 zero-gap and existing reachability oracles.

### 6.2 Classifier truth table
| Gap | Shared | Eligible | Draw | Form |
|---:|---|---|---:|---|
| 0 | false | false | 0 | short-passage |
| 0.5 | false | false | 0 | short-passage |
| 6 | false | true | 0 | short-passage |
| 6.5 | false | true | 0.399999 | connector-room |
| 6.5 | false | true | 0.4 | corridor |
| 6.5 | false | false | 0 | corridor |
| 30 | false | true | 0.399999 | connector-room |
| 30 | false | true | 0.4 | corridor |
| 30.5 | false | true | 0.999999 | connector-room |
| 30.5 | false | false | 0 | corridor |
| 36 | false | true | 0.999999 | connector-room |
| 36.5 | false | true | 0.999999 | connector-room |
| 36.5 | false | false | 0 | corridor |
| 0.5 | true | false | 0 | shared-opening |
| 36.5 | true | true | 0.4 | shared-opening |

Test draw 1, invalid flags, missing/accessor fields, negatives, NaN/Infinity, and inert extras. Test long links by classification only.

### 6.3 Corpora
Use seeds `[1,2,3,7,42,99,1234,20261024]` and direct source districts `a,b=-2..1`. Iterate seed, ascending b, ascending a. Get `Y` from independent legacy World2. Require:

    districts===128; totalSourceLinks===1813;
    directCount===1231; passageCount===582;
    directOrShortCount===1813; longGapCount===0;
    directOrShortShare===1; longGapShare===0;
    passageCount===totalSourceLinks-directCount;

Require distinct widths `[1.5,2,2.5,3,3.5]`, ceilings `[2,2.5,3]`. Max nonshared physical gap exactly 5 m. Require each passage `physicalGap<=5`, `measurementGap<=6`, `stretch<=6`. Read-only check: 2910 width/link cases, max supported lane gap 5 m. These are acceptance targets, not passing implementation results.
Keep T5 §6.2 T3 source JSON, exact edges, E/R/N/P/M, cycles, degrees, dead ends, roles, IDs, and ceilings. Require motif counts `[38,28,23,20,19]`, loop-positive 76, `76/128===0.59375`, theoretical `0.584375`.
Use T5 §6.3 exact 64 seeds for district `(1,1)`, variants 0–3, classes EE/SS/ET/TT. Do not search seeds. Assert width, Q2 edges, each overlap `0.5*width`, no collision, four reflections, and E–T phase before reflection.
Default eight-seed CORPUS:

    pairs.length===896
    pairs.every(p=>Number.isFinite(p.walk))
    pairs.every(p=>Number.isFinite(p.stretch))
    pairs.filter(p=>p.stretch>36).length===0
    Math.max(...pairs.map(p=>p.stretch))<=36

Require one full graph component per seed, all sampled sources, connector splits, and zero cluster diagonal attempts. Report mean/p90/detours without gates.

### 6.4 FIFO and six body worlds
Use T5 §6.5 full JSON planning order/FIFO sequences. Use seed 42, target `(1,1)`. Clear constructor cache for FIFO. Keep cache limit 100, negative target `(-1,-1)`, exact evictions, reaccess order, and cache-hit behavior. Require frozen source/cuts and independent mutable plans.
Use T5 §6.5 forced worlds:

| Seed | District | Motif |
|---:|---|---|
| 2 | `(1,1)` | tight-cluster |
| 0 | `(1,1)` | main-and-side |
| 5 | `(1,1)` | ring |
| 1 | `(1,1)` | nested |
| 4 | `(1,1)` | gallery-grid |
| 42 | `(-1,-1)` | independent 8810 oracle |

Force only selected district, null elsewhere. Use T5 four ordered dry starts and strict 0.4 m containment. Call `reachSet` once per world; reach all physical rooms at level zero. Keep all T4 aperture sweeps.
Extend each T6 centreline 0.5 m into both rooms. Sample every 0.25 m in both directions, including ends. Set previous Player x/z to prior sample (first to itself), prior height zero. Require `player.canStand(world,x,z,0)===true`, `surface.h===0`, `Number.isNaN(surface.wl)`. Read surface once per sample; copy h/wl. Preserve `reachSet` and `walkLength` helpers.

### 6.5 Exact doorway bridge: 53 m
Use `fixtureCluster(1,1)`, `A=rooms[0]`, `B=rooms[1]`, and:

    link=buildSharedOpening(42,1,1,0,A,B,'doorway');

Require axis x, `c0===191.5`, `c1===192`, first aperture `[173,175.5]`, height 2. Declare only A/B. Sample cells `[[2,2],[3,2]]`; clip rooms under T1. Emit `kind:'opening'`, `form:'shared-opening'`, `bridgeGap:0.5`, `line=[[191.5,174.25],[192,174.25]]`. Canonical anchors: A `[169.75,169.75]`, B `[213.75,169.75]`. Require `gap===0`, `bridgeGap===0.5`, `length===53`. Reverse both source endpoints and line; require identical canonical output. Keep ordinary T1 zero-gap fixture. Reject missing bridgeGap for the 0.5 m opening and bridgeGap on other kinds.

### 6.6 Exact four-room cycle: 65.5 m
Define private `fixtureFourPathWorld()`. Use one `lv:0`, `role:'anchor'`, `ceil:4` rectangle per source and `grid:{ox:x0,oz:z0,step:6}`.

| Room / `v2:space:0,0:` | Rectangle | Graph anchor | Hall centre |
|---|---|---|---|
| A/r0 | `[28,36]×[28,36]` | `[31.75,31.75]` | `[32,32]` |
| B/r1 | `[92,100]×[28,36]` | `[95.75,31.75]` | `[96,32]` |
| C/r2 | `[28,36]×[92,100]` | `[31.75,95.75]` | `[32,96]` |
| D/r3 | `[92,100]×[92,100]` | `[95.75,95.75]` | `[96,96]` |

Use four metadata-free `kind:'passage'` links:

| `v2:dlink:0,0:` suffix | Pair | Rectangle |
|---|---|---|
| 0 | A–B | `[35.5,92.5]×[30.5,33.5]` |
| 1 | A–C | `[30.5,33.5]×[35.5,92.5]` |
| 2 | B–D | `[94.5,97.5]×[35.5,92.5]` |
| 3 | C–D | `[35.5,92.5]×[94.5,97.5]` |

Each link grid is `{ox:rect.x0,oz:rect.z0,step:6}`. Add no distance/line field. `districtPlan(0,0)` returns these sources; `hallOf` returns these halls. Four inner `connectionOf` calls return `mode:'district'`; `diagonalOf` returns null. Do not call production validator.
Require 4 nodes, 4 edges, one component, each edge `gap===56`, `length===64.5`. Require all four neighbor walks `walk===65.5`, `stretch===56`. Compare with independent exhaustive simple-path oracle. Require finite values and no NaN. Exempt this fixture from production 6/36 m gates.

### 6.7 Thirty physical body walks
Select ten longest closed, ten longest remaining x, ten longest remaining z neighboring pairs. Sort by graph walk descending, seed ascending, full edge ID ascending. Use:

    id=`v2:edge:${axis}:${i},${j}`;
    uniqueKey=`${seed}|${id}`;

Require ten per group and 30 unique keys; fail on shortage. Enumerate candidate endpoints `x=0.25+0.5*k`, `z=0.25+0.5*m` strictly inside `w.hallOf`. Require `Player.canStand`, level zero, dry surface. Select nearest hall centre by squared distance; tie by x then z ascending. Fail when none.
Use:

    done=(x,z,h)=>x===targetX&&z===targetZ&&Math.abs(h)<0.01;
    minDI=Math.min(Math.floor(i0/2),Math.floor(i1/2))-1;
    maxDI=Math.max(Math.floor(i0/2),Math.floor(i1/2))+1;
    minDJ=Math.min(Math.floor(j0/2),Math.floor(j1/2))-1;
    maxDJ=Math.max(Math.floor(j0/2),Math.floor(j1/2))+1;
    x0=Math.max(-255.75,2*minDI*64+0.25);
    x1=Math.min(255.75,2*(maxDI+1)*64-0.25);
    z0=Math.max(-255.75,2*minDJ*64+0.25);
    z1=Math.min(255.75,2*(maxDJ+1)*64-0.25);

Call height-aware `walkLength` with first bounds. Retry once for Infinity or `bodyWalk>graphWalk*1.25`; use `[-255.75,-255.75,255.75,255.75]`. Use retry result. Require finite graph/body walks and `bodyWalk<=graphWalk*1.25`. No lower ratio bound. Keep existing reachability tests.

### 6.8 Desktop smoke
Add `v2 cluster distance passage: midpoint rendered and standable` to `tests/e2e/gen2.spec.js`. Boot `/?test=1&seed=42&gen=v2`; collect page/console errors and start. Import `/js/gen2.js`, `/js/player.js` in browser evaluation. Create two independent `World2(42)`. Search `a,b=-2..1`, ascending b then a, excluding `(0,0)`. Select first production district with `distance.form==='short-passage'`. Require source link/rectangle and identical complete source JSON across worlds.

Use `x=(line[0][0]+line[1][0])/2`, `z=(line[0][1]+line[1][1])/2`. Set Player previous x/z to midpoint, `floorH=0`; require `player.canStand(world,x,z,0)===true`. Read one surface, copy h/wl; require `h===0`, `Number.isNaN(wl)`.

    await api(page,'teleport',x,z,0,true,0);

Find all cells with positive-area passage rectangle intersection, using half-open bounds. Poll `gen2Loaded(i,j)` for all, timeout 60000 ms. Wait exactly two nested `requestAnimationFrame` callbacks. Require:

    s.gen===2; s.mode==='playing'; s.floorH===0;
    s.inWater===false; s.loadedChunks>0;
    Math.abs(s.x-x)<=0.25; Math.abs(s.z-z)<=0.25;
    drawInfo().calls>0; drawInfo().meshes>0;
    errors.length===0;

Add no hook. Use six unit body worlds for full bidirectional passage traversal.

## 7 Out of scope
Do not add generic long-gap geometry; test its classifier only. Preserve T3/T4/T5, exterior links, pruning, diagonals, v1, saves, vertical movement, dependencies. Add no walk/detour gates, public fixture/geometry API, or game hook. Future checks are not claimed complete.

## 8 Open conflicts with user decisions
None.
