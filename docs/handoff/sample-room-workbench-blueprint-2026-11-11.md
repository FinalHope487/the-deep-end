# Blueprint: sample-room workbench

Date: 2026-11-11. Author: Fable (reads, judges, writes blueprints; writes no code). Status: PROPOSED.

## 0. Before any build

| Blocker | Who decides | State |
|---|---|---|
| `docs/decisions/2026-11-07-v3-p2-room-generator-gate.md` section 2 and section 7.4 exclude atmosphere and water and permit no code before a plan is accepted. This blueprint needs light, water and code. | User | DONE 2026-11-11. See `docs/decisions/2026-11-11-sample-room-track-replaces-p2-gate.md`. |
| Which agent builds, and its quota | User | OPEN. |
| "The game builds into one HTML" applies to the game, not to this tool | User | ASSUMED by Fable. Confirm. |

## 1. Goal (user words)

> 我說的求的是上限 原本只為了保下限 先深入討論樣板房 能不能建立一個可以方便製作大量樣板房的介面 降低迭代成本

User answers: agents make the rooms and the user picks; a sample room is a test ground for the picture target; shape, light, water and material must all vary. Benchmark: the 21 pictures in `pictures/`.

Result wanted: the user sees many rendered rooms beside the reference pictures, picks, and gives short feedback. One new room costs one small text file.

## 2. Not in scope

- The layout generator, P1 contract, save, audio, UI, journey, packaging.
- Any edit to `js/`, `js/v3/`, `index.html`, `versions/`, `tests/`, `package.json` scripts, CI.
- New dependencies. Use `tools/vendor/three-0.170.0.module.min.js` and the Playwright that is installed.
- Reuse of sample-room data in the game. It is possible later. Do not design for it now.

## 3. Roles

| Role | Does | Does not |
|---|---|---|
| User | Picks, rejects, gives one-line feedback, walks in rooms | Read code |
| Fable | Writes briefs, checks evidence, re-runs commands, compares pictures | Write code |
| Kit builder (strong model) | Workbench and kit code | Add room-specific code |
| Room author (cheap model) | Room files and preset files only | Touch any `.js` or `.html` |

## 4. Files

All new files go in `workbench/`. Nothing else changes, except one `.gitignore` line for `workbench/out/`.

| Path | Content | Type |
|---|---|---|
| `workbench/index.html`, `workbench/js/*.js` | Viewer: reads data, builds the mesh, renders, first-person walk | Code |
| `workbench/js/kit/*.js` | One file for each kit capability (section 7) | Code |
| `workbench/rooms/<id>.room.txt` | One room (section 5) | Data |
| `workbench/looks/light/<id>.json`, `looks/water/<id>.json`, `looks/material/<id>.json` | Presets (section 6) | Data |
| `workbench/sheets/<id>.json` | List of combinations to render | Data |
| `workbench/shots.mjs` | One command: renders a sheet to `workbench/out/` | Code |
| `workbench/out/` | Pictures and contact sheets. Git-ignored. | Output |
| `workbench/feedback/<sheet>-<date>.json` | User picks and notes | Data |

## 5. Room file

A room is text. A header, then one or more character grids. One character is 1 m (the header can change the unit).

```
id: sunset-doors
ref: pictures/pool15.jpg
unit: 1.0
ceiling: 4.0
water-level: 0.3
source: sun dir=-0.6,-0.5,0.4
source: opening wall=E from=2 to=6 sill=0 head=3.5
camera: main pos=2.5,1.6,7.5 look=8,1.4,3

plan:
##########
#........#
#..##....=
#..##....=
#........#
##########

floor:
0000000000
0111111110
...
```

Rules for the format:

1. Start with these symbols only: `#` wall, `.` floor, `=` opening to outside, digits in the `floor` grid for floor height steps.
2. Add a symbol or a header key only when a named reference picture cannot be made without it. Write the picture name in the commit message.
3. A light is declared as a `source` (sun, opening, skylight, lamp panel). There is no key that sets the brightness or colour of a surface.
4. Each `camera` line is written before the first render of that room. A changed camera line needs a reason in the commit message.
5. A room file has no reference to code, and code has no reference to a room id.

## 6. Presets

Three preset kinds. Each is a small JSON file of numbers and names. Any room renders with any light, water and material preset.

| Kind | Holds (examples) |
|---|---|
| light | sun colour and strength, sky colour, ambient level, exposure, fog colour and density, shadow softness |
| water | tint, clarity by depth, reflection strength, ripple size and speed, caustic strength |
| material | tile size, grout width and colour, tile colour set, gloss, edge fillet radius |

A room `source` line gives position and direction. A light preset gives colour and strength. If a preset cannot be applied to a room, the viewer shows an error. It does not skip silently.

## 7. Kit capabilities and order

Classified by Fable from all 21 pictures (there is no `pool17`; `ppool12` is a separate picture).

| # | Capability | Pictures that need it | Count |
|---|---|---|---|
| K1 | Tile material: grout grid, gloss, tile size from preset | all | 21 |
| K2 | Water: reflection, see-through to the tiled floor, ripples | all but 16 (flat tint), 18 | 19 |
| K3 | Sun or large opening with shadows and light patches | 1, 3, 4, 10, 13, 15, 16, 19 | 8 |
| K4 | Bright panels and windows that glow and reflect in water | 2, 5, 6, ppool12, 13, 18, 20, 21 | 8 |
| K5 | Soft indirect light (dark corners, light bounce colour) | 1, 3, 4, 8, 9, 13, 15, 16 | 8 |
| K6 | Depth tint and dark deep water | 5, 9, 11, 13, ppool12, 21 | 6 |
| K7 | Fog, darkness, distance falloff | 2, 9, 12, 21 | 4 |
| K8 | Round columns and cylinders | 3, 8, 16 | 3 |
| K9 | Arches | 3, 12, 19 | 3 |
| K10 | Fillets and curved pool edges on a rectilinear plan | 1, 14 | 2 |
| K11 | Caustics on walls and floor | 6, 8, 20 | 3 |
| K12 | Props: railings, stairs, ladders, plants, floats | 2, 3, 5, 6, 11, 13, 16, 19, 20, 21 | 10 |
| OUT | Free-form curved surfaces (not a rectilinear plan with fillets) | 7, 10 | 2 |

