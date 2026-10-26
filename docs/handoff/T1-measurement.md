# Handoff T1 — Room Proximity Measurement

## 1 Goal
Measure room proximity in generator v2.
Support the current one-hall-per-cell layout and future room clusters.
Use one room-graph contract for both layouts.
Report passage gaps, proximity shares, room density, room area, graph components, walks, and detours.
Keep user decisions D1 and D2.
Do not change generator behavior.

## 2 Scope

### 2.1 Files to change
- `js/gen2-measure.js`: Add graph adapters, metrics, validation, detours, and reports.
- `tests/unit/gen2-measure.test.mjs`: Add graph and metric tests.
- `tests/unit/gen2-detour-walk.test.mjs`: Replace one walk comparison test.

### 2.2 Files that must not change
- `js/gen2.js`, `js/player.js`, `js/save.js`
- `js/world.js`, `js/regions.js`, `js/cells2.js`
- `tests/unit/reach.mjs`, `tools/gen2-measure.mjs`
- `package.json` and all prefab files

Keep v1, save schema v1, and the default generator unchanged.
Do not add dependencies, npm scripts, or random salts.
T0 owns the height-aware `walkLength()` helper.
Use that helper after T0 integration.

## 3 Fixed premises

### 3.1 World and corpus
Use:

    CELL2 = 64;        // m
    Q2 = 0.5;          // m
    DISTRICT = 2;      // cells per axis
    lv = 0;            // 1F
    bodyHalfSide = 0.4;
    maxStep = 0.8;

Keep the existing corpus:

    seeds = [1,2,3,7,42,99,1234,20261024]
    cells = [[i,j] for j=-4..3, i=-4..3]

The corpus has 64 cells and 16 districts per seed.
It has 896 neighbouring cell pairs across eight seeds.
Use world coordinates in metres.
Keep results independent of cell planning order.

### 3.2 User decisions and gates
D1: Close at most one inner link per 2x2 district.
Do not add a pruning-detour limit.

D2: Limit the longest continuous corridor stretch to 36 m.
Apply D2 to shortest routes between neighbouring halls.
Halls and connector rooms break corridor stretches.

Keep D3 through D8 unchanged.
T0 owns the corridor-stretch implementation and diagonal middle rooms.

Use only these layout gates:

| Gate | Required value |
|---|---|
| Shortest-route maximum corridor stretch | `<= 36 m` |
| Room-graph components per complete-CORPUS seed | `1` |

Do not gate walk mean, walk p90, proximity shares, room density, room area, or pruning detours.
T3 through T6 own future proximity targets.

### 3.3 Existing code
- `js/gen2-measure.js:111-114`: `quant()`.
- `js/gen2-measure.js:124-181`: Legacy `measureWalks()`.
- `js/gen2-measure.js:185-318`: Connection and world reports.
- `js/gen2.js:453-624`: Hall, connection, route, and diagonal geometry.
- `tests/unit/gen2-detour-walk.test.mjs:67-90`: Original ten-pair comparison.

These references describe the pre-T0 code.
Keep `measurePlan(plan,Y)` unchanged.
Keep legacy walk and connection report fields.
Describe legacy walks as `estimated on the graph of links`.

## 4 Data and functions

### 4.1 Public API
Add these exports in `js/gen2-measure.js`:

    export function roomGraph(w,cells)
    export function roomGraphFromRecords(records,cells)
    export function measureRoomGraphs(samples)
    export function measureClosedDetours(w,cells)

Extend:

    export function measureWalks(w,cells,{restoreId=null}={})

Keep:

    measurePlan(plan,Y)
    measureWorld({seeds,cells}=CORPUS)
    formatReport(r)

Do not add a production `World2` API.

### 4.2 Canonical records and graph
Use this input:

    records = {
      rooms: [{
        spaceId:string, kind:string, lv:0,
        parts:[{
          id:string, i:integer, j:integer,
          x0:number, x1:number, z0:number, z1:number
        }]
      }],
      links: [{
        id:string, a:string, b:string,
        kind:string, line:[[number,number],...]
      }]
    }

Use this output:

    {
      nodes:Map<spaceId,{
        area:number,
        cells:[[number,number],...],
        kind:string,
        anchor:[number,number]
      }>,
      edges:[{
        id:string, a:string, b:string,
        kind:string, gap:number, length:number
      }]
    }

`spaceId` identifies one logical room.
Several fragments can share one `spaceId`.
A logical room can cross cells and districts.
Use m² for `area`.
Use metres for `gap` and `length`.

Accept these edge kinds:

    seam | opening | corridor | route | connector | diagonal

