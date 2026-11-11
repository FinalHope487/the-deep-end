# The room file is one JSON file

Date: 2026-11-11. Status: user decision ("單一json檔"). Owner: user.

## Decision

A room is `workbench/rooms/<id>.room.json`. It replaces `<id>.room.txt` and the text-grid header parser. No dual path.

## Reason

User words: doors, textures and signposts are very hard to show in the plain text map. A JSON or data format must help or replace it. The text map does not have to go fully.

## Options compared

| Option | Result |
|---|---|
| A. More header lines in the text file | Rejected. Each new object needs a new line grammar and parser code. |
| B. One JSON file: scalars, `grids` (rows as strings, still readable as a map), `objects` (typed list) | Chosen. One file. One table of object types in `workbench/js/room.js`. |
| C. Text grid plus a side JSON file for objects | Rejected. Two files can disagree. |

## Contract difference

| Item | Before | After |
|---|---|---|
| File | `<id>.room.txt` | `<id>.room.json` |
| Scalars | header lines `water-level:`, `floor-step:` | keys `waterLevel`, `floorStep`, plus `note` |
| Grids | `plan:` and `floor:` blocks | `grids.plan`, `grids.floor` (arrays of row strings) |
| Lights, camera, ramp | header lines `source:`, `camera:`, `ramp:` | `objects` entries of type `sun`, `opening`, `camera`, `ramp` |
| Errors | free text | name the room, the object index and the field |
| Parsed result | unchanged | unchanged (consumers read the same shape) |

One type is added because a named picture needs it: `doorway` (user words: "我預期要能用新json檔做出參考圖片pool15的場景 有許多連續門廊泡水"). The old symbols cannot show it: `#` is full height and `=` exists only on the outer wall. Fields: `cell`, `side`, `width`, `height` (blueprint section 5). Consumers: the parser carves the cells to floor (so `world.js` is unchanged); `geometry.js` draws the lintel and ends the room at the lintel height. Room `pool15-doorways` and sheet `m1-pool15-doorways` show it. No decal or signpost type is added; the surface address (`cell`, `side`, `at`, `size`) is reserved for them.

## Check

Pictures of `m1-pool15-e5` and `m2-feel-mid` before and after the change are equal in the picture area (rows 0 to 911). Only the footer text rows differ (frame time, time stamp). `node workbench/feel-check.mjs` includes parser checks.

## Reverse cost

`git revert` the commit that adds this file. It restores the `.room.txt` files and the text parser. No history data depends on the new format (prototype stage).
