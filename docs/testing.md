# Test tiers

AGENTS.md "Verification" points here. This file owns the tier rules. Change tiers here only.

## Tiers

| Tier | Content | Command | Run time (measured 2026-10-27) |
|---|---|---|---|
| Fast (default) | Unit tests without slow cases, plus e2e tests tagged `@smoke` | `npm run test:fast` | Unit 83 s, smoke e2e 110 s |
| Full unit | All unit tests, slow cases included | `npm run test:unit:full` | 5.2 to 9.1 min (two runs on 2026-10-27) |
| Full e2e | All desktop e2e tests | `npm run test:e2e:full` | About 13.5 min |
| Performance | A11 (`perf`), A11b (`perf-igpu`) | `npx playwright test --project=perf --no-deps` | Needs an idle machine |

Single commands: `npm run test:unit`, `npm run test:e2e`.
`npm test` is the old entry (`playwright test`, all projects). Old handoff files use `npm test -- --project=desktop`.

## When to run what

| Situation | Run |
|---|---|
| Before each commit and at round end | Fast tier |
| Change in `js/gen2*.js` (generator, district, measure) | Fast tier, then the slow unit files that import the changed module (`node --env-file=tests/slow.env --test <file>`) |
| Change in shared modules (`player.js`, `tiles.js`, `world.js`, `levels.js`) | Fast tier, then `npm run test:unit:full` |
| Visual or feel change (UI layout, ceiling, grain, ripples) | Fast tier. Look at the page. Run `npm run test:e2e:full` only if the user asks |
| Delivery or user asks for acceptance | Full unit, full e2e, performance |
| Test failure in the fast tier | Fix the cause first. Do not move a failing test to a slower tier |

The fast tier is green means: ready to commit. It does not mean: every old check passed.
Record in `ROADMAP.md` "Baseline" which tiers ran. Write "not run" for the others.

## Where a new test goes

| Test kind | Tier |
|---|---|
| Pure logic, geometry invariant, save/recovery, collision, determinism | Fast unit test |
| Bug repro test (AGENTS.md "Defect repair") | Fast unit test. Shrink the corpus until the case runs under 10 s |
| Case that takes 10 s or more alone (corpus sweep, long walk) | Fast file, with `slow` as the options argument: `test('name', slow, fn)`. Import it from `tests/unit/slow.mjs` |
| e2e test of a path that unit tests cannot reach (boot, input, save and continue, build output) | Add `{ tag: '@smoke' }` only if it protects a main path. Keep the `@smoke` set near 12 tests |
| e2e test of other paths | No tag. It runs in the full e2e tier only |
| Visual look, layout ratio, grain, tuning values | No new automated test |
| Frame rate | `perf` projects only. Never in the default run |

Each e2e test boots a page (about 14 s). Cost grows with the test count, not with test content.

## Current slow cases (20)

Threshold: 10 s or more in a parallel run on 2026-10-27. Together they were about two thirds of the old unit run time.

| File | Cases |
|---|---|
| `gen2.test.mjs` | B1 maze, every room reachable, giant hall walk, two L hall walks |
| `gen2-detour-walk.test.mjs` | Closed edge walk, thirty longest pairs |
| `gen2-connection-walk.test.mjs` | Every active connection walk |
| `gen2-link-distance-measure.test.mjs` | Thirty body walks, default corpus stretch |
| `gen2-bridge-world.test.mjs` | Bridge search across eight seeds and four planning tiles |
| `gen2-bridge-walk.test.mjs` | Bidirectional physical bridge search |
| `gen2-s2-runtime.test.mjs` | Seed 42 atomic tile acceptance |
| `signs.test.mjs` | Sign count per room, new content |
| `mega.test.mjs` | H1, H4 entrances, H3 boards, K9 skylight |
| `levels.test.mjs` | M7 slides |

A skipped slow case shows in the run summary as `skipped 20`. That count must stay equal to this table. A different number means the table or the markers are wrong.

## Current `@smoke` set (12)

`game.spec.js`: A1, A2, A7, A10, merged `dist/index.html`.
`levels.spec.js`: long stairs.
`gen2.spec.js`: v2 boot, stairs up, save and continue, cluster distance passage.
`save-recovery.spec.js`: lost position with a known landmark.
`touch.spec.js`: touch input.

## Not in the fast tier

| Kind | Tests |
|---|---|
| Visual and view-ray checks | `ui-ratio`, `batch5` (M2), `batch6` B6-1 to B6-5, `levels` C8 grain |
| Slow walks | `gen2` hall, L hall, connector, folded-stair walks |
| Other full-suite tests | Everything else without `@smoke` |
| Frame rate | `perf.spec.js`, `perf-igpu.spec.js` |

The frame-rate floor of 50 fps still applies at delivery. Run the performance tier then.
