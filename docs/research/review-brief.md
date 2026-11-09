# Review brief: research summary and where to look

Date: 2026-11-10. Use: input for direction reviews (Fable, ChatGPT). This file is a summary. The linked files are the evidence. When a number matters, read the source file.

## 1 Research findings (short)

| # | Finding | Source |
|---|---|---|
| R1 | The first complaint in every sample and language is "thin, walking only" (31–38 % of 147 coded reviews). Pure walking with nice visuals is no longer enough. | `c2-player-voice.md` 2.5, 5 P2; `c6-voice-retally.md` 3 |
| R2 | Unhappy players of solo walkers leave fast: median 1.3 h, 61–67 % under 2 h (the Steam refund window). The first minutes decide. | `c2-player-voice.md` 2.6; `c6-voice-retally.md` 3 |
| R3 | "No monsters, no jumpscares" is a selling point. Players punish games that break it. | `c2-player-voice.md` 5 P1; `c5-failures-and-devs.md` 2.1 |
| R4 | Second and third complaints: performance and bugs (24–27 %), missing options and comfort (18–24 %; Chinese reviews 31–38 %). | `c6-voice-retally.md` 3 |
| R5 | Density matters more than hours. Price per hour predicts score (rho −0.49). 1–3 USD per hour keeps 83–95 %. | `c4-price-and-trends.md` 4; `c2-player-voice.md` 5 P3 |
| R6 | Reach comes from co-op, or from a rule that players can explain in one line and that spreads on streams (The Exit 8). Solo atmosphere walkers stay at 100k–300k owners. High scores without a hook give low reach. | `c1-success-data.md` 4 F1, F3; `c2-player-voice.md` 5 P4, P11 |
| R7 | Long life comes from secrets, replay routes, new content or fan creation, not from the first run. | `c2-player-voice.md` 5 P13; `c1-success-data.md` 4 F7 |
| R8 | Core fans have genre fatigue. Their second question about a new game is "what makes it different?". | `c2-player-voice.md` 5 P10, P12 |
| R9 | Projects stop when the team cannot maintain them. Successful solo routes keep scope small and the player action easy to explain. | `c5-failures-and-devs.md` 1.1, 2.1, 2.2 |
| R10 | Procedural levels that players praise mix generation with hand-made parts (Dead Cells: graph + room templates; Spelunky: guaranteed path + templates). Pure noise is endless but has weak structure. BSP gives box-like rooms. | `b2-systems.md` 1 |
| R11 | Pool and backrooms spaces have a large audience outside Steam (Roblox Backrooms 208.6M visits; calm Poolrooms HD 8.3M). Visits are events, not buyers. | `c3-web-and-platforms.md` 5 |
| R12 | Hidden AI content drives top negatives. Disclose AI use. | `c2-player-voice.md` 5 P9; `c6-voice-retally.md` 3 |

Limits: manual tallies (±2 counts); language strata of 12–18 reviews (about ±25 points); case reports do not prove cause. See the "Limits" or "Not found" section of each file.

## 2 Project state

| Item | State | Where |
|---|---|---|
| v1 | live, playable start to end | `README.md`; `docs/submission.md` |
| v3 P0 build routes, P1 data contract | done; P1 frozen (tag `p1`) | `docs/decisions/2026-11-05-v3-p0-acceptance.md`; `docs/decisions/2026-11-06-v3-p1-*.md` |
| v3 P2 room generator | planning; the user has not accepted a plan | `docs/decisions/2026-11-07-v3-p2-room-generator-gate.md` (read first) |
| Only hard limit | the game builds into one HTML file | `docs/decisions/2026-11-09-drop-fps-and-assignment-limits.md` |
| Course proposal | submitted; v3 generator is the final goal | `docs/final-proposal/proposal.md` |

## 3 Where to look

| Topic | Files |
|---|---|
| P2 rules G-01..G-10, scope S1–S3, void items | `docs/decisions/2026-11-07-v3-p2-room-generator-gate.md` |
| User sketch of the wanted structure | `work/c2c_user_sketch.jpg` (local only, git-ignored) |
| Void P2 plan (do not reuse; shows what was rejected) | `work/c2c_p2plan-rev1.md` (local only) |
| P1 world contract (`queryWorld`, `generate`, `maxSpaceExtent` 64 m) | `js/v3/core/world.js:264-356` |
| P2 later acceptance bar | `docs/handoff/v3-acceptance-02-early-phases-2026-11-05.md` section 4 |
| Earlier generator attempts (v1, v2) and lessons | `docs/decisions/2026-10-19-continuous-regions.md`, `2026-10-31-s3-2-rect-rooms.md`, `2026-10-31-s3-subdivision-planner.md`, `2026-10-28-s2-*.md`; `docs/handoff/T2..T6*.md` |
| User interviews on space and scenes | `docs/handoff/space-interview-answers-2026-11-05.md`, `space-round2-answers-2026-11-05.md`, `scene-interview-answers-2026-11-05.md`, `original-expectations-2026-10-17.md` |
| v3 phase plan and mainline | `docs/decisions/2026-11-05-v3-phase-structure-and-mainline.md`; `docs/handoff/staged-delivery-2026-11-05.md` |
| Open work and baseline | `ROADMAP.md` (〈待辦項目〉, 〈基線〉) |
| Research catalogue of 96 works | `docs/research/a-*.md`; method `docs/research/00-spec.md` |
| General success principles | `docs/research/b1-principles.md` |
| Systems cases (lighting, water, audio, movement, storytelling, replay) | `docs/research/b2-systems.md` 2–8 |
