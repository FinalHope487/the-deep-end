# Decision: oppression time floor, v2 role, wonder frequency (2026-11-05)

Source: `docs/handoff/scene-interview-amendments-2026-11-05.md` Amendment 2.

| ID | Decision | Replaces |
|---|---|---|
| D1 | Keep a time floor for the oppression value T, but slower than 25 min. On entering a main region, set T directly to that region's value, then T continues to deepen from there. Lingering adds only a reversible short-term anomaly layer that never raises T (answer B "Staying still") | `docs/spec.md:191` (T = max(regions/4, elapsed/25 min)) |
| D2 | v2 becomes the official main line: regions, exit, figures, ending. v1 stays the default until v2 reaches parity | v2 "no zones/exit" state (`js/gen2.js:510-512`) |
| D3 | Wonder frequency counts one main-line run (15-25 min): about one or two wonders per run | none |

## Claude's reading (user can correct)

- "繼續下降" is read as "the mood keeps descending into the dark", not "T falls". If the user meant T falls after the snap, change D1 and the spec.
- The new time-floor length is not set. First proposal: reach full T at 40 min (assumption, not a user value).
- The time floor stays irreversible by design; the user accepted that in D1. Short-term anomalies stay reversible.

## Cost to reverse

Doc-only today. Code change later: `js/atmosphere.js` `tensionTarget()`, `js/main.js` region-enter hook, new anomaly layer in `js/audio.js` and `js/atmosphere.js`.
