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
