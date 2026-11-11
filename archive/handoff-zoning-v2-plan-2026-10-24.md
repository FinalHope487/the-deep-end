# v2 分區重做：實作計劃（ChatGPT 原文，第 1 部分）· 2026-10-24

來源：ChatGPT 分析對話 `https://chatgpt.com/c/6adc9b2f-e354-83ec-b8c8-ce1df7ab5aa8`，任務 `c2c_f7d2` ITERATION 1，推理強度高。輸入是同一任務 ITERATION 0 的 114 項問題清單（編號 T01–T20、P01–P22、X01–X22、R01–R12、C01–C12、V01–V26）。
文件過長依 AGENTS 拆成兩份：本檔＝第 0–Stage 03A 之前；續篇＝`handoff-zoning-v2-plan-2026-10-24-part2.md`。
整理方式：內容照貼；只把 ChatGPT 頁面上被轉成亂碼的算式（2:1:1 比例）改成純文字。**所有內容是 ChatGPT 的文字，Claude 未逐項對程式碼核實；其中的行號、百分比、容許帶是它的建議，不是已驗證數字。**
接手者：另見 `handoff-zoning-v2-2026-10-24.md`（現況、規則、橋接流程）。

> **使用者補充（交接時加註，非 ChatGPT 原文）：1F:2F:B1 ≈ 2:1:1 只是大致要求，不是必須嚴格遵守的規範。** 下文 Stage 03A 的容許帶（45–55%、22–28%、0.85–1.15）是 ChatGPT 自訂的實作容許值，不得當成硬性驗收門檻；量測並回報實際比例即可。

---

[C2C] STATE: PLAN

TASK_ID: c2c_f7d2
ITERATION: 1
WORKSPACE: dreamcore-explorer
MODE: Planning and review; Claude owns execution
BASELINE HEAD: 88c1cce
SCOPE: v2 procedural generator (?gen=v2) only
INPUT: Accepted 114-issue inventory from ITERATION 0

## 0. Decision and non-negotiable constraints

Decision: ADOPT the earlier seven-stage structure, with explicit sub-stages and harder acceptance gates.

The stage sequence is:

| Stage | Objective | Gate |
|---|---|---|
| 01 | Contract, baseline measurements, deterministic foundations | Measurement correctness |
| 02 | Horizontal zoning, cross-cell ownership, corridor topology | Horizontal terrain connected |
| 03 | Floor coverage, room types, multi-floor circulation | Cross-floor layout connected |
| 04 | Complete terrain, elevations, stairs, voids, windows, physical clearance | TERRAIN COMPLETE |
| 05 | Complete pools, water, stacked-pool clearance, rendering, performance | TERRAIN + POOLS COMPLETE |
| 06 | Additional decoration and material treatment | Only after Stage 05 passes |
| 07 | Architectural variation and chaos-tuning | Only after Stage 05 passes |

Stages 01–05 are the mandatory terrain/pool completion path. Stages 06–07 are downstream, separately executable work—not prerequisites that can be used to postpone missing terrain or pool functionality.

Hard constraints
- Do not change v1 behavior or default-site behavior. js/main.js:25-27 selects v2 only when gen=v2. Preserve that boundary.
- Do not change the existing save contract. Preserve js/save.js, its save key, parsing semantics, and compatibility. Internal generation schemas may change, but public persistence cannot.
- Do not modify prefab groups or implement the planned prefab library. No prefab-based workaround for incomplete procedural terrain or pools.
- Finish the complete terrain and pool systems before adding new decoration objects or tuning building parameters merely to produce chaos.
- The target 1F:2F:B1 = 2:1:1 is the USER'S requirement, recorded in work/zoning-request.md:31-32 and docs/decisions/2026-10-24-floor-ratio-2-1-1.md. It is not an invented recommendation.
- Every structural decision must be reproducible from seed, world coordinates, and immutable planning inputs, independent of cell build order, render loading order, cache eviction, or revisit.
- Preserve working straight and switchback stairs, pool shapes, valid wading paths, voids, showcases, giant halls, and B1 maze functionality except where an explicit new contract supersedes an implementation detail.
- Failing test first; small executable increments; relevant tests green before committing. No broad rewrite without observable intermediate results.

