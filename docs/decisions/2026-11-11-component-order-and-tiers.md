# Order of work, tiers and who takes part (sample-room track)

Date: 2026-11-11. Status: user direction. Owner: user.

The user asked for a priority order and three tiers, and said: "但先不要開始做或派任務". No item starts before the user says so in chat.

Method and stop rule: `docs/decisions/2026-11-11-target-90-percent-all-pictures.md` section 5 (components first; "90 %" is a stop concept; coordinate plus parameters).

## 1. Tiers

| Tier | Meaning | Who takes part |
|---|---|---|
| A | Build directly | Builder only |
| B | ChatGPT writes the plan, then the builder builds. A drift does no harm. | Builder and ChatGPT |
| C | Test or discuss before the build | User, Fable, or both |

## 2. Items in priority order

Each shape component is one object type: a coordinate plus parameters (reference, not a firm rule).

| # | Item | Tier | Who decides |
|---|---|---|---|
| | **Foundations** | | |
| 1 | Phone frame time measurement | C | User measures |
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

Count: 12 A, 11 B, 6 C. Only items 1, 2 and 24 need the user in person.

Parked: movement feel, K13, K14, reuse in the game.

## 3. Evidence for a component

- A picture of the component in the gallery room, dry and in water.
- Its collision check in `node workbench/feel-check.mjs`.
- No check of a picture against a 90 % mark.

## 4. Basis and reverse cost

Basis: Fable made the list on 2026-11-11 from the component counts of the old picture plan (`archive/docs/handoff/picture-scenes-plan-summary.md`) and the gaps seen in the `pool15` rooms. `pool12` and `pool20` were not analysed; they can add items.

Reverse: edit this file and `ROADMAP.md`. No code depends on this file.
