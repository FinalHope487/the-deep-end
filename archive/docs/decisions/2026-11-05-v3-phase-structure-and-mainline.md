# Decision: v3 phase structure and v1-style main line (2026-11-05)

Source: user answers in this session. Plan files: `docs/handoff/v3-acceptance-01..04-*.md`.

| Item | Decision |
|---|---|
| Phases | P0, P1, P2, P2M, P3W, P3V, P3S, P3M, P3A, P3U, P4 (user approved) |
| P2M | Minimal complete four-zone route with exit, progress and save, right after P2 |
| Artifacts | Keep every accepted phase as a static artifact. URL `?gen=v3&phase=pN` |
| Saves | Progress separate per phase. Settings shared |
| Numbers | Reuse v1 budgets. New v3 numbers PROPOSED until measured and approved |
| Main line | v1 form: seeded zones, distance unload, identical rebuild |

## Not adopted: regeneration on arrival

User expectation: after arriving at a zone, later map regenerates fully. Claude checked: v1 does not do this (`js/chunks.js` unloads far chunks; `js/world.js` is a pure function of seed). A structural rewrite conflicts with determinism, E3, Q35 and the save format.
Chosen: distance unload only. To change it, the user states what changes and how return visits and saves behave (OD-10).
**Cost to reverse**: P2M journey code and the save format change.

## Journey length and speed (2026-11-05)

User: the direct route is 2–3 km in a STRAIGHT LINE; the real path is much longer. The specific journey time is NOT an important acceptance standard (measure and record only). Required instead: distances between places and walking speed change with only a few lines of code in one place. Defaults: 2–3 km, 3.3 m/s. See P2M-J02, P2M-J13, P2M-J16, P2-W01, AR-13.
