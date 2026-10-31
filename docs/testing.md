# Test policy and tiers

`AGENTS.md` points to this file for test rules.

This file defines necessary tests, test scope, and test tiers.

## Necessary test rule

A necessary test protects a game invariant or a required function. If the invariant fails, the game can become unusable, the world can become invalid, a required route can break, or saved progress can become invalid.

Test the result that the player or the game uses. Do not lock a test to an internal algorithm, a random draw count, or an exact generated template when the same valid result can come from a different method.

Use one boundary-focused fast test for each invariant family. Add one multi-seed slow corpus only when one case cannot give enough coverage. Use a browser test when the invariant needs the real browser, input, build output, or worker.

Do not remove an invariant test until another test protects the same invariant.

## Necessary invariant scope

Each ID is a separate test responsibility. One test can check more than one ID. One ID can cover both generators if the test verifies both implementations.

| ID | Required invariant | Main tier |
|---|---|---|
| N01 | Valid worlds generate without an unhandled error. | Fast unit |
| N02 | Generated geometry and state contain finite, valid values. | Fast unit |
| N03 | The same seed and options give the same world. Query order and cache state do not change it. | Fast unit; slow corpus |
| N04 | Rooms, floors, openings, and passages join correctly across cell borders. | Fast unit; slow corpus |
| N05 | Optional features do not damage the base world or unrelated features. Failure keeps a valid world. | Fast unit |
| N06 | Generation and loading finish within a bounded time and resource budget. | Fast unit; slow corpus |
| N07 | The spawn point is safe, has a floor, and has a route out. | Fast unit; smoke e2e |
| N08 | Each room that the player can enter is reachable and has a return route. Sealed display rooms are excluded. | Slow unit |
| N09 | Required stairs and ladders work in both directions. One-way routes have a safe exit. | Fast unit; slow unit |
| N10 | Closed links and changed routes do not isolate required parts of the world. Physical paths must match the graph. | Fast unit; slow unit |
| N11 | Each accepted S2 bridge has valid entrances, exits, floors, and a usable physical path. | Fast unit; slow unit |
| N12 | S3 rooms have valid floor ownership, walls, doorways, and access. | Fast unit; slow unit |
| N13 | Collision floor heights agree with the floor mesh. | Fast unit |
| N14 | The player cannot cross a solid wall, column, rail, or closed door. | Fast unit |
| N15 | Steps, ceilings, platforms, and slabs give the player valid body clearance. | Fast unit |
| N16 | Shallow water is walkable, unsafe deep water blocks walking, and a wading route has a safe exit. | Fast unit; slow unit |
| N17 | Required floor, wall, stair, and opening mesh faces exist. They must not block a valid route. | Fast unit |
| N18 | Physics, mesh, and world measures agree on the geometry and water they describe. | Fast unit |
| N19 | The player can enter and leave each required movement state. The player must not stay stuck. | Fast unit; slow unit |
| N20 | Start, move, pause, resume, and required input methods work. | Smoke e2e |
| N21 | The released game can complete its required objectives and exit flow. This applies to v1 until v2 has that flow. | Fast unit; smoke e2e |
| N22 | Save and load preserve valid progress. Invalid positions recover without loss of valid progress. | Fast unit; smoke e2e |
| N23 | Workers and async loading do not activate a wrong seed, lose a required owner, or enable play before the world is ready. | Fast unit; desktop e2e |
| N24 | The source and release builds start and support the core game flow. | Fast unit; smoke e2e |
| N25 | A failed required operation has a defined recovery or error state. It must not leave the game in an endless wait. | Fast unit; desktop e2e |
| N26 | Long play, world loading, and path searches have bounded time and resource use. | Slow unit; desktop e2e |

The IDs describe behavior. They do not require 26 separate test files.

A test can use a fixed seed to reproduce a failure. The test must check the invariant, not only the exact result of that seed.

For v2 features that are not enabled by default, test the feature with its option enabled. Do not require unfinished features to work in the default game.

## Consolidation rule

1. Find the invariant that each existing test protects.
2. Keep one small fast test that reaches the important boundary of that invariant.
3. Merge duplicate checks into that test.
4. Use one slow corpus when the invariant depends on many seeds or a large physical route.
5. Keep a real browser test if a unit test cannot verify the complete path.
6. Remove a test that checks no necessary invariant.
7. Do not remove the last test for an invariant.
8. Check that each retained test can fail for the defect it protects.
9. Do not use the number of tests as proof of coverage.

When a test checks both a necessary invariant and other details, keep the necessary check. Remove unrelated assertions.

Use a fixed, small example for a fast test. Use a known failing case when one exists.

A corpus must include valid cases. It must fail if the corpus is empty or if no required route was checked.

Do not add a second corpus when an existing corpus can check the same invariant.

## Tiers

