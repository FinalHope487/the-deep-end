# v2 分區重做：實作計劃（ChatGPT 原文，第 2 部分）· 2026-10-24

續自 `handoff-zoning-v2-plan-2026-10-24.md`（第 0 節、Stage 01、02、03A 開頭在那邊）。同一份 ChatGPT 回覆，任務 `c2c_f7d2` ITERATION 1。內容照貼；Claude 未逐項核實。
Claude 發現的文字錯誤（不影響內容，接手者留意）：第 5 節「Coverage reconciliation by group」說房型 R 群「9 in Stage 03、1 deferred」，依上方指派表實為 03B 含 R01–R08 共 8 項、R11 與 R12 兩項延後；V 群的算式也寫得含糊。指派表本身加總 111＋3＝114，沒有重複。

> **使用者補充（交接時加註，非 ChatGPT 原文）：1F:2F:B1 ≈ 2:1:1 只是大致要求，不是必須嚴格遵守的規範。** 下文 Stage 03A 的容許帶（45–55%、22–28%、0.85–1.15）是 ChatGPT 自訂的實作容許值，不得當成硬性驗收門檻；量測並回報實際比例即可。

---

（接續 Stage 03A）Implement floor presence and architectural extents before attaching stairs. Allow substantial absence of 1F floor where a connected alternate vertical route exists.

restPoint() must find a safe, reachable standing point rather than assuming a local hall.

Red-first tests: Area-union correctness; target share across a seeded multi-district corpus; non-1F cross-cell rooms; intentionally absent 1F regions; safe landing/respawn; deterministic district boundaries.

Acceptance: The 2:1:1 global target meets its aggregate tolerance, per-district variation is observable, and 1F remains the largest floor share without forcing every cell to contain 1F architecture.

### 03B — Floor-aware room-type selection
Issues solved: X07, R01, R02, R03, R04, R05, R06, R07, R08

Separate a room's type from its floor index and the staircase that leads to it.

The generated architectural vocabulary must include at minimum:

| Floor | Required available room types |
|---|---|
| 1F | Open hall, dry hall, pool hall, column hall, raised/sunken hall, stair hall, enclosed showcase |
| 2F | Gallery, observation hall, upper pool hall, dry hall, circulation room, atrium-facing room |
| B1 | Narrow maze corridor, dry chamber, flooded chamber, reservoir, maintenance-like passage, stair-connected hall |
| Multiple floors | Atrium, shaft, split-level room, multi-floor hall |

A room type defines structural constraints, intended spatial function, water suitability, and circulation requirements. Do not turn the table into hardcoded visual prefabs.

Choose types conditionally using district theme, neighbouring space relations, available floor coverage, and route obligations.

Red-first tests: A room type can appear on each permitted level; prohibited combinations are rejected for documented structural reasons; seeded distributions are reproducible; types requiring water, voids, or stairs receive compatible reserved footprints.

Acceptance: Every supported floor contains multiple meaningful room types across the fixed seed corpus, including upper-floor pool halls and substantial B1 water spaces. Room types are no longer proxies for upper or basement.

### 03C — Multi-floor circulation graph
Issues solved: X05, X06, X08, X09, X11, X21, V20

Plan circulation as a graph whose nodes include floor and room identity and whose edges include horizontal and vertical transitions.

2F and B1 require genuine horizontal connections across cells. Stair destinations should be selected from the intended room graph, instead of creating destination rooms only after choosing a stair slot.

Mandatory routes must be traversable in both directions. Optional routes may dead-end or use ladders, but must not permanently trap the player.

Red-first tests: Spawn-to-target and target-to-spawn across multiple districts and all floors; connected upper and basement paths; alternative routes where specified; reconstruction after eviction; graph reachability versus Player-simulated reachability.

Acceptance: A player can enter one 2F or B1 room and move to another through that same level without necessarily returning to the original staircase. Every required region has a return route.

