# Sample-room workbench

## Pictures
`node workbench/shots.mjs <sheet> --stage=final --out=<name>` writes `workbench/out/<name>.png`
(render left, benchmark right, frame time in the footer).

## Phone test (frame time and touch walk)
1. On the PC run: `node workbench/serve.mjs --lan`
2. Put the phone on the same Wi-Fi. Open the `phone:` URL that the command prints, for example
   `http://192.168.1.20:8080/index.html?sheet=m1-pool15-e5&stats=1`
3. Change `sheet=` to any file name in `workbench/sheets/` (without `.json`).
4. Touch: drag on the left half to walk, drag on the right half to look.
5. Read the numbers at the top left: `mean`, `p99` (ms per frame) and fps. They refresh once per second from the last 300 frames.
   Without `&stats=1` nothing shows.

The stats number is the time between two screen frames, so it cannot go below the screen refresh (16.7 ms at 60 Hz).
The `shots.mjs` number is the render cost with a GPU sync and no refresh limit, so it is smaller. Do not compare them directly.
The stop limit is 33 ms on the phone (blueprint section 10).
Without `--lan` the server listens on 127.0.0.1 only.

## Room files
One room is one JSON file: `workbench/rooms/<id>.room.json`. Scalars (`unit`, `ceiling`, `waterLevel`, `floorStep`), `grids` (`plan`, `floor`: one string per row, readable as a map) and `objects` (`sun`, `opening`, `camera`, `ramp`, `doorway`). Picture of doorways in a row: `node workbench/shots.mjs m1-pool15-doorways --stage=final --out=pool15-doorways`.
The list of object types is the table `OBJECTS` in `workbench/js/room.js`. A broken file fails with the room, the object index and the field in the message.
Format and surface address: `docs/handoff/sample-room-workbench-blueprint-2026-11-11.md` section 5.

## Feel test room (M2)
Three sheets use the test room with one feel preset each: `m2-feel-heavy`, `m2-feel-mid`, `m2-feel-light`.
The room has a 0.15 m step, a 0.45 m block, a ramp, a 0.75 m door, a pool edge and pools 0.3, 0.6 and 0.9 m deep.

- Desktop: `node workbench/serve.mjs`, open `http://127.0.0.1:8080/index.html?sheet=m2-feel-mid&stats=1`. Click the picture, then W A S D and the mouse.
- Phone: `node workbench/serve.mjs --lan`, open the printed `phone:` URL but with `sheet=m2-feel-mid` (or `-heavy`, `-light`). Left half drag = walk, right half drag = look.
- Preset files: `workbench/looks/feel/*.json`. A sheet picks one with a `"feel"` key. Without the key the viewer uses `mid`.
- Check without a browser: `node workbench/feel-check.mjs` (prints PASS or FAIL per rule and preset).
- Design: `docs/handoff/m2-movement-architecture-2026-11-11.md`.
