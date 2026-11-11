# Target: all 21 pictures at 90 %, and the order of work

Date: 2026-11-11. Status: user decision. Owner: user.

## 1. Decisions

| # | Decision | User words |
|---|---|---|
| 1 | The target is: the system can rebuild by hand the architecture, the water and the reflections of the reference pictures. Light can use a different method, but it must show light against dark and local bright areas. | "具備手動還原參考圖片的9成建築和水體及反射能力 光影可採不同系統但是要有分明暗跟局部光亮等情況" |
| 2 | All 21 pictures are targets. Each must be 90 % right, not perfect. The user judges. | "九成是所有圖都要有但是不用做到100%完美 90%完美就好" |
| 3 | D1 to D7 of `DIRECTION.md` section 4: the default of each. | "d1~7照default" |

## 2. Differences from the blueprint

Blueprint: `docs/handoff/sample-room-workbench-blueprint-2026-11-11.md`.

| Blueprint text | Now |
|---|---|
| Section 7: `pool7` and `pool10` are `OUT` (free-form curved surfaces) | They are targets. They are done last. The shape method is not chosen. |
| Section 7 build order and section 8: M3 (sheets), then M4 (K13 water entry feedback, K14 underwater look, K6 deep water) | Order D1: tools, light basics, water, shapes, rooms in volume. K13 and K14 are parked until the target is reached (D4). K6 stays with the water work. |
| Section 8: K4, K7 to K12 come after the first version | They are part of the target now, in the order D1. |
| Section 8: "Do not add a capability to a milestone" | Stays valid for each delegated round. The list of rounds is `DIRECTION.md` section 3. |

The blueprint sections 5 (room file), 6 (presets), 9 (rules W-01 to W-10) and 10 (stop and report) stay valid.

## 3. The seven decisions (D1 to D7)

| # | Chosen |
|---|---|
| D1 | Order: tools, light basics, water, shapes, rooms in volume |
| D2 | The user tunes a look with the sidebar and exports the preset |
| D3 | Simple real-time light first; baked light only if the phone number or the picture fails |
| D4 | K13 and K14 are parked until the target is reached |
| D5 | The user measures the phone frame time now |
| D6 | The terrain painter waits until text grids are shown to be too slow |
| D7 | The parked water files (G, H, K sets) are kept for the Opus water plan |

## 4. Basis and reverse cost

Basis: the user set the target in chat on 2026-11-11 and took the defaults that Fable proposed in `DIRECTION.md`.

Reverse: the user sends the number and the new choice. Then update `DIRECTION.md` section 4 and this file. No code depends on this file.
