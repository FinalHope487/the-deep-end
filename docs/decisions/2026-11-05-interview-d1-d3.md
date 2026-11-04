# Decision: oppression time floor, v2 role, wonder frequency (2026-11-05)

Source: `docs/handoff/scene-interview-amendments-2026-11-05.md` Amendment 2.

| ID | Decision | Replaces |
|---|---|---|
| D1 | Staged descent (Amendment 3). Each main region has a band [floor, ceiling]. The atmosphere value falls with time inside the current band and stops at its floor. Entering the next region early moves the value quickly to that region's ceiling, which equals the previous band's floor. Lingering adds only a reversible short-term anomaly layer that never changes this value (answer B "Staying still") | `docs/spec.md:191` (T = max(regions/4, elapsed/25 min)) |
| D2 | v2 becomes the official main line: regions, exit, figures, ending. v1 stays the default until v2 reaches parity | v2 "no zones/exit" state (`js/gen2.js:510-512`) |
| D3 | Wonder frequency counts one main-line run (15-25 min): about one or two wonders per run | none |

## Claude's reading (user can correct)

- The value falls as the world gets darker, so oppression = 1 - value. The old T rose from 0 to 1; the direction flips, the meaning stays.
- Band edges are not set. First proposal: 4 equal bands (ceiling 1.0, 0.75, 0.5, 0.25; final floor 0.0 or the exit value) and each band takes about 6 min to reach its floor if the player stays (assumptions, not user values).
- Early entry makes a fast jump to the ceiling, so skipping ahead is never slower than waiting. The value never rises, so it is monotone: time cannot reverse it, and the only reversible layer is the short-term anomaly.
- Exit and ending relief (answer B "Ending") need a rule after the last floor. Not set.

## Cost to reverse

Doc-only today. Code change later: `js/atmosphere.js` `tensionTarget()`, `js/main.js` region-enter hook (fast transition to the new ceiling), new anomaly layer in `js/audio.js` and `js/atmosphere.js`.
