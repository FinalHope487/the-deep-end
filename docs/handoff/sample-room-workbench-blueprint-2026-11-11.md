# Blueprint: sample-room workbench

Date: 2026-11-11. Author: Fable (reads, judges, writes blueprints; writes no code). Status: PROPOSED.

## 0. Before any build

| Blocker | Who decides | State |
|---|---|---|
| `docs/decisions/2026-11-07-v3-p2-room-generator-gate.md` section 2 and section 7.4 exclude atmosphere and water and permit no code before a plan is accepted. This blueprint needs light, water and code. | User | DONE 2026-11-11. See `docs/decisions/2026-11-11-sample-room-track-replaces-p2-gate.md`. |
| Which agent builds, and its quota | User | DONE 2026-11-11: "讓sonnet使用claude with chatgpt". A Sonnet agent builds; it uses the Claude-with-ChatGPT bridge for the plan and the review. |
| "The game builds into one HTML" applies to the game, not to this tool | User | DONE 2026-11-11: the limit does not apply to the tool. |

## 1. Goal (user words)

> 我說的求的是上限 原本只為了保下限 先深入討論樣板房 能不能建立一個可以方便製作大量樣板房的介面 降低迭代成本

User answers: agents make the rooms and the user picks; a sample room is a test ground for the picture target; shape, light, water and material must all vary. Added 2026-11-11: the v1 feel faults (movement pace, collision, water entry feedback, underwater look) are also tested in the workbench ("全部併進工作台"). Benchmark: the 21 pictures in `pictures/`.

Result wanted: the user sees many rendered rooms beside the reference pictures, picks, and gives short feedback. One new room costs one small text file.

## 2. Not in scope

- The layout generator, P1 contract, save, audio, UI, journey, packaging.
- Interactions with facilities (slide, dive, jump). The user wants them in the game; they are not in this blueprint yet.
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
| `workbench/rooms/<id>.room.json` | One room (section 5) | Data |
| `workbench/looks/light/<id>.json`, `looks/water/<id>.json`, `looks/material/<id>.json`, `looks/feel/<id>.json` | Presets (section 6) | Data |
| `workbench/sheets/<id>.json` | List of combinations to render | Data |
| `workbench/shots.mjs` | One command: renders a sheet to `workbench/out/` | Code |
| `workbench/out/` | Pictures and contact sheets. Git-ignored. | Output |
| `workbench/feedback/<sheet>-<date>.json` | User picks and notes | Data |

## 5. Room file

A room is one JSON file: `workbench/rooms/<id>.room.json` (user decision 2026-11-11, `docs/decisions/2026-11-11-room-file-json.md`). It has scalar values, named character grids, and a list of typed objects. One grid character is 1 `unit` (default 1 m).

```json
{
  "id": "sunset-doors",
  "note": "JSON has no comments; use this key.",
  "ref": "pictures/pool15.jpg",
  "unit": 1.0,
  "ceiling": 4.0,
  "waterLevel": 0.3,
  "grids": {
    "plan": [
      "##########",
      "#........#",
      "#..##....=",
      "#..##....=",
      "#........#",
      "##########"
    ],
    "floor": ["0000000000", "0111111110", "..."]
  },
  "objects": [
    {"type": "sun", "dir": [-0.6, -0.5, 0.4]},
    {"type": "opening", "wall": "E", "from": 2, "to": 6, "sill": 0, "head": 3.5},
    {"type": "camera", "name": "main", "pos": [2.5, 1.6, 7.5], "look": [8, 1.4, 3]}
  ]
}
```

Top-level keys: `id` (necessary), `note`, `ref`, `unit`, `ceiling`, `waterLevel`, `floorStep` (default 0.15), `grids`, `objects`. Any other key is an error.

Grids: `plan` is necessary; `floor` is optional (digits only, same size as `plan`). Each row is one string, and all rows have the same width.

Objects: the table `OBJECTS` in `workbench/js/room.js` is the only list of types (name, kind, necessary or optional, default for each field). Today: `sun`, `opening`, `camera`, `ramp`, `doorway`. The parser checks each object against the table. An error names the room, the object index and the field. An unknown type or field is an error. A new type needs one new table entry plus its consumer.

