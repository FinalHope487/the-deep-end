# v2 route baseline (S0) · 2026-10-27

Measured at commit `81f33bd` (generator code unchanged since `6f1901d`). Corpus: seeds 1, 2, 3, 7, 42, 99, 1234, 20261024; 512 cells of 64 m; default `World2` (cluster share 0.5).
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

| Metric | Value | Meaning |
|---|---|---|
| Pairs | 16,857 | Every pair in range, once |
| Joined on 1F | 16,857 | 1F alone joins every pair |
| Flights as graph edges | 367 | Equals the stair count in the floor report (98 + 83 + 104 + 82) |
| Flights that leave their cell | 0 | Checked on all 1,620 rooms off 1F (202 upper, 165 basement, 1,155 B1 corridors, 35 reservoirs, 50 shafts, 13 B1 halls): none leaves its cell |
| Other floor shorter | 0 | No flight shortens any 1F walk |
| Shortcut pairs | 0 (0.0%) | Target of S1: about 20% of eligible borders |
| Fan blocked on 1F | 10,430 (61.9%) | Anchors off the fan; the natural effect of sparse rooms. Same value on any floor |
| Ratio, 1F way / any-floor way | 1.00 for all pairs | Target of S1: 2 to 4, mode 3, on shortcut pairs |
| Detour, 1F way / straight line | min 1.01 · p25 1.38 · median 1.52 · p75 1.77 · p90 2.15 · max 4.23 | The user's "about 3 times" is measured against the straight line |

## What this shows

- Today 2F and B1 rooms are dead ends. Each hangs off one hall flight inside its own cell. No walk gains from a floor change.
- The 1F ways are already 1.5 times the straight line at the median. A target of 3 means about twice today's detour on the chosen pairs.
- The "fan blocked" share on 1F is high without any design. S1 must count a pair as a shortcut only when the other floor is shorter, not when the fan is merely empty. `shortcut` in `routePairs` does this.

## Limits

- Graph level: a room stands at its anchor and an edge is a straight hop. A fan test looks at anchors, not at passage lines or walls. Proof of a route needs a walk with the real body (`tests/unit/gen2-detour-walk.test.mjs`).
- Edges out of the sample are dropped. Pairs near the sample border can show longer detours than the world has.
- The pit "split" ladders (50 splits, 100 ladders) join two halves of one hall through B1. The graph has one node per hall, so they are not edges. They do not join two rooms.
- The fan length limit is the anchor distance: a room beyond B on the line is not inside the fan.
- The graph holds only the 367 rooms flights open into. B1 corridors, reservoirs, shafts and B1 halls stay inside their cell too, so they cannot join two cells and are left out.