Include explicitly declared traversable 1F rooms.
The current adapter includes halls, edge connector rooms, and diagonal middle rooms.
Future adapters use the same contract for other traversable room kinds.

Reject these canonical room kinds:

    corridor | b1corridor | route | diagonal | showcase | shaft

Exclude rooms without `spaceId`, sealed showcases, and all non-1F rooms.
Do not infer edges from geometric contact.

Sort node entries by `spaceId`.
Sort edges by `id`.
Use ascending JavaScript string comparison.
Sort cell coordinates by `i`, then `j`.

Canonicalize edge endpoints to `a < b`.
Reverse the line when canonicalization swaps endpoints.
Keep the original edge ID and its `:a` or `:b` suffix.

Keep distinct parallel edges and isolated nodes.
Retain an edge only when both endpoint nodes intersect the sample.

### 4.3 Self-links and validation
Reject canonical links with `a === b` using `TypeError`.
The current adapter must omit same-space seams before canonical validation.
Do not create other self-link records.
Reject self-edges in `measureRoomGraphs()`.

Validate all declared records before sample filtering.

Require:
- `records.rooms` and `records.links` are arrays.
- Nonempty string room IDs, fragment IDs, link IDs, and kinds.
- `lv === 0` for every room.
- Integer fragment cell coordinates.
- Finite, Q2-aligned rectangle coordinates.
- `x0 < x1` and `z0 < z1`.
- Every fragment inside its declared cell.
- Declared, different room endpoints for every link.
- Accepted room and link kinds.
- At least two line points per link.
- Finite coordinates and axis-aligned line segments.
- Link endpoints on their declared rooms' outer boundaries.

Validate link endpoints against ALL declared fragments.
Do not filter fragments before boundary validation.
Use the outer boundary of each room union.
Do not treat internal fragment seams as outer boundaries.

Allow repeated declarations of one `spaceId`.
Require identical `kind` and `lv`.
Merge their fragments.

Deduplicate fragments globally by `id`.
Accept identical repeated fragments.
Reject conflicting fragments with `TypeError`.

Deduplicate canonical links by `id`.
Accept identical repeated links.
Reject conflicting links with `TypeError`.

Reject duplicate sampled cells with `TypeError`.
Sort valid sampled cells.
Do not mutate inputs.

For empty records or an empty sample, return:

    {nodes:new Map(),edges:[]}

Validate nonempty records before returning an empty sample.

### 4.4 Sampled area and anchor
Use half-open rectangles.
Clip fragments to their declared 64 m cells.
Intersect fragments with sampled cells.
Mark covered Q2 squares in per-cell bitmaps.
Count each covered square once.

Calculate:

    area = coveredSquareCount * 0.25;

Do not double-count overlaps.
Do not include unsampled area.

Calculate the centroid of covered Q2 square centres.
Select the covered square centre with minimum squared Euclidean distance to that centroid.
Break ties by ascending `x`, then `z`.

Store this point as `anchor`.
Store unique sampled intersecting cells in `node.cells`.
Sort those cells by `i`, then `j`.

Count one node per sampled logical room.

### 4.5 Passage geometry
Define `gap` as wall-to-wall passage-polyline length.
Include every route turn.
Do not use nearest-room geometric distance.
T6 uses nearest-room distance to select link forms.

A line starts at room `a`'s boundary.
It ends at room `b`'s boundary.
Every segment is axis-aligned.
Use two identical points for a zero-length opening.

Calculate:

    const man=(a,b)=>
      Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);

    gap=line.slice(1).reduce(
      (s,p,k)=>s+man(line[k],p),0
    );

    length=man(anchorA,line[0])+
      gap+man(line.at(-1),anchorB);

Require finite, nonnegative results.
Require zero gap for seams and openings.
Include transverse turns in route gaps.
Measure connector stubs separately.
Use corridor centrelines for diagonals.

### 4.6 Current `World2` adapter
Implement `roomGraph(w,cells)` with:
- `w.hallOf(i,j)`
- `w.connectionOf(i,j,axis)`
- `w.diagonalOf(a,b)`

Do not use `w.plan()` for hall geometry.
Use `w.linkOf()` only for restored legacy walks.

Normalize cells first.
Visit cells in ascending `i,j` order.
Visit axes in `['x','z']` order.

Register each sampled hall from `hallOf()`.

Use:

    partId=`${spaceId}:part:${i},${j}`;
    kind='hall';
    lv=0;

Group hall fragments by `spaceId`.
Read positive-axis connections only when both cells are sampled.
Do not register boundary connector nodes or edges.

#### 4.6.1 Axis links
Omit closed links and same-space seams.

For different-space seams, intersect hall faces on the common cell edge.
Require positive transverse overlap.
Use the midpoint of that overlap.