Doorway (added for `pictures/pool15.jpg`: doorways in a row, standing in water): `{"type": "doorway", "cell": [x, z], "side": "W", "width": 2.0, "height": 2.6}`. `cell` is the first wall cell and `side` is the face you enter by (the neighbour on that side must be floor). The opening runs straight through the wall cells to the far floor. `width` is a whole number of cells, toward +x for N/S and toward +z for E/W. `height` is the top of the opening above the local floor; the room ends there (lintel). The parser carves the cells into floor, so collision, water and drawing use the normal floor path. Example room: `rooms/pool15-doorways.room.json` (unit 0.5, four 1 m thick walls, two doorways each).

Surface address (reserved; `doorway` uses `cell` and `side`). An object that sits on a face of the room uses these fields, so that decals and signposts can be added with no format change:

| Field | Value | Meaning |
|---|---|---|
| `cell` | `[x, z]` | grid cell that holds the face |
| `side` | `"N"`, `"E"`, `"S"`, `"W"`, `"floor"`, `"ceiling"` | face of that cell |
| `at` | `[u, v]` | position on that face, in metres from its lower left corner |
| `size` | `[w, h]` | width and height on that face, in metres |

Rules for the format:

1. Start with these plan symbols only: `#` wall, `.` floor, `=` opening to outside; digits in the `floor` grid for floor height steps.
2. Add a symbol, a key or an object type only when a named reference picture cannot be made without it. Write the picture name in the commit message. Doors, decals and signposts follow this rule.
3. A light is declared as a `sun` or `opening` object (later: skylight, lamp panel). There is no field that sets the brightness or colour of a surface.
4. The `camera` object named `main` is written before the first render of that room. A changed camera needs a reason in the commit message.
5. A room file has no reference to code, and code has no reference to a room id.

## 6. Presets

Four preset kinds. Each is a small JSON file of numbers and names. Any room works with any light, water, material and feel preset.

| Kind | Holds (examples) |
|---|---|
| light | sun colour and strength, sky colour, ambient level, exposure, fog colour and density, shadow softness |
| water | tint, clarity by depth, reflection strength, ripple size and speed, caustic strength |
| material | tile size, grout width and colour, tile colour set, gloss, edge fillet radius |
| feel | walk and wade speed, acceleration and stop time, eye height, view bob, body radius, step height that the player climbs without a stop, swim speed |

A feel preset has no effect on a still picture. The user tests it by walking. A sheet for feel lists rooms x feel presets as links to walk in, not as pictures.

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
| K13 | Water entry feedback: wake and rings around the body, splash at entry, slower pace by depth | user fault "入水沒有回饋" | - |
| K14 | Underwater look: tint, short view distance, moving light, surface seen from below | user fault "水下不像水下" | - |
| K15 | Movement and collision: smooth slide along walls, no snag on steps and edges, pace from the feel preset | user faults "移動節奏不對", "碰撞與地形不順" | - |
| OUT | Free-form curved surfaces (not a rectilinear plan with fillets) | 7, 10 | 2 |

`OUT` pictures are not targets. The user decides later if they get their own kit.

Build order: K1, K3, K2, K5 (M1), then K15 (M2), then K13, K14, K6 (M4). The first version stops there. K4, K7 to K12 come after it.

## 8. Milestones

One milestone is one delegation. Do not start the next before the user sees the result.

| M | Deliverable | Target picture | Done when |
|---|---|---|---|
| M1 | Room parser, viewer, K1, K3, K2, K5, `shots.mjs` for one combination, plain first-person walk. One room, one preset each of light, water and material. Output: one still picture from the fixed camera, render on the left, reference on the right. No sheet, no feel tuning. Build in this order and make the pair after each step: tile, sunlight, water, indirect light, walk. | `pool15.jpg` | The user looks at the pair, walks in the room and says what is missing. No pass mark. |
| M2 | K15 and the feel preset kind. One test room with steps, a ramp, a narrow door, a pool edge and water of three depths. Three feel presets. | none (feel) | The user walks the test room with each preset and says which is nearest. |
| M3 | Sheets: `shots.mjs` renders rooms x lights x waters x materials into one contact-sheet page with keep/drop buttons and a note field that exports the feedback JSON. Room authors add 6 rooms and 3 presets of each kind. No kit change. | `pool15.jpg` | The user picks from one sheet in under 5 minutes. |
| M4 | K13, K14, K6 | `pool11.jpg` for deep water; user faults for entry and underwater | As M1, and the user enters and dives in the water. |