### Stage 03 gate
The global floor-area ratio, district coverage variation, room-type distribution, and multi-floor routing requirements all pass.

At this point, room placement and connectivity are complete at the planning/blockout level; physical terrain and collision realization continue in Stage 04.

## Stage 04 — Complete terrain and cross-floor physical geometry

Goal: Finish walkable terrain, structural heights, slopes, stairs, openings, voids, collision, and multi-floor headroom before pool completion begins.

Files: js/gen2.js, js/mesh2.js, js/player.js, proposed js/gen2-terrain.js and js/gen2-volume.js, js/cells2.js, relevant unit and Playwright tests.

### 04A — General-purpose elevation and floor geometry
Issues solved: T02, T03, T04, T05, T06, T07, T20, R10, V03, V04, V05

Represent each room's terrain as connected floor regions with explicit elevation functions, including flat, raised, sunken, sloped, and stepped areas.

Support multiple ramps and landing profiles per room, different door thresholds, short steps, and connected changes of height. The planner must derive traversability from Player dimensions and STEP2; do not rely solely on a visually smooth mesh.

Introduce clearance-aware collision that considers body volume, not only the presence of a nearby floor candidate.

Red-first tests: Rising and descending steps; threshold transitions; slope continuity; multiple elevation regions; adequate headroom; Player traverses the full required route without tunnelling through thin features; analytically sampled floor height matches rendered elevation.

Acceptance: At least one connected raised/sunken/stepped room, one multi-ramp room, and one different-height door transition can be traversed in both directions. Geometry and collision agree at the tested boundaries.

### 04B — Vertical structures, voids, and slabs
Issues solved: T16, T17, T18, X10, X13, X18, X19, C08, V09

Finish spatially integrated stairs, ramps, atriums, pits, split structures, shaft volumes, slabs, and ceilings.

Preserve straight and switchback stairs. Add spiral stairs as a genuine terrain/circulation form, not a decorative object. Support irregular void footprints and architecturally valid bridging or alternative split crossings.

Every occupied floor volume must have a coherent ceiling or overhead structural relationship. Missing floors must be visually closed where appropriate rather than exposing unfinished mesh backs.

Establish general-purpose volume reservations for future deep pool excavation and tower-like overlaps.

Red-first tests: Stair entry/exit alignment; spiral traversal and reverse traversal; void-floor removal; no conflicting floor/slab geometry; seam continuity at unequal room heights; required passage clearance beneath upper structures.

Acceptance: All required vertical connections are physically playable, floors/ceilings do not intersect, and voids are visually and collision-wise consistent across adjoining rooms and cells.

### 04C — Windows, sealed spaces, columns, and terrain verification
Issues solved: T14, T15, T19, V01, V06, V24, V25

Support sealed exhibits and viewing windows across varied room types and floors. Columns must be coherent structural volumes with collision and safe passage spacing, rather than only omitted standing surfaces.

Implement collision-capable parapet/rail boundaries where terrain safety requires them. Do not add unrelated decoration objects.

Complete distribution and geometry tests for corridor, room-type, opening-height, and terrain-shape coverage. Perform actual browser visual inspection of existing and new stair/void geometry.

Red-first tests: Window aperture matches its wall opening; sealed display remains inaccessible; different-floor viewing works; columns block occupied volume; rails prevent invalid crossing without blocking valid routes; multiple room and door variants appear in the test corpus.

Acceptance: No accessible sealed rooms, no missing wall around window openings, no column pass-through, no rail-related soft-locks, and no visible malformed stairs or voids in representative screenshots.

### Stage 04 gate — TERRAIN COMPLETE
The complete terrain system must pass its geometry, collision, reachability, and rendering checks.

No further terrain capability may be deferred merely to begin decoration. Pools may still lack final realization, but their reserved excavation volumes and structural constraints must already be supported.

## Stage 05 — Complete pool generation and integrated validation

Goal: Finish the whole pool system, including shape, depth, water, cross-cell placement, multi-floor interference, rendering correctness, and performance qualification.