Create:

    {id:c.id,a:c.fromSpaceId,b:c.toSpaceId,
     kind:'seam',line:[point,point]}

Throw `TypeError` for an invalid seam intersection.

For straight corridors, use `kind:'corridor'`.
Use source `x1` and target `x0` for x-axis links.
Use source `z1` and target `z0` for z-axis links.

Use T0's corridor-centre rule:

    const corridorPhase2=w=>
      Math.round(-w/(2*Q2))*Q2+w/2;

    centre=cellMiddle+c.corridor.t+
      corridorPhase2(c.corridor.w);

Apply this rule to straight corridors and connector stubs.
Require straight gap `c.gaps[0]+c.gaps[1]`.

For routes, use `kind:'route'`.
Use `c.route.line` and `c.route.across`.
Trim both ends at the hall boundaries.
Keep all intermediate turns.
Require `gap===c.route.length`.

#### 4.6.2 Edge connector rooms
Register both `c.parts` for each sampled connector link.
Use `c.connectorSpaceId` and `kind:'connector-room'`.
Use the standard part-ID formula.

Create:

    {id:`${c.id}:a`,a:c.fromSpaceId,
     b:c.connectorSpaceId,kind:'connector',line:lineA}

    {id:`${c.id}:b`,a:c.connectorSpaceId,
     b:c.toSpaceId,kind:'connector',line:lineB}

`:a` identifies the original source side.
`:b` identifies the original destination side.
Keep these suffixes after endpoint canonicalization.

Measure connector depths along the connection axis.
Use x bounds for x links.
Use z bounds for z links.

Calculate:

    gapA=c.gaps[0]-depthA;
    gapB=c.gaps[1]-depthB;

Stop each stub at the connector room's near wall.
Keep connector body geometry centred at `cellMiddle+c.corridor.t`.
Use Section 4.6.1 for stub centrelines.
Require finite, nonnegative gaps.

#### 4.6.3 Diagonals
Visit unique sampled districts in ascending `(a,b)` order.
Call `w.diagonalOf(a,b)` once per district.
Ignore null results.
Require both diagonal endpoint cells in the sample.

Use `d.line` as the source centreline.
Treat an absent `d.middleRoom` as `null`.

Without a middle room:
- Trim `d.line` to both hall boundaries.
- Create one `diagonal` edge with ID `d.id`.
- Require `gap===d.length`.
- Do not require `d.corridorLengths` or `d.stretch`.

With a middle room:
- Require `kind==='connector-room'` and `lv===0`.
- Require two finite, nonnegative `d.corridorLengths`.
- Do not derive geometry from `d.stretch`.

Intersect `d.middleRoom` with ALL FOUR district cells.
Register every positive-area fragment in canonical records.
Use the standard part-ID formula.
Keep unsampled fragments until canonical validation completes.

Validate centreline entry and exit against the complete middle-room boundary.
Split the centreline at its first entry and last exit.

Create:

    {id:`${d.id}:a`,a:d.fromSpaceId,
     b:d.middleRoom.spaceId,kind:'diagonal',line:lineA}

    {id:`${d.id}:b`,a:d.middleRoom.spaceId,
     b:d.toSpaceId,kind:'diagonal',line:lineB}

Require:

    gapA===d.corridorLengths[0]
    gapB===d.corridorLengths[1]

After validation, filter node area to sampled fragments.
Keep each split edge only when both endpoint nodes remain sampled.

Omit the diagonal and middle-room node when no sampled middle-room fragment exists.
Do not create an edge with a missing endpoint.

For partial districts, keep all four middle-room fragments during validation.
Count only sampled fragments in node area and anchor calculations.

#### 4.6.4 Centreline clipping
Intersect axis-aligned centreline segments with room boundaries.
Remove the source-room interior prefix.
Remove the target-room interior suffix.
Keep intermediate vertices and turns.

Remove consecutive duplicate vertices.
Keep two identical vertices for zero-gap openings.
Reject invalid boundary intersections with `TypeError`.

Pass complete records to `roomGraphFromRecords(records,cells)`.
Do not duplicate its normalization algorithm.

### 4.7 Room metric API
Implement:

    measureRoomGraphs(samples)

Accept:

    samples=[{
      seed:number,
      cells:[[number,number],...],
      graph:{nodes:Map,edges:Array}
    }]

Require integer seeds from `0` through `4294967295`.
Reject duplicate seeds with `TypeError`.
Normalize cells and reject duplicates.

Validate each graph before aggregation.

