# The Deep End — Staged Delivery Specification

Status: proposed baseline. Freeze it when the user approves it (Section 8).
Date: 2026-11-05. Draft by ChatGPT (task `c2c_e5f2`, read-only). Edited and checked by Claude.
This file is a plan. It does not change the game. It does not replace `docs/spec.md`.

## 1. Goal and authority

Deliver one complete v2 game that meets the user's confirmed player experience:

- A continuous poolcore world that expands as the player explores.
- Four main regions and a bright exit. A typical main line takes 15–25 minutes. The cap is 30 minutes.
- Photographs give reusable visual traits. The game must not show a fixed list of complete photograph scenes.
- The mood starts calm and turns oppressive through light, sound, fog and space. Short-term effects from staying still are reversible.
- The release needs at least 85 of 100 weighted outcome points AND all mandatory gates.

Source order (higher wins):

1. `docs/handoff/scene-interview-amendments-2026-11-05.md`
2. `docs/handoff/scene-interview-answers-2026-11-05.md`
3. `docs/decisions/2026-11-05-interview-d1-d3.md`
4. `docs/spec.md`, then other `docs/decisions/*`, `ROADMAP.md`, the code

Never edit sources 1 and 2. `interview-vs-spec-conflicts-2026-11-05.md` is a difference list, not a source of decisions.

Current state: v1 is the default (4 regions, items, figure, exit, ending). v2 (`?gen=v2`) has big spaces, floors, water rooms and S2 bridges, but no regions, no exit, no figure, and a long cold start. S3 rectangular rooms exist but are off by default. The photograph-scene system does not exist. Do not report a missing feature as a regression.

## 2. Mandatory release gates (no points; all must pass)

| Gate | Requirement | Evidence |
|---|---|---|
| H1 | v2 has four regions, exit, progress, save recovery and ending | real-browser end-to-end test |
| H2 | typical main line 15–25 min; reference runs never above 30 min | timed full-route report |
| H3 | 60 fps target, 50 fps floor; at most 2% of frames above 40 ms | performance test and real device |
| H4 | cold start within the limit set in S1 | cold-start measurement |
| H5 | player cannot enter unsafe or unverified geometry | collision, traversal and Worker tests |
| H6 | same seed gives the same world, in any cell load order | multi-seed comparison |
| H7 | valid saves stay readable; no progress loss | save and recovery tests |
| H8 | v1 stays available until v2 passes parity | release check |
| H9 | pool12 stays excluded; no chase, jump scare or combat | scene audit |
| H10 | at least 85 weighted points pass | signed coverage report |
| H11 | static site opens; touch and keyboard/mouse work | release build in a real browser |

Keep the 50 fps rule of `docs/decisions/2026-10-19-fps-floor-50.md`. A desktop average alone does not pass H3.

## 3. Coverage matrix (100 points)

A check earns its full weight only with saved evidence (test output, or screenshot/capture plus review). Failed or blocked = 0. No partial credit. A design document alone is not evidence. Amendment 1 replaces answer A5.

### 3.1 Photographs — 2 points each (32)

| ID | Answer | Stage | Check |
|---|---|---|---|
| P01 | pool1/14: full shallow flood; raised dry platform | S4 | both room types; platform stays dry |
| P02 | pool2/16: last stair steps under water | S4 | straight and turning stair, lower steps submerged |
| P03 | pool3/7: round ceiling opening, three variants | S5 | upper architecture, open sky, dark above; no "light only" for stairs |
| P04 | pool4: one-side strip walkway | S5 | open hall, upper walkway, visible underside |
| P05 | pool5: railed dry high walk over closed deep pool | S5 | vertical drop, railing, deep boundary |
| P06 | pool6: variable parallel long pools | S5 | different counts and lengths; cut and continued |
| P07 | pool8: dark drain in solid wall | S5 | blind drain, not a passage |
| P08 | pool9/15: rooms share one water level | S4 | one plane through several doors |
| P09 | pool10: dark niches, solid back wall | S5 | player cannot enter |
| P10 | pool11: narrow stair along well wall | S5 | winding wall stair, no ladder |
| P11 | pool12: paused | S4 | no active scene uses it |
| P12 | pool13: separate small shallow pool behind main pool | S5 | two distinct pools |
| P13 | pool18/19: straight edges | S5 | straight geometry; curve only in reflection |
| P14 | pool20: rectangular pool, ladder, square pillars, next pool room | S4 | all traits and the view through the door |
| P15 | pool21: very shallow part of the same pool | S4 | one pool, one water level |
| P16 | ppool12: deep flood over lower windows and steps | S5 | water over lower half of windows |