Files: js/gen2.js, js/mesh2.js, js/cells2.js, proposed js/gen2-water.js and volume/planning modules, js/player.js as necessary, tests/unit/gen2.test.mjs, tests/unit/gen2-mesh.test.mjs, tests/e2e/gen2.spec.js, and the performance test entry points.

### 05A — Pool composition, shape, and depth
Issues solved: P01, P02, P03, P04, P05, P06, P09, P18

Generate pools as architectural compositions within the terrain plan.

Support complete independent pool outlines, including rectangle, ellipse/circle, rounded, L-shaped, and irregular smooth forms. Support flat, gradually sloping, stepped, and connected multi-basin bottom profiles.

Depth orientation and entry/exit design must follow the room's structural use, not automatically follow the longer axis. Avoid unnecessary bounding-box rejection for concave or curved shapes.

Red-first tests: Concave/curved triangulation; depth-band consistency; independent axis selection; multi-basin continuity; margin/passability constraints; no overlapping incompatible geometry.

Acceptance: Single, double, and compound pools form coherent arrangements. Every walkable pool region has a legitimate exit, and every deep pool avoids a mandatory route unless a separate valid traversal exists.

### 05B — Water systems and flooded-room terrain
Issues solved: P12, P13, P14, P15, P16, P17, P22, V02, V07, V08

Generate B1 flooded rooms and corridors with varied but ordered depths, dry/wet passage transitions, larger reservoirs, and connected shallow-water areas.

Model water level as a property of a connected body of water, rather than independently assigning every pool a height based only on depth category.

Water meshes must align with the true water footprints and represent depth-dependent colour and lighting consistently. Improve interior colour interpolation instead of relying exclusively on perimeter-vertex depth samples.

Red-first tests: Shared water-body height; flooded B1 path traversability; water-floor intersection correctness; interior colour/depth samples; analytic outline versus raster and mesh edges; no uncovered or duplicated pool-floor fragments.

Acceptance: Joined shallow/deep basins share a continuous water surface; B1 includes usable flooded and dry routes; water colour reflects depth; shallow/deep collision follows the established no-swimming rule.

### 05C — Cross-cell pools and vertical structural interference
Issues solved: P07, P08, P10, P11, P19, P20, P21, C03, X14, X15, X16, X17, V10, V21, V22, V23, V26

Allow pools to cross 64 m cell boundaries as single owned structural objects. Pool composition and water geometry must not reset at giant-hall seams.

Replace the fixed fallback-pool assumption with deterministic plan validation and repair that satisfies the hall's intended water character without inserting an arbitrary small basin.

Add cross-floor interference checks for:
- 2F pool excavation versus 1F ceiling and headroom.
- 1F pool excavation versus B1 ceiling, maze, and reservoirs.
- Two or three vertically stacked pool footprints.
- Pool bottoms versus stair shafts and support structures.
- Columns, walkways, and open floor beneath deep pools.

Generate the necessary structural undersides and supporting surfaces. Where volumes cannot coexist, resolve the layout deterministically rather than leaving intersecting geometry.

Red-first tests: Shared pool ownership across seams; cache-eviction reproduction; 2F-over-1F and 1F-over-B1 collision envelopes; triple-level overlap stress cases; fully rendered pool undersides; end-to-end traversal and return around stacked features; geometric continuity at seams.

Acceptance: Cross-cell pools remain seamless and visually whole; no incompatible structural volumes intersect; pools above lower occupied floors have proper undersides; mandatory routes remain open and reversible.

### 05D — Performance and final acceptance
Issues solved: V12, V13, V14, V15, V16, V17

Control rasterization, repeated pool-outline processing, triangulation, mesh allocation, and cache lifecycle costs. Retain frame-budgeted generation, but split or bound expensive uninterrupted work within its yield points.