Require:
- `graph.nodes` is a `Map`.
- `graph.edges` is an array.
- Nonempty string node-map keys and edge IDs.
- Unique edge IDs within each graph.
- Nonempty string node kinds.
- `node.anchor` is an array of exactly two finite numbers.
- `node.cells` is a nonempty array of unique integer coordinate pairs.
- Every `node.cells` pair belongs to the corresponding sample.
- Finite, nonnegative node areas.
- Finite, nonnegative edge gaps and lengths.
- Accepted edge kinds.
- Existing endpoint node IDs and different edge endpoints.

Throw `TypeError` for invalid values.
Do not mutate inputs.

Return:

    {
      rooms:{
        edges:number,
        gap:quant,
        direct:number,
        near:number,
        long:number,
        perDistrict:quant,
        areaMedian:number
      },
      roomComponents:{[seed:string]:number}
    }

Aggregate each edge once per seed.

Use:

    edges=totalEdgeCount;
    direct=edges?count(gap===0)/edges:0;
    near=edges?count(gap<=6)/edges:0;
    long=edges?count(gap>30)/edges:0;

Use `quant()` for gaps.

Calculate districts with:

    districtI=Math.floor(i/2);
    districtJ=Math.floor(j/2);

Count unique node IDs in each `(seed,districtI,districtJ)`.
Count shared rooms once per district.
Include connector rooms and zero-room sampled districts.
Use `quant()` for `perDistrict`.

Collect one area per `(seed,spaceId)`.
Use the existing median rule for `areaMedian`.
Return zero when no area values exist.

Count components on the undirected graph.
Include isolated nodes.
Parallel edges do not increase component counts.

Use these exact component counts:

| Graph | Components |
|---|---:|
| Empty | 0 |
| One isolated node | 1 |
| Two isolated nodes | 2 |
| Two connected nodes | 1 |

For empty samples, return exactly:

    {
      rooms:{
        edges:0,gap:{n:0},
        direct:0,near:0,long:0,
        perDistrict:{n:0},areaMedian:0
      },
      roomComponents:{}
    }

### 4.8 Quantiles
Keep `quant()` unchanged.

Use:

    index=Math.min(n-1,Math.floor(p*n));

Do not interpolate.
Return `{n:0}` for empty samples.

Add `quant90(xs)`.
Return the `quant()` fields plus `p90` for nonempty values.

Use:

    p90=sorted[Math.min(n-1,Math.floor(0.9*n))];

Return `{n:0}` for empty values.

Keep:

    connections.walk.all
    connections.walk.closed

Add:

    connections.walk.mean
    connections.walk.p90

Use finite legacy graph walks.
Calculate the arithmetic mean.
Calculate p90 with the same index rule.
Return zero for both values when no finite walk exists.
Do not change existing walk quantile objects.

### 4.9 Restored legacy walks
Extend:

    measureWalks(w,cells,{restoreId=null}={})

Keep original behavior for `restoreId===null`.

For a non-null ID:
1. Require a nonempty string.
2. Require one matching sampled axis connection.
3. Require that connection to be closed.
4. Read `w.linkOf()` for that connection.
5. Read `w.connectionOf()` for all other connections.

Reject invalid, missing, nonclosed, and out-of-sample IDs with `TypeError`.

Keep original `w.diagonalOf()` results.
Do not rebuild diagonals after restoration.
Do not mutate `World2` or its caches.

Keep legacy Dijkstra over hall centres.
Prefer smaller maximum stretch for equal walk lengths.
Keep full route length in walk costs.
Keep T0 corridor-stretch behavior.

### 4.10 Closed detours
Implement:

    measureClosedDetours(w,cells)

Return:

    [{
      id:string,i:number,j:number,
      axis:'x'|'z',
      before:number,after:number,
      delta:number|null
    }]

Include each sampled closed axis edge once.
Sort records by ascending `id`.

Calculate `after` with the original closed graph.
Calculate `before` with only that link restored.
Preserve other closures and original diagonals.

Use:

    delta=after-before;

Require `delta>=-1e-9`.
Normalize negative deltas within this tolerance to zero.
Set `delta=null` when either walk is infinite.

Aggregate by ascending seed, then ascending edge ID.
Do not add a detour gate.

Return this report field:

    closedDetour:{
      n:number,
      min?:number,p25?:number,
      median?:number,p75?:number,
      p90?:number,max?:number,
      unreachable:number
    }

Use `quant90()` on finite deltas.
Use `n` for finite deltas.
Use `unreachable` for null deltas.

For no finite deltas, return:

    {n:0,unreachable:number}

### 4.11 World report integration
In `measureWorld()`, build one `roomGraph(w,cells)` per seed.
Collect `{seed,cells,graph}` samples.
Call `measureRoomGraphs(samples)` once.

Place these fields immediately after `connections`:

    rooms
    roomComponents
    closedDetour