The first version of the workbench ends at M4. It has: tile, sunlight, water, indirect light, movement and collision, water entry feedback, underwater look, deep water tint, and the sheet for picking.

After the first version (the user decides the order then; do not build before):

| Item | Content |
|---|---|
| A1 | K4, K7 (bright panels and windows, fog); target `ppool12.jpg` |
| A2 | K10, K8, K9 (fillets, round columns, arches); targets `pool14.jpg`, `pool19.jpg` |
| A3 | K11, K12 (caustics, props) |
| A4 | Rooms in volume by room authors |
| A5 | Hidden things; interaction with water and facilities (slide, dive, jump). Recorded as a user wish. Not planned. |

User rule, 2026-11-11: "限制工作臺初版的範圍以免全都做不好". User boundary for the first version: "v1 的手感問題（移動節奏、碰撞、入水回饋、水下視覺）到這裡都要做"; what the player does other than walk: "這個記著但先不做". User decision, 2026-11-11: "m1併起來做" (M1 is one delegation, not three). Do not add a capability to a milestone.

M1 is the only milestone that is certain. The user's M1 feedback can reorder or replace all later milestones. Do not tune feel before M2.

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
| W-09 | The viewer shows frame time (mean, p99) on screen when the URL has `?stats=1`, and the server can be reached from a phone on the same network. A milestone is not finished before the user reads the phone number. | The user opens the URL on a phone and reports the two numbers. |
| W-10 | Every control works by touch on a phone (look, walk). | The user walks on the phone. |
| W-08 | No new automated test (prototype scope, `AGENTS.md` test table). Game files are not touched, so game tests are not run. | `git diff --stat` shows `workbench/` and `.gitignore` only. |

## 10. Stop and report (do not improvise)

Stop, change nothing more, and report to Fable when:

- A target needs a capability that is not in this milestone.
- The format cannot express the target room without a new symbol or key.
- A capability needs a new dependency, a build step, or an edit outside `workbench/`.
- Mean frame time is above 33 ms on the build machine, or on the user's phone, with all milestone capabilities on. User rule, 2026-11-11: "停手門檻 33 ms 這個也要用手機設備測 大部分人體驗會使用手機". A desktop number does not prove the limit. Headless Chromium has no phone GPU, so the phone number comes only from a real phone.
- The render and the reference still differ in a way you cannot name.

Report format: `Done / Not done / Boundary conflicts`, plus the exact command, the commit hash, and the output paths.

## 11. Delegation brief template (five fields from `AGENTS.md`)

| Field | M1 text |
|---|---|
| Goal | "先深入討論樣板房 能不能建立一個可以方便製作大量樣板房的介面 降低迭代成本". Deliver M1 of this blueprint and nothing from a later milestone. |
| May edit | `workbench/**`; one line in `.gitignore` for `workbench/out/` |
| Must not touch | `js/**`, `index.html`, `versions/**`, `tests/**`, `tools/**` (read `tools/vendor` only), `package.json`, `.github/**`, `AGENTS.md`, `CLAUDE.md`, `claude-decisions.json`, `docs/**`; no `npm install`; no push |
| Acceptance | Rules W-01 to W-08; `node workbench/shots.mjs` makes the M1 pair; exploration scope, no new tests, existing tests stay untouched |
| Report | `Done / Not done / Boundary conflicts` |

## 12. Unknowns

M1 measured 2.25 ms mean on an RTX 4060 laptop. This says nothing about phones. W-09 and W-10 are not built yet; M1 does not meet them.

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