Use measured hotspots to decide optimization; do not sacrifice pool correctness or visual completeness through an arbitrary reduction of geometry complexity.

Red-first tests: Stable geometry counts/outputs under cache rebuild; measurable worst-case large-hall workload; bounded build work; deterministic geometry after eviction; complete A11 performance regression.

Acceptance: All applicable unit tests and desktop browser tests pass. Run A11 v2 under a controlled, recorded environment meeting the project's thresholds:
- Average FPS at least 50 under the prescribed simulated mobile setup.
- Frames over 40 ms at most 2%.
- No uncontrolled mesh-memory growth over continued exploration.
- No generated-cell workload that repeatedly causes unacceptable long frames.

One favourable run in a contaminated environment is not sufficient. If results vary, report the distribution and continue correction; do not call performance verified on the basis of a single good sample.

### Stage 05 gate — TERRAIN + POOLS COMPLETE
The milestone is complete only when:
- All Stage 02–04 structural terrain and floor-coverage gates remain green.
- All Stage 05 pool functionality is implemented and verified, including cross-cell and stacked configurations.
- Every required route is still reachable and reversible.
- Collision and rendered geometry agree at essential boundaries.
- Representative real-browser screenshots have been reviewed.
- A11 v2 passes under valid measurement conditions.
- Existing v1/default-site/save-contract regression tests remain green.
- No known mandatory terrain or pool defect remains merely documented as a future task.

This is a genuine completion gate. An unresolved structural pool or terrain failure blocks Stage 06, regardless of how attractive the scene looks.

## Stage 06 — Post-completion decoration and materials

Goal: Improve material and decorative presentation only after the complete terrain/pool gate passes.

Issues solved: V11

Files: Primarily js/mesh2.js and existing rendering/material modules; new decoration files only under separate implementation authorization.

Red-first tests: For any newly introduced material data contract, first verify stable seeded selection, valid material inputs, and unchanged geometry/collision. Purely visual tuning may instead rely on verified browser output, consistent with AGENTS.md.

Acceptance: Additional material variation does not change collision, route connectivity, water levels, save behavior, or performance compliance.

This stage is not permission to modify the excluded prefab groups or silently introduce new structures that should have been finished during Stages 01–05.

## Stage 07 — Post-completion architectural variety tuning

Goal: Tune spatial rhythm and neighbour-to-neighbour contrast using the completed procedural capabilities.

Issues solved: R09

Files: Deterministic district/room-type selection logic and corresponding distribution tests; no prefab-library changes.

Red-first tests: A seeded multi-district sample must show measurable planned contrasts without breaking structure, coverage ratios, required routes, or rebuild determinism.

Acceptance: Distinct neighbouring spaces form intentional contrasts in dimensions, elevation, openness, circulation, water density, and visual exposure. Their composition is systematic but not visibly repetitive.

This stage may tune probabilities and correlations; it must not compensate for missing architectural primitives, invalid water geometry, or incomplete terrain functionality.

## 2. Explicit deferrals and exclusions

These three issues are not part of the Stage 05 terrain/pool completion definition:

| ID | Disposition | Reason |
|---|---|---|
| R11 | DEFERRED — excluded | Random/prefab group composition and the ≥20 complementary prefab library are explicitly forbidden in this task. They must remain untouched. Completing the underlying terrain and pool primitives does not imply that the prefab-group requirement is delivered. |
| R12 | DEFERRED — later world-progression work | The four complete landmark architectures and their progression integration are separate from generic terrain/pool completion. Their eventual implementation depends on the finished terrain/pool primitives and must preserve the save contract. This plan does not mark landmarks complete. |
| V18 | DEFERRED — real-device release gate | Actual middle-tier phone/tablet testing requires a real device and cannot be substituted with MCP source inspection or desktop CPU throttling. It remains mandatory for release/A12 acceptance, but its absence does not redefine the functional terrain/pool milestone as missing a generator capability. No real-device compliance is claimed. |

There are no other accepted-unfixed or silently deferred terrain/pool items.