Keep legacy report fields.
Use the room graph for new proximity metrics.
Use legacy links for walks and corridor stretches.

Keep existing cost fields.
Do not add graph time to generator planning time.

### 4.12 Report text
Keep existing `formatReport(r)` lines.

Insert these seven lines before the legacy stretch line.
Use existing `q()`, `pct()`, and `m2()` helpers.

| Exact label | Value |
|---|---|
| `room graph edges:` | `r.rooms.edges` |
| `room graph gaps (m):` | `q(r.rooms.gap)` |
| `room graph direct (gap = 0):` | `pct(r.rooms.direct)` |
| `room graph near (gap <= 6 m):` | `pct(r.rooms.near)` |
| `room graph long (gap > 30 m):` | `pct(r.rooms.long)` |
| `1F rooms per sampled 2x2 district:` | `q(r.rooms.perDistrict)` |
| `1F logical room area median:` | `m2(r.rooms.areaMedian)` |

Separate each label and value with one space.
Keep the table order.

Append this text to the legacy walk line:

    · mean <mean> m · p90 <p90> m

Format both values with `.toFixed(2)`.

After the closed-edge report, print:

    closed detour added walk (m): <q90(closedDetour)> · unreachable <unreachable>

For finite values, format `q90()` as:

    n N · min V · p25 V · median V · p75 V · p90 V · max V

Use raw numeric values.
For no finite values, print `n 0`.

Require this exact example:

    closed detour added walk (m): n 0 · unreachable 5

After the legacy component line, print:

    room graph components per seed: <seed>: <components> · ...

Sort seeds numerically.
For zero seeds, print:

    room graph components per seed: none

### 4.13 Body cross-check
Use T0's height-aware weighted Dijkstra helper:

    walkLength(w,x0,z0,x1,z1,start,done)

Use the real `Player.canStand()`.
Do not replace the helper in T1.

Select 30 distinct neighbouring-cell pairs:

1. Ten longest closed pairs.
2. Ten longest remaining x-axis pairs.
3. Ten longest remaining z-axis pairs.

Sort each group by:
1. Graph walk descending.
2. Seed ascending.
3. Full edge ID ascending.

Use:

    id=`v2:edge:${axis}:${i},${j}`;
    uniqueKey=`${seed}|${id}`;

Require ten pairs in each selection.
Fail with `fewer than 10 closed corpus pairs` when the closed group is too small.
Fail for a deficient axis group.
Do not silently skip pairs.
Require 30 unique keys.

#### 4.13.1 Endpoints
Use one world-aligned Q2 lattice:

    x=0.25+0.5*k;
    z=0.25+0.5*m;

Here `k,m` are integers.
Enumerate positions strictly inside each hall from `w.hallOf()`.

Require:

    player.canStand(w,x,z,0)===true
    surface=w.surfaceAt(x,z,0)
    surface!==null
    surface.h===0
    Number.isNaN(surface.wl)===true

A dry endpoint has no water level.
Choose the endpoint nearest to the hall's geometric centre.
Use squared Euclidean distance.
Break ties by ascending `x`, then `z`.
Fail when no valid endpoint exists.

Use:

    done=(x,z,h)=>
      x===targetX&&z===targetZ&&Math.abs(h)<0.01;

#### 4.13.2 Bounds and retry
For endpoint cells `(i0,j0)` and `(i1,j1)`, calculate:

    const minDI=Math.min(Math.floor(i0/2),Math.floor(i1/2))-1;
    const maxDI=Math.max(Math.floor(i0/2),Math.floor(i1/2))+1;
    const minDJ=Math.min(Math.floor(j0/2),Math.floor(j1/2))-1;
    const maxDJ=Math.max(Math.floor(j0/2),Math.floor(j1/2))+1;

    const x0=Math.max(-255.75,2*minDI*64+0.25);
    const x1=Math.min(255.75,2*(maxDI+1)*64-0.25);
    const z0=Math.max(-255.75,2*minDJ*64+0.25);
    const z1=Math.min(255.75,2*(maxDJ+1)*64-0.25);

Search these bounds first.
They cover both endpoint districts and one extra district on each side.

Retry when the initial result is infinite.
Retry when it exceeds `graphWalk*1.25`.

Use full-CORPUS retry bounds:

    [-255.75,-255.75,255.75,255.75]

Use the retry result as the final body distance.
Do not retry again.

Require:

    Number.isFinite(graphWalk)
    Number.isFinite(bodyWalk)
    bodyWalk<=graphWalk*1.25

Do not assert a lower ratio bound.
Replace the symmetric ten-pair test.
Keep the two existing reachability tests.

## 5 Procedure