Current Git note: The MCP check found no tracked changes or diff against HEAD, but did find one untracked file: docs/decisions/2026-10-24-floor-ratio-2-1-1.md. This file contains the ratio decision. Claude must preserve it and must not silently stage unrelated pre-existing files.

## 1. Architectural direction

The key change is to stop equating architectural generation units with streaming cells.

Retain the 64 m cell for rendering, collision lookup, caching, and loading, but introduce a deterministic higher-level spatial plan.

Recommended internal model:

```
WorldSeed
  └─ Deterministic DistrictPlan
       ├─ Space owners and extents
       ├─ Floor-coverage targets
       ├─ Room programs and room types
       ├─ Connection graph
       ├─ Vertical circulation graph
       └─ Reserved structural volumes
            ├─ Room/floor/ceiling volumes
            ├─ Openings/voids
            ├─ Stair volumes
            └─ Pool excavation volumes
                 ↓
          Terrain realization
                 ↓
           Pool realization
                 ↓
        Validated WorldPlan
                 ↓
       Cell-local mesh extraction
                 ↓
       Rendering and collision
```

A district is a deterministic planning unit, not a new streaming unit. Its exact dimensions can be selected during Stage 01 measurement, but its ownership and generation must be stable across district boundaries.

Use canonical coordinate-based ownership for cross-cell structures. Adjacent cells reference the same logical architectural object and extract only the geometry they own for rendering.

Do not use a mutable, centrally accumulated random sequence whose result changes depending on which cells the player visits first.

The architecture should support new structures without turning every room into a predefined template. Room types describe spatial functions and constraints; procedural terrain primitives supply variation inside them.

## Stage 01 — Contracts and measurement foundation

Goal: Establish measurable acceptance criteria and deterministic verification infrastructure without changing terrain or pool appearance.

Files: js/gen2.js, a proposed test/measurement helper such as js/gen2-measure.js, tests/unit/gen2.test.mjs, a proposed tests/unit/gen2-coverage.test.mjs, and the existing floor-ratio decision record. Use the decision record without overwriting it.

### 01A — Fix cell-key identity
Issues solved: C11

World2.plan() currently builds a numeric key from a packed coordinate expression (js/gen2.js:357-363). This can alias outside its implicit coordinate range.

Use an injective representation of signed cell coordinates, such as a coordinate-pair string, without altering existing generated layouts.

Red-first test: Show that distinct distant coordinates such as (0,65536) and (1,0) produce independent plans even when requested in different orders.

Acceptance: Unique coordinate identity, no cross-coordinate plan reuse, identical plans for the same seed and coordinate, unchanged local baseline output.

### 01B — Add quantitative floor/terrain audit
Issues solved: V19

Create a deterministic measurement utility that can enumerate a bounded sample without building Three.js meshes.

It must measure:
- Per-level architectural footprint area.
- Per-level physically walkable area, separately.
- Covered versus absent floor area.
- Counts and areas by room type and level.
- Corridor lengths, opening widths, connection degrees.
- Stair types, vertical transitions, inaccessible components.
- Pool counts, shapes, depth classes, occupied areas.
- Potential structural overlap categories.
- Generation and measurement cost.

Define the floor-share denominator precisely: for each level l, measure A_l as the union of its constructed room/floor-plan footprint, including pool basins as occupied architecture, excluding absent-floor voids. Do not double-count overlapping rooms on the same level. Count stair circulation separately to avoid artificially increasing a level's coverage.

Also report actual traversable area W_l. A level consisting almost entirely of inaccessible deep water must not be treated as successful merely because its architectural footprint quota is satisfied.

Red-first tests: Hand-constructed overlapping rooms must count union area once; removing a void must reduce footprint area; multiple room types must not be conflated; all sampled metrics must be finite, reproducible, and independent of plan-request order.

Acceptance: Generate and record an initial reproducible baseline over a fixed, documented seed/coordinate corpus. Do not require the old generator to meet the new 2:1:1 target at Stage 01.

### Stage 01 gate
The measurement utility works independently of rendering, the cache-key regression passes, and baseline statistics are recorded. No architecture changes or appearance tuning occur.

## Stage 02 — Horizontal terrain and zoning

Goal: Make large spaces own neighbouring territory, shorten or diversify passage lengths, and replace the fixed four-corridor-per-cell layout with architectural connections.