### 3.2 Journey rhythm — 3 points each (12)

| ID | Answer | Stage | Check |
|---|---|---|---|
| R01 | first 5 min bright, readable pools and colonnades | S4 | review first 5 min of reference runs |
| R02 | middle: stairs into water, stacked levels | S4 | review middle route |
| R03 | photographs are traits, not a fixed list | S4 | compare seeds; no fixed photo sequence |
| R04 | late game changes by light and mood | S3 | same space early versus late |

### 3.3 Scene mix — 3 points each (24)

| ID | Answer | Stage | Check |
|---|---|---|---|
| A01 | common traits combine at random | S4 | several combinations across seeds |
| A02 | wonders occasional; may be on the required route | S5 | count wonders in full runs; required-route examples |
| A03 | long pools and colonnades vary in length and layout | S5 | short, long, interrupted, continued |
| A04 | dark spaces can have sunlight | S5 | dark deep-water space with daylight source |
| A05 | regular long corridors and colonnades must exist | S5 | long regular examples, and ordinary rooms with the same elements |
| A06 | shared water with high platforms and shallow floors | S4 | common water height; local floor changes |
| A07 | bright-to-deep transitions by door, corner or narrow passage | S4 | walk each type, safe geometry |
| A08 | one or two traits lead; rest simple | S4 | varied room set; reject crowded repeats |

### 3.4 Whole-journey feel — 2 points each (24)

| ID | Answer | Stage | Check |
|---|---|---|---|
| B01 | bright start, darker later, some bright rooms remain | S3 | early, middle, late, late-bright captures |
| B02 | white/blue/green to cold grey-blue/teal | S3 | colour samples across progress |
| B03 | long early view, short late view, floor stays readable | S3 | fog and near-floor check |
| B04 | only some lamps weak or flicker | S3 | independent lamps, most stable |
| B05 | water sound to low distant sound; some metal noise | S6 | early versus late audio capture |
| B06 | faint directional music, louder near, fades away | S6 | walk toward and away |
| B07 | hall, corridor, deep-water room sound different | S6 | long echo, close sound, low hollow sound |
| B08 | no early figure; occasional middle and late | S3 | long early stay; later regions |
| B09 | mixed scale; more extreme late | S5 | room height, length, width by stage |
| B10 | occasional empty spaces | S4 | spaces with no dominant feature |
| B11 | lingering anomaly grows, then recovers; progress unchanged | S3 | hold, move, compare long-term and short-term state |
| B12 | bright exit gives relief, world stays mysterious | S3 | final approach and end screen |

### 3.5 Decisions

| ID | Weight | Decision | Stage | Check |
|---|---|---|---|---|
| D01 | 3 | staged descending bands | S3 | floor, early entry, fast transition, monotone |
| D02 | 3 | v2 is the main line; v1 default until parity | S2 | four regions and exit in v2; v1 still default |
| D03 | 2 | about one or two wonders per 15–25 min run | S5 | count on timed routes |

### 3.6 Points by stage (cumulative; computed by Claude)

| Stage | New points | Cumulative |
|---|---|---|
| S1 | 0 (gates only) | 0 |
| S2 | 3 (D02) | 3 |
| S3 | 20 (R04, B01–B04, B08, B11, B12, D01) | 23 |
| S4 | 35 (P01, P02, P08, P11, P14, P15, R01–R03, A01, A06–A08, B10) | 58 |
| S5 | 36 (P03–P07, P09, P10, P12, P13, P16, A02–A05, B09, D03) | 94 |
| S6 | 6 (B05–B07) | 100 |

The 85-point line is crossed at the end of S5. If S6 slips, S5 still gives 94, so the audio stage is the only one that can be cut without failing H10. Gates still apply.

Record per check: ID, weight, stage, pass/fail/blocked, command or review method, seed and route, evidence location, reviewer, commit. At final review publish: Passed / Failed / Blocked / Total points.