Write each slice's new tests first.
Confirm that the new tests fail for the specified behavior.
Implement the referenced Section 4 contract.
Run the required checks.
Commit only green snapshots.
Combine dependent slices when separate green snapshots are not possible.

| Slice | Red tests | Implementation | Green checks |
|---|---|---|---|
| 1 — Graph adapters | A01–A11, A14 | Sections 4.2–4.6 | Unit suite |
| 2 — Metrics | A12, A13, A15, F1 report assertions | Sections 4.7, 4.8, 4.11, 4.12 | Unit suite, CLI |
| 3 — Detours | A16–A18 | Sections 4.9–4.10 | Unit suite, CLI |
| 4 — Body | B01 | Section 4.13 | Unit suite, desktop e2e |

Start slice 4 after T0 integrates height-aware `walkLength()`.
Keep slice 4 pending when T0 is absent.
Do not commit a failing T0-dependent test.

Run these regression commands:

    node --test tests/unit/gen2-measure.test.mjs
    node --test tests/unit/gen2-detour-walk.test.mjs
    node tools/gen2-measure.mjs --json
    npm run test:unit
    npm test -- --project=desktop

Run the targeted unit test and full unit suite for each slice.
Run the CLI for slices 2 and 3.
Run desktop e2e after slice 4.
Require successful completion before each commit.

## 6 Acceptance tests

### 6.1 Fixture builders
Use `tests/unit/gen2-measure.test.mjs`.
Use `node:test` and `node:assert/strict`.

Define:

    const part=(id,i,j,x0,x1,z0,z1)=>
      ({id,i,j,x0,x1,z0,z1});

    const room=(spaceId,parts,kind='hall')=>
      ({spaceId,kind,lv:0,parts});

    const link=(id,a,b,kind,line)=>
      ({id,a,b,kind,line});

### 6.2 Exact fixtures

#### F1 — Four canonical rooms
Use `seed=1`, `cells=[[0,0]]`, and `roomGraphFromRecords()`.

    rooms=[
      room('A',[part('A:0,0',0,0,0,4,0,4)]),
      room('B',[part('B:0,0',0,0,4,8,0,4)]),
      room('C',[part('C:0,0',0,0,10,16,0,4)]),
      room('D',[part('D:0,0',0,0,50,58,0,4)])
    ];

    links=[
      link('AB','A','B','opening',[[4,1.75],[4,1.75]]),
      link('BC','B','C','corridor',[[8,1.75],[10,1.75]]),
      link('AC','A','C','corridor',[[4,1.75],[10,1.75]]),
      link('CD','C','D','corridor',[[16,1.75],[50,1.75]])
    ];

Require:

| Room | Area m² | Anchor |
|---|---:|---|
| A | 16 | `[1.75,1.75]` |
| B | 16 | `[5.75,1.75]` |
| C | 24 | `[12.75,1.75]` |
| D | 32 | `[53.75,1.75]` |

| Edge | Gap m | Length m |
|---|---:|---:|
| AB | 0 | 4 |
| BC | 2 | 7 |
| AC | 6 | 11 |
| CD | 34 | 41 |

Require:

    nodes.size===4
    edges.length===4
    gap={n:4,min:0,p25:2,median:6,p75:34,max:34}
    direct===0.25
    near===0.75
    long===0.25
    perDistrict={n:1,min:4,p25:4,median:4,p75:4,max:4}
    areaMedian===24
    roomComponents[1]===1

#### F2 — Shared canonical fragments
Use canonical input, not `World2`.

    cells=[[0,0],[1,0]]
    rooms=[room('S',[
      part('S:0,0',0,0,63,64,0,2),
      part('S:1,0',1,0,64,65,0,2)
    ])]
    links=[]

Require one node.
Require area `4 m²`.
Require anchor `[63.75,0.75]`.
Require cells `[[0,0],[1,0]]`.
Require district density `1`.

#### F3 — Synthetic seam
Use `roomGraph()` with `cells=[[0,0],[1,0]]`.

Define:

    hallOf(0,0)=
      {x0:60,x1:64,z0:0,z1:4,spaceId:'A'}

    hallOf(1,0)=
      {x0:64,x1:68,z0:0,z1:4,spaceId:'B'}

    connectionOf(0,0,'x')={
      id:'v2:edge:x:0,0',axis:'x',mode:'seam',
      fromSpaceId:'A',toSpaceId:'B'
    }

Return `null` from `diagonalOf()`.
Throw for unrequested hall and connection coordinates.

Require:
- Node areas `16 m²` and `16 m²`.
- Anchors `[61.75,1.75]` and `[65.75,1.75]`.
- Seam midpoint `[64,2]`.
- One edge with ID `v2:edge:x:0,0`.
- Edge kind `seam`, gap `0`, length `4.5`.
- One connected component.