Files: js/gen2.js, proposed js/gen2-layout.js or equivalent pure-planning module, js/mesh2.js, js/cells2.js, tests/unit/gen2.test.mjs, tests/unit/gen2-paths.test.mjs, tests/e2e/gen2.spec.js.

### 02A — Cross-cell spatial ownership
Issues solved: T01, T12, T13, C01, C04, C06, C07, C09, C10, C12

Introduce architectural spaces whose footprints may extend across multiple 64 m cells.

Replace rooms[0] as an architectural identity with explicit room/space identifiers and ownership. Preserve any existing public API shape only where needed for compatibility; internally, query spaces by canonical ID and geometry.

Large spaces should be able to extend north, south, east, or west into adjacent territory, including L-shaped or compound extents. They must occupy the neighbouring footprint rather than leaving unnecessary voids connected by artificially lengthened corridors.

Render a multi-cell space by clipping its single canonical plan into cell-local pieces. Plan regeneration must not depend on which cell was loaded first.

Red-first tests:
- A multi-cell space has identical owner and geometry from either side of a seam.
- Requesting neighbours in reversed orders yields identical world results.
- Evicting and rebuilding plans changes neither topology nor geometry.
- No duplicate wall, missing floor, or unowned border appears at a shared seam.
- A space without an ordinary hall in a cell can still be queried and rendered.

Acceptance: At least rectangular, L-shaped, and compound cross-cell spaces work in a playable 1F scene. Existing giant-hall and normal corridor regression tests remain valid at the behavioral level.

### 02B — Connection graph and corridor design
Issues solved: T08, T09, T10, T11, C02

Generate circulation edges between architectural spaces, not automatically between every pair of adjacent cells.

Connection designs must support direct wide openings, short corridors, offset doors, winding or dogleg corridors, and deliberately longer passages where appropriate. Edge positions and corridor lengths follow structural constraints rather than simply increasing random jitter.

Prioritize eliminating unnecessary dead space around large rooms.

Red-first tests:
- Every required 1F neighbouring district connection is traversable.
- The mandatory connection graph is connected.
- Corridors have a measurable distribution of lengths, including short and indirect connections.
- Door positions are not limited to the centre ±4 m rule.
- A winding connection cannot collide with an unrelated room or block the only required route.
- No structure silently replaces a connection with an impassable wall.

Acceptance: Seeded blockout examples demonstrate large spaces absorbing adjacent territory, genuinely shorter passages, non-cardinal room connections, and more than one corridor path shape. Connectivity and seam tests pass.

### Stage 02 gate
The horizontal world is connected, deterministic, independent of cache eviction, and no longer architecturally constrained to one hall plus four corridors per cell.

This is structural layout improvement, not the later cosmetic chaos-tuning stage.

## Stage 03 — Cross-floor share, room types, and circulation

Goal: Make all three floors independent architectural layers, control their relative coverage, select appropriate room types for each, and connect them through a validated multi-floor graph.

Files: js/gen2.js, proposed layout/coverage modules, js/mesh2.js, js/cells2.js, tests/unit/gen2.test.mjs, tests/unit/gen2-paths.test.mjs, tests/unit/gen2-coverage.test.mjs, tests/e2e/gen2.spec.js.

### 03A — Floor footprint planning
Issues solved: X01, X02, X03, X04, X12, X20, X22, C05

The target is A(1F) : A(2F) : A(B1) ≈ 2 : 1 : 1. Equivalently, the target distribution of constructed floor footprint is:

| Floor | Target share | Proposed aggregate acceptance band |
|---|---|---|
| 1F | 50% | 45–55% |
| 2F | 25% | 22–28% |
| B1 | 25% | 22–28% |

These tolerance bands are proposed implementation acceptance tolerances, not additional user-specified ratios. Also require the aggregate 2F/B1 area ratio to fall between 0.85 and 1.15.

The user target is global, not a hard quota imposed on every district.

District themes may deliberately shift their local coverage:

| District theme | 1F | 2F | B1 |
|---|---|---|---|
| Open / bright hall | 55–70% | 15–30% | 10–25% |
| Elevated gallery | 35–50% | 30–45% | 15–30% |
| Sunken / submerged | 35–50% | 10–25% | 30–45% |

These are initial design bands, not mandatory per-district quotas. Their purpose is to permit meaningful spatial contrast while achieving the global aggregate target.

（續篇從「Implement floor presence and architectural extents before attaching stairs」開始。）