V17 remains mandatory in Stage 05: a valid simulated-mobile A11 qualification must happen before decoration begins.

## 3. Cross-stage verification policy

- **Determinism**: For every stage affecting world generation, test the same seed and coordinates under forward, reverse, shuffled, and repeated request orders. Rebuild after cache eviction and compare canonical architectural plans—not incidental object allocation order.
- **Connectivity**: Use both graph-level checks and physical Player traversal. Graph reachability alone is insufficient when an opening is too narrow, a staircase misses its destination, or terrain height changes exceed step capability.
- **Geometry**: Validate floor, ceiling, stair, void, column, and pool volumes together. Where analytic geometry and cell rasterization coexist, test their shared boundary contract and inspect rendered output.
- **Performance**: Use the existing project's test runners and A11 thresholds. Record current HEAD, command, configuration, output, and measured results. Historical roadmap results are context, not proof of the new implementation.
- **Regression and contract protection**: Run the relevant v2 tests after each small code increment and the wider affected suites at each stage gate. Preserve the default GEN=1 selection and all save-contract behavior. Do not delete valid old tests merely because the internal representation changed; update implementation-coupled assertions to test the intended public invariants.
- **Stage progression**: Claude should execute one test-backed slice at a time. Within each stage, the sub-stages above are ordered by dependency. A stage is not complete until its acceptance conditions pass, and no subsequent stage should be used to conceal a failing earlier gate.

## 4. ITERATION 1 — Exact first executable slice

Execute Stage 01A + Stage 01B only. Do not begin Stage 02, change visual generation, or add decoration.

Execution contract for Claude

Goal: Establish deterministic cell identity and an accurate floor-coverage measurement baseline for v2.

Allowed files:
- js/gen2.js — only the cell-key fix and minimal required exposure for measurement.
- js/gen2-measure.js — proposed new pure-data measurement utility, or equivalent appropriately named module.
- tests/unit/gen2.test.mjs — focused regression.
- tests/unit/gen2-coverage.test.mjs — proposed new measurement tests.
- Existing documentation only for recording measured baseline results, following repository documentation rules.

Forbidden changes: v1 generator, js/main.js default selection, js/save.js, save schema/key, prefab groups, rendering effects, decoration objects, water/terrain generation algorithms, and unrelated dependencies.

Required tests, written red-first:
1. C11: Distinct far-away cell coordinates must not share a plan-cache key.
2. V19: Architectural footprint must be measured by per-floor geometric union, not naive room-area addition.
3. V19: Voids and overlapping room regions must not corrupt area totals.
4. V19: Reversing sampling order must not alter measured statistics.
5. V19: The report must expose actual floor-share and traversability metrics without requiring the current generator to match the future 2:1:1 target.

Required output: A reproducible report showing baseline 1F, 2F, B1 shares, area ratios, floor coverage per district/sample region, current room-type counts by floor, corridor-length distribution, and generation sample size. State any unmeasured category explicitly.

Acceptance: New regressions green; affected existing unit tests green; measured baseline recorded; no generator-layout changes; no save/default-site/prefab changes.

Review handoff: Claude must report changed files, precise test commands and results, sample seed/coordinate selection, measured ratio, observed limitations, and any failures. ChatGPT will then independently inspect the MCP diff and relevant tests before approving Stage 02.

## 5. Complete 114-issue coverage table

The table below is the authoritative single-disposition register. An issue may be referenced in its stage specification above, but it has exactly one assigned resolution or explicit deferral below.

