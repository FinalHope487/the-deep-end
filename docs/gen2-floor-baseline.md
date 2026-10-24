# v2 樓層面積基線 · 2026-10-24

Stage 01B 量測（基準 `08c9dc9` 的生成器）。重產：`node tools/gen2-measure.mjs`（`--json` 出完整資料）。耗時一行每次不同，其餘每次相同。

seeds 1, 2, 3, 7, 42, 99, 1234, 20261024 · 512 cells of 64 m · grid 0.5 m · districts 2×2 cells

| floor | footprint | share | walkable | pool | deep | sealed | removed by flights/voids | same-floor overlap | cells with floor |
|---|---|---|---|---|---|---|---|---|---|
| 1F | 766,455 m² | 82.4% | 698,625 m² | 139,660 m² | 53,345 m² | 14,760 m² | 38,931 m² | 8,785 m² | 512 / 512 |
| 2F | 62,124 m² | 6.7% | 60,492 m² | 4,794 m² | 1,489 m² | 0 m² | 1,883 m² | 0 m² | 215 / 512 |
| B1 | 101,575 m² | 10.9% | 99,181 m² | 19,019 m² | 2,341 m² | 0 m² | 0 m² | 13,769 m² | 252 / 512 |

ratios: 2F/1F 0.081 · B1/1F 0.133 · 2F/B1 0.612 (user target ≈ 0.5 · 0.5 · 1, a rough direction)
stairs 21,889 m² counted apart · ladders 160

districts (128): 1F share min 67.9% · p25 77.5% · median 82.6% · p75 88.5% · max 100.0%
  2F share min 0.0% · p25 3.3% · median 6.0% · p75 9.3% · max 21.7% · no 2F in 13
  B1 share min 0.0% · p25 6.6% · median 10.3% · p75 14.1% · max 27.4% · no B1 in 9

room kinds (count · footprint):
  1F: corridor 1972 · 128,454 m² | giant-hall 76 · 122,643 m² | hall 436 · 500,598 m² | showcase 291 · 14,760 m²
  2F: upper 215 · 62,124 m²
  B1: b1corridor 1307 · 21,462 m² | b1hall 15 · 5,416 m² | basement 187 · 47,060 m² | reservoir 38 · 11,845 m² | shaft 80 · 15,793 m²

corridors 3279: 1F length n 1972 · min 5 · p25 11.5 · median 16 · p75 19.5 · max 26
  B1 length n 1307 · min 10 · p25 10 · median 11 · p75 11 · max 11
  width n 3279 · min 2 · p25 3 · median 3 · p75 5 · max 6
  1F length histogram (m): 4–8: 88 · 8–12: 408 · 12–16: 488 · 16–20: 555 · 20–24: 367 · 24–28: 66
1F ways out per cell: 4: 512
stairs: straight to 2F 104 · straight to B1 101 · switchback to 2F 111 · switchback to B1 86
voids: atrium 44 · pit 33 · split 80
pools (count · area): 1F L deep 44 · 11,682 m² | 1F L wading 36 · 7,064 m² | 1F blob deep 51 · 11,280 m² | 1F blob wading 31 · 4,996 m² | 1F ellipse deep 58 · 14,496 m² | 1F ellipse wading 54 · 13,100 m² | 1F rect deep 59 · 22,248 m² | 1F rect wading 63 · 15,961 m² | 1F rrect deep 81 · 25,146 m² | 1F rrect wading 46 · 13,688 m² | 2F L deep 6 · 327 m² | 2F L wading 1 · 30 m² | 2F blob deep 4 · 490 m² | 2F blob wading 3 · 121 m² | 2F ellipse deep 9 · 642 m² | 2F ellipse wading 8 · 518 m² | 2F rect deep 3 · 222 m² | 2F rect wading 7 · 585 m² | 2F rrect deep 10 · 729 m² | 2F rrect wading 11 · 1,130 m² | B1 L deep 7 · 869 m² | B1 L wading 11 · 1,088 m² | B1 blob deep 9 · 906 m² | B1 blob wading 16 · 1,249 m² | B1 ellipse deep 11 · 884 m² | B1 ellipse wading 22 · 1,493 m² | B1 rect deep 8 · 955 m² | B1 rect wading 383 · 6,985 m² | B1 rrect deep 3 · 571 m² | B1 rrect wading 38 · 4,019 m²
stacking: 2F water over 1F floor 1,937 m² · 1F water over B1 floor 4,073 m² · 2F pool over 1F pool 0 m² · 1F pool over B1 pool 302 m²

not measured: reachability: walkable area that cannot be reached from the start (inaccessible components) is not separated out; door / opening heights and threshold steps; connection degree of 2F and B1 rooms (each has one flight; no graph is built); floor area outside a plan's own cell (no room crosses it today)
cost: planning 467 ms · measuring 1335 ms