For the equal-space variant, change both space IDs to `A`.
Change both connection endpoints to `A`.
Require one node with area `32 m²`.
Require anchor `[63.75,1.75]`.
Require zero edges and one component.

#### F4 — Synthetic diagonal middle room
Use `roomGraph()` with:

    cells=[[0,0],[0,1],[1,0],[1,1]]

Define these halls:

| Cell | spaceId | x0 | x1 | z0 | z1 |
|---|---|---:|---:|---:|---:|
| 0,0 | A | 48 | 60 | 48 | 60 |
| 1,0 | X | 92 | 104 | 16 | 28 |
| 0,1 | Y | 16 | 28 | 92 | 104 |
| 1,1 | B | 68 | 80 | 68 | 80 |

Return closed mode for all four internal axis connections.
Use IDs `v2:edge:${axis}:${i},${j}`.
Return `null` for all diagonals except `(0,0)`.

Define:

    d={
      id:'v2:diag:0,0',
      cells:[{i:0,j:0},{i:1,j:1}],
      fromSpaceId:'A',toSpaceId:'B',
      line:[[60,54],[64,54],[64,74],[68,74]],
      length:28,
      middleRoom:{
        spaceId:'M',kind:'connector-room',lv:0,
        x0:62,x1:66,z0:62,z1:66,ceil:4,
        lampGrid:{ox:62,oz:62,step:6}
      },
      corridorLengths:[12,12],
      stretch:12
    };

Require all four positive-area middle-room fragments.
Require fragment cells `(0,0)`, `(1,0)`, `(0,1)`, `(1,1)`.
Require one middle-room node with area `16 m²`.
Require middle-room anchor `[63.75,63.75]`.

| Edge ID | Gap m | Length m |
|---|---:|---:|
| `v2:diag:0,0:a` | 12 | 20.5 |
| `v2:diag:0,0:b` | 12 | 20.5 |

Require five nodes, two edges, and no direct A-to-B edge.

For the partial sample, use `[[0,0],[1,1]]`.
Register all four middle-room fragments before validation.
Require sampled middle-room area `8 m²`.
Require anchor `[63.75,63.75]`.
Require three nodes and both 12 m diagonal gaps.

For pre-T0 compatibility, remove `middleRoom`, `corridorLengths`, and `stretch`.
Keep `d.length=28` and the same line.
Require one direct diagonal edge with gap `28` and length `40.5`.
Require no middle-room node.

#### F5 — Synthetic closed square
Use four sampled cells:

    [[0,0],[1,0],[0,1],[1,1]]

Define 10 m x 10 m halls:

    cx=i*64+32;
    cz=j*64+32;
    hall={
      x0:cx-5,x1:cx+5,
      z0:cz-5,z1:cz+5,
      spaceId:`H:${i},${j}`
    };

Use four internal axis edges.
Define each original link:

    {
      id:`v2:edge:${axis}:${i},${j}`,
      axis,mode:'corridor',
      fromSpaceId,toSpaceId,
      gaps:[27,27],
      corridor:{t:0,w:2,ceil:2.5}
    }

Set `connectionOf(0,0,'x').mode='closed'`.
Keep the other three connections open.
Return the original corridor from `linkOf(0,0,'x')`.
Return `null` from `diagonalOf()`.

Require:

    before===64
    after===192
    delta===128

For the unreachable variant, use `[[0,0],[1,0]]`.
Require:

    before===64
    after===Infinity
    delta===null
    closedDetour.n===0
    closedDetour.unreachable===1

### 6.3 Exact graph test names
Use `tests/unit/gen2-measure.test.mjs`.