## 4. Delivery contract

- Freeze the goal, stage order, weights and gates when the user approves this file. After that change them only by a new user request, recorded in a new decision file. A new request never enters an active stage.
- A safety defect or hard conflict stops only the affected work.
- A stage is complete only when: its checks pass in the real game; resident tests pass; relevant one-time acceptance tests pass; the previous stage still works; rollback is possible; the report has real results; changed visuals have a screenshot or capture. Unit tests alone never complete a stage.
- Keep unfinished work disabled. v2 is not the default before S7.
- Tests: follow `docs/testing.md`. Run `npm run test:fast` before each commit. Use temporary acceptance tests inside a stage. Use a real v2 browser test when a stage changes loading, Workers, movement, saving or release output. Do not raise timeouts to hide a speed failure.
- Isolation: preview with `?gen=v2`. Do not change v1 geometry, progress or flow. Keep saves readable; ask the user before any save-breaking change. Do not overwrite `dist/index.html` during acceptance tests.
- Stage report fields: Stage, Baseline commit, Files, Tests (command, result, time), Browser (source/release, seed, capture), Performance, Coverage (new check IDs, total), Open faults, Rollback, Decision changes, Status.

## 5. Stages

Order: S1 → S2 → S3 → S4 → S5 → S6 → S7. Do not start a stage before the previous acceptance is done. A stage may have several small commits; each commit needs green relevant checks.

### S1 — Safe v2 start and free exploration

- Dependencies: none.
- Work: keep v2 geometry and S2 physical rules. Measure cold start and first playable frame. Keep unverified borders closed. Publish a bridge only after full verification. Recover from a failed Worker. Keep saves valid near a finished bridge. Change the loading boundary only if the measured start is above the H4 limit (default in Section 7).
- Files: `js/main.js`, `js/gen2-s2-client.js`, `js/gen2-s2-worker.js`, `js/gen2-s2-runtime.js`, `js/cells2.js`, `js/gen2.js`, `js/gen2-bridge-world.js`.
- Acceptance: start v2 in a real browser; walk from the start without entering unverified space; finish a neighbour S2 result while the player moves; fixed seed 42 bridge cases; reload near a finished bridge; inject a Worker failure; measure start and movement.
- Result: safe v2 free-exploration preview.
- Rollback: revert S1 commits; v1 untouched.
- Limit: do not change S2 geometry acceptance while changing startup.

### S2 — Main-line flow in v2

- Dependencies: S1.
- Work: four regions with a route across floors; reachable bright exit after four regions; exploration progress and 12 finds; region entry, signs, guides and HUD; save, Continue, ending without seed; keep the player in verified geometry.
- Files: `js/gen2.js`, `js/main.js`, `js/items.js`, `js/guides.js`, `js/ui.js`, `js/save.js`, `js/gen2-measure.js`, a new v2 objective module if needed; `js/world.js` as reference only.
- Acceptance: finish four regions in order; names and progress correct; finds only at valid distance and floor; exit unlocks; end screen shows no seed; save and restore at each region; no blocked passage; timed full route on reference seeds.
- Covers: D02.
- Result: complete v2 main line, current visual style.
- Rollback: revert S2 modules; return to S1.
- Limit: keep the objective route apart from room detail; no objective depends on one decorative placement.

### S3 — Staged atmosphere, figure and ending mood

- Dependencies: S2.
- Work: replace the time floor with descending bands (Section 7, Q1–Q2). Value never rises. Add a separate lingering anomaly layer (grows while still, fades after moving, never changes the band value). Bright to cold colour. Keep some bright late rooms. Fog tighter but near floor clear. Independent lamp states. Figure only from region 3 on. Exit relief.
- Files: `js/atmosphere.js`, `js/main.js`, `js/presence.js`, `js/audio.js`, `js/lighting.js`, `js/mesh2.js`, `js/save.js` (state recovery only), a new pure atmosphere-state module if needed, `docs/spec.md`.
- Acceptance: unit-test each band ceiling and floor; early entry gives a fast move to the next ceiling; value never increases; stay still then move (anomaly up, then down, band value unchanged); reload mid-band follows the rule; no early figure even after a long stay; screenshots for early, middle, late, late-bright, exit.
- Covers: R04, B01–B04, B08, B11, B12, D01.
- Rollback: restore the S2 atmosphere path.
- Limit: three separate states — long-term value, temporary anomaly, local lamp state. Never one number for all three.