| Tier | Content | Command | Run time (measured 2026-10-27) |
|---|---|---|---|
| Fast (default) | Unit tests without slow cases, plus e2e tests tagged `@smoke` | `npm run test:fast` | Unit 83 s, smoke e2e 110 s |
| Full unit | All unit tests, slow cases included | `npm run test:unit:full` | 5.2 to 9.1 min |
| Full e2e | All desktop e2e tests | `npm run test:e2e:full` | About 13.5 min |
| Performance | A11 (`perf`), A11b (`perf-igpu`) | `npx playwright test --project=perf --no-deps` | Needs an idle machine |

These times are old measurements. Test consolidation can change them.

Single commands: `npm run test:unit`, `npm run test:e2e`.

`npm test` is the old entry point. It calls `playwright test` for all projects.

## When to run what

| Situation | Run |
|---|---|
| Before each commit and at round end | Fast tier |
| Change in `js/gen2*.js` | Fast tier, then related slow unit tests |
| Change in shared game modules | Fast tier, then full unit |
| Change in an invariant test | Its own test, then fast tier |
| Change in a browser entry path or worker | Fast tier, then related desktop e2e tests |
| Test consolidation batch | Fast tier, full unit, and full e2e |
| Delivery or user asks for acceptance | Full unit, full e2e, and required performance checks |
| A fast test fails | Fix the cause. Do not move the test to another tier. |

A green fast tier means the change is ready for a commit review. It does not mean that all slow and desktop tests passed.

Record the test commands and the real results in the task report. Write `not run` for a tier that did not run.

## Where a new test goes

| Test kind | Tier |
|---|---|
| Pure logic, valid geometry, input validation, save parsing, collision, and determinism | Fast unit |
| Small bug reproduction | Fast unit |
| A case that takes 10 s or more alone | Slow unit |
| A long walk or multi-seed corpus | Slow unit |
| Browser start, input, save and continue, or release build path | Smoke e2e if it protects a main path |
| Other required browser or worker path | Desktop e2e |
| Frame or resource performance | Performance tier |

Use `test('name', slow, fn)` for a slow Node test.

Import `slow` from `tests/unit/slow.mjs`.

Keep the `@smoke` set small. It must cover the main game paths.

Do not repeat a unit invariant in a browser test unless the browser can fail in a way that the unit test cannot detect.

Each e2e test starts a page. Keep the number of page starts low.

## Current slow cases (21)

This list reflects Batch 1 of the test consolidation.

| File | Cases |
|---|---|
| `gen2.test.mjs` | B1 maze, every room reachable, giant hall walk, two L hall walks |
| `gen2-detour-walk.test.mjs` | Closed edge walk, thirty longest pairs |
| `gen2-connection-walk.test.mjs` | Every active connection walk |
| `gen2-link-distance-measure.test.mjs` | Thirty body walks, default corpus stretch |
| `gen2-bridge-world.test.mjs` | Bridge search across eight seeds and four planning tiles |
| `gen2-bridge-walk.test.mjs` | Bidirectional physical bridge search |
| `gen2-s2-runtime.test.mjs` | Seed 42 atomic tile acceptance, second tile with soft reservations |
| `gen2-s3-plan.test.mjs` | Eight-seed subdivision corpus |
| `gen2-s3-mesh.test.mjs` | S2 bridges with S3 enabled |
| `mega.test.mjs` | H1, H4 entrances, H3 boards, K9 skylight |
| `levels.test.mjs` | M7 slides |

A default unit run must report 21 skipped slow cases.

The full unit run must execute these cases.

If the count changes, update this table and explain the change.

## Current `@smoke` set (12)

| File | Cases |
|---|---|
| `game.spec.js` | A1, A2, A7, A10, merged `dist/index.html` |
| `levels.spec.js` | Long stairs |
| `gen2.spec.js` | v2 boot, stairs up, save and continue, cluster distance passage |
| `save-recovery.spec.js` | Lost position with a known landmark |
| `touch.spec.js` | Touch input |

A smoke test must check a complete required browser action.

## Not in the fast tier

| Kind | Tests |
|---|---|
| Untagged desktop tests | Other tests in `tests/e2e/*.spec.js`, except performance projects |
| Slow walks | Corpus and long body-path tests marked with `slow` |
| Full unit | All Node tests with the slow marker enabled |
| Frame and resource checks | `perf.spec.js`, `perf-igpu.spec.js` |

The performance checks are separate from the default test run.

## Consolidation acceptance

For each batch:

1. Confirm the list of files changed.
2. Confirm the test titles removed or merged.
3. Confirm that each necessary invariant still has a test.
4. Run the tests for the changed files.
5. Run `npm run test:fast`.
6. Run `npm run test:unit:full`.
7. Run `npm run test:e2e:full`.
8. Record the number of tests before and after the batch.
9. Do not commit a batch with a failed required test.

Do not add a new test only to restore an old test count.

Do not change production code as part of test consolidation unless the user gives separate approval.
