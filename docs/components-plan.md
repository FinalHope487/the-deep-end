# Components plan: items, tiers and order (sample-room track)

Date: 2026-11-11, changed 2026-11-17 (items 33 to 35 added). Status: user direction. Owner: user.

No item starts before the user says so in chat. Method and stop rule: `STATE.md`, the row for components first.

Rules for this file:

- An item number does not change and is not used again. Other files point to an item by its number.
- The order of work is section 2a only. To change the order, edit section 2a and no other place.
- The state of an item (open, done) is in `ROADMAP.md` only.

## 1. Tiers

| Tier | Meaning | Who takes part |
|---|---|---|
| A | Build directly | Builder only |
| B | ChatGPT writes the plan, then the builder builds. A drift does no harm. | Builder and ChatGPT |
| C | Test or discuss before the build | User, Fable, or both |

## 2. Items

Each shape component is one object type: a coordinate plus parameters (reference, not a firm rule).

| # | Item | Tier | Who decides |
|---|---|---|---|
| | **Foundations** | | |
| 1 | Phone frame time measurement. Not a gate from 2026-11-17: the user can measure at any time, and no item waits for it. | C | User measures |
| 2 | Light system: a test of 2 or 3 methods for light against dark and local bright areas | C | Fable tests, user chooses |
| 3 | Material for each surface (wall, floor, ceiling, pool) | C | Fable designs |
| 4 | More than one water body, each with its own level | C | Fable designs, then a test |
| 5 | Face class tag on each component (for materials and layer views) | A | |
| 6 | Component gallery room and its contact sheet | A | |
| 7 | The advisory items of the reviews: doorway top collision, ramp below a lintel, doorway higher than the ceiling | A | |
| | **Shape components** | | |
| 8 | Columns: round, square, funnel | A | |
| 9 | Window rows and niches | A | |
| 10 | Arch opening | A | |
| 11 | Platforms and islands | A | |
| 12 | Sunken pool | B | |
| 13 | Stairs into water | A | |
| 14 | Railings | A | |
| 15 | Pool ladder | A | |
| 16 | Curved and slanted walls | B | |
| 17 | Ceiling and floor openings | A | |
| 18 | Spiral stair | B | |
| 19 | Water shaft | B | |
| 20 | Small props | B | |
| | **Water** | | |
| 21 | Ripple styles (the current `waves` style is too regular) | B | |
| 22 | Deep water tint | B | |
| 23 | Caustics | B | |
| 24 | Final water look, tuned with the sidebar | C | User |
| | **Light, after item 2** | | |
| 25 | Glowing panels, local lamps, contact shade | C, then B | Follows the choice of item 2 |
| 26 | Fog | B | |
| 27 | Exposure, colour grade, anti-aliasing | B | |
| | **Tools and assembly** | | |
| 28 | Layer views (show which factor makes an effect) | B | |
| 29 | Rebuild the pictures with the components | B | User judges each result |
| 30 | Early assembly of one simple picture. It tests the component vocabulary and the room format. No look tuning. (User, 2026-11-17) | B | Fable chooses the picture |
| 31 | Document check script and the pre-commit hook that runs it (`ROADMAP.md`) | A | |
| 32 | Analyse `pool12` and `pool20` for components and format needs that are not in this list | C | Fable |
| 33 | Connection ports and room footprint in the room file. A port records facts only: position, size, direction, floor level, water level. The view through a connection is computed from these facts and is not stored as a type. (User, 2026-11-17) | C | Fable designs |
| 34 | A light test scene: two joined rooms with a view from one room into the other. Item 2 uses this scene. (User, 2026-11-17) | C | Part of item 2 |
| 35 | Join two or three pre-made rooms and walk through them. It tests if pre-made rooms alone are sufficient. (User, 2026-11-17) | B | User judges |

Only items 2, 24 and 35 need the user in person.

## 2a. Order of work

Items in one step can run in one round or in parallel.

| Step | Items | Why here |
|---|---|---|
| 1 | 5, 6, 7, 31 | They do not depend on the light. The gallery room holds the evidence for each later component. |
| 2 | 28 | Layer views need the face tags (5). The user uses them to choose the light and to judge water. (User, 2026-11-17) |
| 3 | 2, 34, 32 | The light choice. Water colour depends on it. The light must also hold across two joined rooms (34). |
| 4 | 3, 4, 33 | They change the room format. Do them before components that touch water. |
| 5 | 8, 9, 10, 11 | Dry shape components. They can start after step 1. |
| 6 | 30, then 35 | The first check that the vocabulary and the format can make a picture. Then the first check of joined rooms. |
| 7 | 12 to 20 | The other shape components. |
| 8 | 25, 26, 27, then 21, 22, 23 | Light details, then water. |
| 9 | 24 | The user tunes the final water look. |
| 10 | 29 | All pictures. |

Parked: movement feel, K13, K14, reuse in the game.

## 3. Evidence for a component

- A picture of the component in the gallery room, dry and in water.
- Its collision check in `node workbench/feel-check.mjs`.
- No check of a picture against a 90 % mark.

## 4. Basis and reverse cost

Basis: Fable made the list on 2026-11-11 from the component counts of the old picture plan (`archive/docs/handoff/picture-scenes-plan-summary.md`) and the gaps seen in the `pool15` rooms. `pool12` and `pool20` were not analysed (item 32). Section 2a is Fable's order from the user's two changes of 2026-11-17; the user did not approve each step.

Reverse: edit this file and `ROADMAP.md`. No code depends on this file.
