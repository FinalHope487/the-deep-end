# v2 route baseline (S0) · 2026-10-27

Measured with `js/gen2-routes.js` after the review fixes of S0 (generator code unchanged since `6f1901d`). Corpus: seeds 1, 2, 3, 7, 42, 99, 1234, 20261024; 512 cells of 64 m; default `World2` (cluster share 0.5).
Rebuild: `node tools/gen2-measure.mjs` (floors) and `node tools/gen2-measure.mjs --routes` (routes). Both add `--json`. Each run takes about 2 to 4 s.
The old floor numbers are in `docs/gen2-floor-baseline.md` (commit `08c9dc9`, before the cluster work). This file replaces them as the reference.

## Floor shares

| Floor | Footprint | Share | Old share (`08c9dc9`) | Cells with floor |
|---|---|---|---|---|
| 1F | 849,389 m² | 85.2% | 82.4% | 512 / 512 |
| 2F | 59,238 m² | 5.9% | 6.7% | 202 / 512 |
| B1 | 88,412 m² | 8.9% | 10.9% | 205 / 512 |

2F/1F 0.070, B1/1F 0.104. The rough aim is 0.5 and 0.5 (1F : 2F : B1 about 2 : 1 : 1). The cluster work moved the shares away from the aim. Districts with no 2F: 22 of 128. With no B1: 24 of 128.

## Route metrics

Definitions: `js/gen2-routes.js`. A pair is two 1F rooms whose anchors stand 64 to 160 m apart. The fan is the area between the two anchors with half angle 25°.
Standard (user decision 2026-10-27): a split pit counts as 1F. The way through a pit is a 1F edge, not a floor change. The first S0 run counted the pit shaft as B1 (222 pairs cut off on 1F, 424 shortcut pairs); this table replaces it.

| Metric | Value | Meaning |
|---|---|---|
| Pairs | 18,232 | Every pair in range, once. A split hall counts as one room per region |
| Joined on 1F | 18,232 | 1F alone joins every pair |
| Cut off on 1F | 0 | |
| Flights as graph edges | 367 | Equals the stair count in the floor report (98 + 83 + 104 + 82) |
| Splits | 50 | Each cuts its hall into regions, one 1F node per region, joined by one 1F pit edge (to a ladder, down, across the pit, up the other ladder) |
| Flights that leave their cell | 0 | Checked on all 1,620 rooms off 1F (202 upper, 165 basement, 1,155 B1 corridors, 35 reservoirs, 50 shafts, 13 B1 halls): none leaves its cell |
| Other floor shorter | 0 | No flight shortens any 1F walk |
| Shortcut pairs | 0 (0.0%) | Fan blocked on 1F, and a walk inside the fan on some floor beats the 1F way. Target of S1: about 20% of eligible borders |
| Fan blocked on 1F | 11,411 (62.6%) | Anchors off the fan; the natural effect of sparse rooms. Same value on any floor |
| Ratio, 1F way / any-floor way | 1.00 for all pairs | The contract in ROADMAP.md: target 2 to 4, mode 3, on shortcut pairs |
| Detour, 1F way / straight line | min 1.01 · p25 1.40 · median 1.54 · p75 1.82 · p90 2.18 · max 4.23 | Shown for context: the contract ratio divides by the any-floor way, not by the straight line |

## What this shows

- 2F and B1 rooms off a flight are dead ends. Each hangs off one hall flight inside its own cell. No flight shortens a walk, so today every contract ratio is 1.00 and there is no shortcut.
- The 50 split pits cut halls in two on the floor plan, but with the pit counted as 1F they shorten nothing. Under the first standard (shaft as B1) they cut off 222 pairs on 1F and gave 424 shortcut pairs.
- The 1F ways are already 1.5 times the straight line at the median. A contract ratio of 3 means about twice today's detour on the chosen pairs.
- The "fan blocked" share on 1F is high without any design. `shortcut` in `routePairs` counts a pair only when a walk inside the fan on another floor is shorter than the 1F way, not when the fan is merely empty.

## Limits

- Graph level: a room stands at its anchor and an edge is a straight hop. A fan test looks at anchors, not at passage lines or walls. Proof of a route needs a walk with the real body (`tests/unit/gen2-detour-walk.test.mjs`).
- Edges out of the sample are dropped. Pairs near the sample border can show longer detours than the world has.
- A split hall is cut into regions (its pit edge is a 1F edge) by its pits (a hall shared by cells can hold one pit per cell; a point is named by its side of each pit). A region stands at the hall anchor when that lies in it, else at the mean of the corridor ends, flight entries and ladder feet that open into it. Corridor lengths use that anchor. The graph cannot tell two parts of one region apart.
- A pit that ends on a cell edge would not cut the hall (the neighbour fragment's floor runs round it). The adapter skips such a pit. None of 326 splits over seeds 1 to 300 ends on a cell edge, and no test builds one.
- A flight's walk uses the real flight geometry (`flightWalk`): ramps, landing, switchback legs. The legs from the room anchors to the flight are Manhattan lengths.
- The fan length limit is the anchor distance: a room beyond B on the line is not inside the fan.
- The graph holds only the 367 rooms flights open into. B1 corridors, reservoirs, shafts and B1 halls stay inside their cell too, so they cannot join two cells and are left out.