`OUT` pictures are not targets. The user decides later if they get their own kit.

Build order: K1, K3, K5, K2 (milestone M1), then K4, K6, K7 (M3), then K10, K8, K9 (M4). K11 and K12 only when the user asks.

## 8. Milestones

One milestone is one delegation. Do not start the next before the user sees the result.

| M | Deliverable | Target picture | Done when |
|---|---|---|---|
| M1 | Viewer, room parser, K1, K3, K5, K2, `shots.mjs` for one combination. One room, one preset of each kind. Output: one picture with the render on the left and the reference on the right, from the fixed camera. First-person walk works. | `pool15.jpg` (rectilinear, warm sun, shallow water) | The user looks at the pair and says what is missing. No pass mark. |
| M2 | Sheets: `shots.mjs` renders rooms x lights x waters x materials into one contact-sheet page with keep/drop buttons and a note field that exports the feedback JSON. Room authors add 6 rooms and 3 presets of each kind. No kit change. | same | The user picks from one sheet in under 5 minutes. |
| M3 | K4, K6, K7 | `ppool12.jpg` (dark hall, bright windows on water) | As M1. |
| M4 | K10, K8, K9 | `pool14.jpg`, then `pool19.jpg` | As M1. |
| M5 | Room authors make rooms in volume. Kit changes only on user feedback. | user picks | The user names 3 looks to keep. |

M1 is the only milestone that is certain. The user's M1 feedback can reorder or replace M2 to M5.

## 9. Hard rules for builders

| ID | Rule | How Fable checks |
|---|---|---|
| W-01 | Rooms and presets are data only. | `git diff --stat`: a room-author commit touches only `workbench/rooms`, `looks`, `sheets`. |
| W-02 | No branch in code on a room id, preset id or file name. | `grep` for every id in `workbench/js` gives no match. |
| W-03 | Light comes only from declared sources and the light preset. No per-room fix. | Read the parser key list; render room A with room B's presets. |
| W-04 | Every output picture is made by `node workbench/shots.mjs <sheet>`. No hand-edited or separately captured picture. | Fable re-runs the command and compares. |
| W-05 | Each output carries the commit hash, time, room id and the three preset ids, burnt into the picture. | Look at the picture. |
| W-06 | The camera comes from the room file. | W-04 re-run. |
| W-07 | The run prints frame time (mean, p99) for each combination. Record it. There is no limit. | Read the run log. |
| W-08 | No new automated test (prototype scope, `AGENTS.md` test table). Game files are not touched, so game tests are not run. | `git diff --stat` shows `workbench/` and `.gitignore` only. |

## 10. Stop and report (do not improvise)

Stop, change nothing more, and report to Fable when:

- A target needs a capability that is not in this milestone.
- The format cannot express the target room without a new symbol or key.
- A capability needs a new dependency, a build step, or an edit outside `workbench/`.
- Mean frame time is above 33 ms on the build machine with all milestone capabilities on.
- The render and the reference still differ in a way you cannot name.

Report format: `Done / Not done / Boundary conflicts`, plus the exact command, the commit hash, and the output paths.

## 11. Delegation brief template (five fields from `AGENTS.md`)

| Field | M1 text |
|---|---|
| Goal | "先深入討論樣板房 能不能建立一個可以方便製作大量樣板房的介面 降低迭代成本". Deliver M1 of this blueprint. |
| May edit | `workbench/**`; one line in `.gitignore` for `workbench/out/` |
| Must not touch | `js/**`, `index.html`, `versions/**`, `tests/**`, `tools/**` (read `tools/vendor` only), `package.json`, `.github/**`, `AGENTS.md`, `CLAUDE.md`, `claude-decisions.json`, `docs/**`; no `npm install`; no push |
| Acceptance | Rules W-01 to W-08; `node workbench/shots.mjs` makes the M1 pair; exploration scope, no new tests, existing tests stay untouched |
| Report | `Done / Not done / Boundary conflicts` |

## 12. Unknowns

| Unknown | When it is known | If the answer is bad |
|---|---|---|
| How near a browser render gets to the reference pictures | End of M1 | The user chooses: lower the target, or accept baked light that costs load time |
| Frame time with shadows, reflection and see-through water together | M1 log (W-07) | Drop one feature for each preset; planar reflection is the first candidate |
| A hand-tuned room that looks good does not prove that generated rooms look good | Not known in this blueprint | Later work must test the kit on generator output before the look is called final |
| Rounded and arched forms on a 1 m grid | M4 | Smaller unit for those rooms, or mark more pictures `OUT` |
| The tool grows into the project | Each milestone | Stop at the M1 pair if the user does not see progress |

## 13. When the user may want to reverse this

- M1 shows that the gap to the pictures is mostly light quality that a browser cannot give in real time.
- The user finds that picking pictures does not tell them what the game should be (the layout question stays open and this track does not answer it).
- The workbench takes more than two milestones before the user sees a room they like.

Reverse cost: delete `workbench/` and the `.gitignore` line. No game file depends on it.