### S4 — Common water rooms and natural combinations

- Dependencies: S3.
- Work: shallow water, tiled pillars, dry platforms and pool-room doors combine; stairs end in water; connected rooms share one water level; shallow floors and dry platforms; rectangular pool with ladder and square pillars; pool21 shallow step; clear bright-to-deep transitions; some empty rooms; one or two lead traits per building. No fixed photograph list. pool12 stays off.
- Files: `js/gen2.js`, `js/mesh2.js`, `js/gen2-s3-plan.js`, `js/gen2-s3-rect.js` (if needed), `js/gen2-measure.js`, `js/player.js` (collision fixes only), new water and trait modules, `docs/spec.md`.
- Acceptance: different combinations per seed; same seed same combination; both submerged stair forms; water across several rooms; walk a shallow/deep transition; platform and floor heights; collision equals drawn geometry; first-5-minute and middle review; pool12 inactive; review for repeats and clutter.
- Covers: P01, P02, P08, P11, P14, P15, R01–R03, A01, A06–A08, B10.
- Rollback: revert S4 traits; keep S3.
- Limit: one shared source for water, floor, drawing and collision. No visual pool or platform without a matching physical state.

### S5 — Special architecture and wonders

- Dependencies: S4.
- Work: three ceiling-opening views; spiral stairs, side strip walkways, deep wells, wall stairs; railed high walks over deep pools; variable parallel pools and colonnades; regular long corridors and colonnades; blind drains and niches; sunlit dark spaces; pool13 rear pool; straight long pools; ppool12 high flood hall; wonders on some required routes, about one or two per main-line run; more extreme scale late; ordinary space between big events.
- Files: `js/gen2.js`, `js/mesh2.js`, `js/gen2-measure.js`, `js/gen2-s3-plan.js`, `js/gen2-s3-rect.js`, `js/gen2-bridge-world.js` (route protection), new architecture modules, `docs/spec.md`.
- Acceptance: verify every Covers ID below; blind openings are never passages; all open passages safe; pool edges straight; sunlight reaches a dark scene; wonder count on timed routes follows Section 7 Q5; wonders never block the four regions.
- Covers: P03–P07, P09, P10, P12, P13, P16, A02–A05, B09, D03.
- Rollback: disable or revert S5 additions; keep S4 and main line.
- Limit: each unusual feature is independent. Protect required routes. No building gets every feature.

### S6 — Sound and directional music

- Dependencies: S5.
- Work: water, footsteps and room sound stay the base; small machine/metal layer (new CC0 asset); sound follows long-term progress; faint intermittent music with a clear direction (louder near, fades away); hall long echo, corridor close, deep-water room low and hollow; lingering sounds apart from long-term progress; keep the mobile audio-unlock rule; credit new assets in README.
- Files: `js/audio.js`, `js/main.js`, `js/atmosphere.js`, new audio assets, `docs/spec.md`, `README.md`.
- Acceptance: record three room types; walk toward and away from music; music can fade to silence and is not constant; early versus late sound; machine/metal layer present; sound recovers after moving; audio unlock on mobile; licence note for every asset.
- Covers: B05–B07.
- Rollback: revert the new mixing and assets.
- Limit: audio is never required for movement or objectives. Missing audio must not stop the game.

### S7 — Parity, performance, release

- Dependencies: S1–S6.
- Work: run every Section 3 check; full journey on reference seeds; record the score; check all gates; measure memory, frame time and cold start; touch and keyboard/mouse; save recovery; build in an isolated output directory and test the real files; compare v1 and v2 flow; prepare (do not deploy) the default switch.
- Acceptance: all gates pass; score at least 85 with evidence; no v1 regression; release build plays; main line completes; required routes reachable; real-device performance passes; user reviews the final visuals; user approves production deployment (Q9).
- Rollback: restore the v1 default and the previous release build; keep saves compatible.
- Limit: a high score never excuses a failed gate.

## 6. Fixed decisions (reopen only by a new user request)

