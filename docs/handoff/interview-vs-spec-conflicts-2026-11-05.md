# Interview answers versus spec and decisions (2026-11-05)

Source of truth: `docs/handoff/scene-interview-answers-2026-11-05.md` plus `docs/handoff/scene-interview-amendments-2026-11-05.md` (both immutable; the amendments win on conflict; cite them, never edit them). Amendment 1 reverses answer A5: regular long corridors MUST be generated. List made by ChatGPT (task `c2c_d7e1`, read-only). Claude spot-checked rows 1, 4, 22 and 26 against the code (the cited statements hold; some line numbers are off by a few). Other `file:line` values are not yet verified. Type: conflict / missing / stale / ok.

## Needs a user decision (3 groups)

| ID | Question | Why the old text cannot stay |
|---|---|---|
| D1 | Remove the "elapsed time sets a permanent oppression floor" rule, or keep time only for reversible short-term anomalies? | Answer B "Staying still" forbids a permanent rise. `js/atmosphere.js` `tensionTarget()` = max(visited/4, elapsed/25 min); `docs/spec.md:191` states the same |
| D2 | Must v2 take over the full journey (30 min main line, must-pass wonders, mid/late figures, ending)? | v1 has zones, exit, figures. v2 has `zones=[]`, `exit=null` (`js/gen2.js:510-512`), and no figures (`js/main.js` calls presence only for GEN 1) |
| D3 | "One or two wonders per long exploration": per 30-min main line, or including free exploration after it? | Sets the wonder frequency and the must-pass placement |


## Journey and anomaly

| # | Topic | Type | Current text or code | Fix target |
|---|---|---|---|---|
| 1 | Time floor makes oppression permanent | conflict | `js/atmosphere.js:12-14`, `docs/spec.md:191` | split long-term progress from short-term anomaly in `docs/spec.md` §5 (D1) |
| 2 | Lingering raises sound/odd sights, recovers after moving | missing | no stay state in `js/atmosphere.js`, `js/audio.js` | new reversible anomaly state; decision record |
| 3 | Late game changed mostly by light/mood, not by low ceilings | conflict (part) | ceilings follow tension in `js/main.js`, `js/atmosphere.js` | `docs/spec.md` §5: separate mood change from rare structural change |
| 4 | Journey length: answers mention 15-25 min direct and long wandering | missing | `docs/spec.md:89` cap 30 min; no full-walk check | end-to-end acceptance in `docs/spec.md` and `ROADMAP.md` |
| 5 | v2 has no main line | missing | `js/gen2.js:510-512` | `ROADMAP.md` v2 steps (D2) |
| 6 | First 5 min bright easy pools; mid journey stairs into water, stacked levels | missing | no pacing contract | `docs/spec.md` §2.2 |

## Scene generation

| # | Topic | Type | Current | Fix target |
|---|---|---|---|---|
| 7 | Photos are traits, not a hand-placed list | conflict | `docs/handoff/picture-scenes-plan-summary.md` places 13 separate scenes far away | mark the summary superseded; `docs/spec.md` §2.2.4 |
| 8 | Common traits combine at random, 1-2 stars per building | missing | `js/gen2.js` rooms lack photo traits | `docs/spec.md` §2.2.4 |
| 9 | Wonders occasional, may be on the must-pass route | conflict/missing | summary puts them far away | `docs/spec.md` §2.2 (D2, D3) |
| 10 | Regular long corridors (Amendment 1: must be generated) | ok / missing check | `docs/decisions/2026-10-25-stage-02b-finish.md` has straight corridors with regular lamp spacing, max 36 m; no conflict now | `docs/spec.md` §2.2.4: state corridors and colonnades as allowed; add a check that the generator makes long regular ones |
| 11 | Shared water over many rooms, high platforms, shallow floor | missing | water rooms are single-room (`docs/decisions/2026-10-31-poolcore-water-rooms.md`) | water spec |
| 12 | Stairs into water inside colonnades; bright-to-deep transitions via doors/corners/narrow passages | missing | later phases of water plan not built | `ROADMAP.md` Poolcore |

## Per photo corrections

| Photo | Type | Required change |
|---|---|---|
| pool6 | conflict | many parallel strips, not exactly three (`picture-scenes-plan-summary.md`) |
| pool11 | conflict | narrow winding stair along the well wall, no ladder |
| pool20 | stale | photo now exists; add rectangular pool, ladder, square tiled pillars, view to next pool room |
| pool21 | conflict | right side is a very shallow part of the same pool, same water height, not a second pool |
| pool12 | ok | stays paused |
| pool18/19 | ok | straight pool edges kept |
| pool1/14, 2/16, 3/7, 4, 5, 8, 9/15, 10, 13, ppool12 | missing | not built yet; direction matches the answers (ppool12 needs an exception: high flood level, water over lower half of windows) |

## Light, sound, figure, ending

| # | Topic | Type | Current | Fix target |
|---|---|---|---|---|
| 13 | White/blue/green to cold grey-blue/teal | ok | `js/atmosphere.js:9-11` | keep |
| 14 | Long view early, near view late, floor readable | ok / missing check | fog 45 m to 18 m | add a readability check |
| 15 | A few bright spaces remain late | missing | one global tint | spec + decision |
| 16 | Only some lights flicker | conflict | shared lamp material flickers together | per-lamp anomaly |
| 17 | Machine/metal noise | missing | no such sample in `js/audio.js` | `docs/spec.md` §8 |
| 18 | Music occasional, directional, fades with distance | conflict/missing | v1 guide music is constant; near floor 0.12 | `docs/spec.md` §4, `js/audio.js` |
| 19 | Echo by room type | missing | one reverb driven by tension | `docs/spec.md` §8 |
| 20 | Figure absent early | conflict | enabled at `atmos.T >= 0.5`, which time alone can reach (`js/main.js`) | tie to journey stage |
| 21 | Figure in v2 | missing | v1 only | D2 |
| 22 | Bright exit gives relief, world stays mysterious | missing | exit exists in v1 only | `docs/spec.md` §5-6 |

## Stale documents

`docs/submission.md` describes the delivered v1 and stays a history record; update only its pointers. `docs/spec.md`, `ROADMAP.md` and `docs/handoff/picture-scenes-plan-summary.md` need the fixes above after D1-D3 are answered.