| Assignment | Issue IDs | Count |
|---|---|---|
| 01A | C11 | 1 |
| 01B | V19 | 1 |
| 02A | T01, T12, T13, C01, C04, C06, C07, C09, C10, C12 | 10 |
| 02B | T08, T09, T10, T11, C02 | 5 |
| 03A | X01, X02, X03, X04, X12, X20, X22, C05 | 8 |
| 03B | X07, R01, R02, R03, R04, R05, R06, R07, R08 | 9 |
| 03C | X05, X06, X08, X09, X11, X21, V20 | 7 |
| 04A | T02, T03, T04, T05, T06, T07, T20, R10, V03, V04, V05 | 11 |
| 04B | T16, T17, T18, X10, X13, X18, X19, C08, V09 | 9 |
| 04C | T14, T15, T19, V01, V06, V24, V25 | 7 |
| 05A | P01, P02, P03, P04, P05, P06, P09, P18 | 8 |
| 05B | P12, P13, P14, P15, P16, P17, P22, V02, V07, V08 | 10 |
| 05C | P07, P08, P10, P11, P19, P20, P21, C03, X14, X15, X16, X17, V10, V21, V22, V23, V26 | 17 |
| 05D | V12, V13, V14, V15, V16, V17 | 6 |
| 06 | V11 | 1 |
| 07 | R09 | 1 |
| Deferred | R11, R12, V18 | 3 |
| TOTAL | All 114 accepted IDs | 114 |

Coverage reconciliation by group

| Group | Total | Resolution |
|---|---|---|
| Terrain T01–T20 | 20 | All assigned to Stages 02 and 04 |
| Pools P01–P22 | 22 | All assigned to Stage 05 |
| Cross-floor X01–X22 | 22 | All assigned to Stages 03–05 |
| Room types R01–R12 | 12 | 9 in Stage 03, 1 in Stage 04, 1 in Stage 07, 1 deferred |
| Cells/seams C01–C12 | 12 | All assigned to Stages 01–05 |
| Rendering/performance/tests V01–V26 | 26 | 24 assigned to Stages 01–06, 1 additional in the same set accounted as Stage 05's performance/test gates, 1 deferred |

Reconciliation result: 111 issues assigned to a solving stage, 3 explicitly deferred, 0 unassigned, 0 duplicate dispositions. Of the 111, 109 are required no later than Stage 05; V11 and R09 are deliberately post-completion work.

## 6. Verification status and limitations

ChatGPT inspected the current workspace through the Claude with ChatGPT · hub connector, including work/zoning-request.md, work/issue-enumeration-request.md, AGENTS.md, the floor-ratio decision note, and relevant generator/player/mesh/cell-manager source and test files previously reviewed for the accepted issue inventory.

The key implementation evidence includes:
- js/gen2.js:341-425 — 64 m cells, fixed horizontal layout, floor/stair attempts.
- js/gen2.js:457-597 — pool placement and basement generation.
- js/gen2.js:600-742 — void planning and floor/collision queries.
- js/gen2.js:775-829 — room assumptions and raster generation.
- js/mesh2.js:98-269 — floor, ceiling, wall, water, and column meshing.
- js/cells2.js:35-93 — cell loading, eviction, mesh budgets.
- js/player.js:55-125 — walking, sampled body collision, and floor following.
- tests/unit/gen2.test.mjs, tests/unit/gen2-paths.test.mjs, tests/e2e/gen2.spec.js — existing invariants and test coverage.
- ROADMAP.md:60-80 — prior verification and remaining v2 work.

Not verified in this planning iteration: Current unit-test execution, full browser runs, actual floor-area measurements, statistics over seeds, mesh screenshot correctness, cross-floor volume collisions, A11 on a controlled machine, and A12 on hardware. No code was changed by this review. Proposed acceptance ranges beyond the user's 2:1:1 target are planning choices and may be refined with Stage 01 evidence.

The current ratio decision has been verified as present in the workspace, but the actual generated ratio has not been measured.

[C2C] STATE: PLAN — READY FOR EXECUTION
TASK_ID: c2c_f7d2
ITERATION: 1
NEXT ACTION FOR CLAUDE: Execute Stage 01A + 01B, no other stages.
NEXT REVIEW: Return STATE: EXECUTED with changed files, tests, and measurement output for independent MCP inspection.