| ID | Decision |
|---|---|
| F01 | Interview files are immutable; amendments win |
| F02 | v2 becomes the official main line |
| F03 | v1 stays default until parity |
| F04 | Main line 15–25 min; cap 30 min |
| F05 | 50 fps floor; 60 fps target |
| F06 | Long-term atmosphere uses descending region bands |
| F07 | Lingering never changes long-term value and must recover |
| F08 | About one or two wonders per main-line run |
| F09 | Photographs give traits, not a fixed scene order |
| F10 | Regular long corridors and colonnades must be possible |
| F11 | Adjacent rooms may share one water surface |
| F12 | pool12 inactive |
| F13 | pool11 is a narrow wall stair, no ladder |
| F14 | pool21 is one pool with a shallow section |
| F15 | No early figure |
| F16 | Ending gives relief and keeps mystery |
| F17 | No chase, jump scare, swimming or combat |
| F18 | Keep S2 atomic verification and physical safety checks |
| F19 | Keep the resident test policy (9 Node tests, 1 Chromium test) |

## 7. Defaults chosen by Claude (reversible; the user can change any of them)

ChatGPT listed these as open questions. They only change numbers or process, can be changed later, and carry no data loss. Under the project rules Claude picked defaults. Record any change in a new decision file.

| Q | Item | Default |
|---|---|---|
| Q1 | Band limits | Start area holds V = 1.0. Region ceilings 1.0, 0.75, 0.5, 0.25 for regions 1–4; final floor 0.0 |
| Q2 | Descent time and timer | 6 min per band to reach its floor. Timer starts on region entry and stops while paused. A reload restores the saved V and timer. A level jump sets V to the target region's ceiling and is not saved |
| Q3 | Exit relief | Relief changes only light and sound, never V. It starts when the exit door is within 40 m and in view, and ends at the result screen |
| Q4 | Startup | Keep the current rule (S2 plans finished before play). Change only if measured cold start exceeds 5 s on the target; then write a decision file for a safe local start with closed unverified borders. H4 limit: first playable frame in 5 s on 4G (the limit in `docs/spec.md`) |
| Q5 | Wonder count | Over 10 reference seeds: mean 1–2 per main-line run, no run above 3, at most 2 runs with zero |
| Q6 | "Regular" corridor | At least 4 equally spaced repeated elements (columns or lamps) along 20 m or more. No required maximum length |
| Q7 | Decorative versus required | A feature is a required passage only if it passes the walkability test. Blind drains, niches and decorative scenes never serve as required passages |
| Q8 | Poolcore phases C–E | Included in S4 and S5 by this plan. They are code work and can be reverted |

## 8. Open for the user

| Item | Why it is the user's | Blocks |
|---|---|---|
| Approve this file as the frozen baseline | Freezing stops later direction changes | start of S1 |
| Q9 — production switch to v2 | Deploy to production | S7 deployment only |

## 9. Risks and limits

| Risk | Stage | Limit |
|---|---|---|
| Slow S2 start | S1 | measure real start; keep verified geometry |
| Unverified border crossing | S1 | keep unsafe areas closed |
| Broken region route | S2 | test full routes with the real player |
| Save change | S2, S3 | keep published saves readable or ask the user |
| Atmosphere state conflict | S3 | separate long-term, temporary and local states |
| Global lamp flicker | S3 | per-lamp state; most lamps stable |
| Water collision mismatch | S4 | one source for water, floor, drawing, collision |
| Repeated identical scenes | S4, S5 | compare varied seeds |
| Fixed photograph tour | S4, S5 | build traits, not a tour |
| Wonder overload | S5 | measure on the main line |
| S2/S3 overlap damage | S5 | protect valid paths |
| Too many effects | S3–S6 | run the performance gate after relevant changes |
| Audio asset failure | S6 | game never depends on audio loading |
| No real-phone proof | S7 | no parity claim without a real-device result |
| Test suite growth | all | temporary acceptance tests only |
| Direction change | all | freeze before S1 |

## 10. Final acceptance

After S7 write a final report: approved spec version, final commit, H1–H11 results, every P/R/A/B/D result, score out of 100, timed route report, target-device performance, save results, screenshots, remaining differences, rollback record, the user's release decision.

- Pass: all gates pass and score is at least 85.
- Fail: a gate fails, or score is below 85.
- Never change the expected outcome to make a score pass. Never use points to cover a failed gate.