| ID | Exact test name | Required check |
|---|---|---|
| A01 | `roomGraph: output is independent of cell planning order` | For each CORPUS seed, plan cells forward and reverse in fresh worlds; require `deepStrictEqual` graphs. |
| A02 | `roomGraph: shared space fragments count once` | Assert F2. |
| A03 | `roomGraphFromRecords: four rooms have exact proximity metrics` | Assert F1. |
| A04 | `roomGraphFromRecords: overlapping fragments use union area` | Use `[0,4]x[0,4]` and `[2,6]x[0,4]`; require `24 m²`, not `32 m²`. |
| A05 | `roomGraphFromRecords: missing endpoints and conflicting IDs fail` | Apply Section 4.3. |
| A06 | `roomGraphFromRecords: contact does not create an edge` | Use F1 rooms A and B without links; require two nodes, zero edges, two components. |
| A07 | `roomGraph: isolated nodes count as components` | Apply Section 4.7 to empty, one-node, and two-node graphs. |
| A08 | `roomGraph: different-space seams create zero-gap edges` | Assert F3 and its equal-space variant. |
| A09 | `roomGraph: diagonal middle rooms split one link into two edges` | Assert F4, its partial sample, and its pre-T0 variant. |
| A10 | `roomGraph: boundary connectors do not create isolated nodes` | Use the boundary fixture below. |
| A11 | `roomGraphFromRecords: record order does not change the result` | Reverse F1 room, fragment, and link declarations; require `deepStrictEqual`. |
| A12 | `measureRoomGraphs: empty graphs and isolated nodes have exact component counts` | Apply Section 4.7, including its exact empty output. |
| A13 | `measureRoomGraphs: duplicate seeds are rejected` | Pass two samples with seed `1`; require `TypeError`. |
| A14 | `roomGraphFromRecords: canonical self-links are rejected` | Add an A-to-A F1 link; require `TypeError`. |
| A15 | `measureRoomGraphs: canonical self-edges are rejected` | Add a graph A-to-A edge; require `TypeError`. |
| A16 | `closedDetour: restores only the selected closed edge` | Assert F5 finite detour and unchanged world data. |
| A17 | `closedDetour: unreachable detours are counted` | Assert the F5 unreachable variant. |
| A18 | `measureWalks: restoreId rejects missing and nonclosed edges` | Require `TypeError` for missing, open, and out-of-sample IDs. |

For A10, sample only `[[0,0]]`.
Use F3's hall at `(0,0)`.
Define the boundary connection as:

    connectorSpaceId='M'
    gaps=[27,27]
    corridor={t:0,w:2,ceil:2.5}
    parts=[
      {i:0,j:0,x0:56,x1:64,z0:28,z1:36},
      {i:1,j:0,x0:64,x1:72,z0:28,z1:36}
    ]

Set its mode to `connector-room`.
The adapter must not request that boundary connection.
Require one sampled hall node and zero edges.

### 6.4 Validation tests
Use A05, A14, and A15.
Require `TypeError` for:
- Missing endpoints and conflicting fragment or link IDs.
- Duplicate sampled cells.
- Invalid Q2 alignment or nonfinite coordinates.
- Zero-area or out-of-cell fragments.
- Invalid `lv` or forbidden room kinds.
- Invalid edge kinds or diagonal line segments.
- Link endpoints outside complete declared room boundaries.
- Conflicting declarations of one `spaceId`.
- Invalid `node.anchor` shape or nonfinite anchor coordinates.
- Empty, duplicate, or out-of-sample `node.cells`.
- Duplicate edge IDs.
- Nonfinite or negative graph gaps, lengths, or areas.

Permit zero node area.
Preserve input objects without mutation.
Require valid partial F4 boundary validation.

### 6.5 Report tests
Run the CLI from Section 5.

Require:
- Top-level `rooms`, `roomComponents`, and `closedDetour`.
- `connections.walk.mean` and `connections.walk.p90`.
- Every existing report field.
- `rooms.gap.n===rooms.edges`.
- Finite `direct`, `near`, and `long` ratios in `[0,1]`.
- Exactly one room-graph component per complete-CORPUS seed.

Check all labels in Section 4.12.
Require `q90()` to return `n 0` for no finite values.
Require the exact unreachable example in Section 4.12.
Require `room graph components per seed: none` for zero seeds.

### 6.6 Body integration test
Use `tests/unit/gen2-detour-walk.test.mjs`.

After T0, replace this exact test:

    walks: the graph estimate is near a body's shortest height-aware walk, for the longest pairs on both axes

Before T0, its corresponding name is:

    walks: the graph estimate is near a body's shortest walk on the floor, for the longest pairs on both axes

Use the new name:

    walks: thirty distinct longest pairs satisfy the one-sided body bound

Replace exactly one existing comparison test.
Do not keep both the ten-pair and thirty-pair tests.
Use Section 4.13 for every sample, endpoint, bound, and assertion.
Do not use the old symmetric assertion.

Keep these reachability tests unchanged:

    every diagonal corridor of the corpus is walkable hall to hall in both directions, along its own pieces

    round every closed edge of the corpus a body walks from one hall to the other, inside their district

### 6.7 Final checks
Use the regression commands in Section 5.
Require successful completion.
Require deterministic room-graph output.
Require unchanged generator geometry, saves, and default selection.

## 7 Out of scope
Do not implement Stage 01 room clusters or T2–T6 features.
Do not add walk-distance, pruning-detour, or proximity-ratio gates.
Do not measure sightlines or build 2F or B1 room graphs.
Do not rewrite T0's height-aware walk helper.
Keep every file and feature in Section 2.2 unchanged.

## 8 Open conflicts with user decisions
None.
