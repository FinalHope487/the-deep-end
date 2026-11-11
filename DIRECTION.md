# Direction guide for the user

Date: 2026-11-11. Author: Fable. Status: PROPOSED. The user corrects it; the agent does not call it accepted.

Purpose: you decide the large direction with the smallest number of questions. Each section ends with the one thing that you answer. This file is not a rule file. `AGENTS.md` and the blueprint (`docs/handoff/sample-room-workbench-blueprint-2026-11-11.md`) stay the rules.

## 1. Your goal, as the agent understands it

Correct a line by its number. A line that you do not correct is used as written.

| # | Statement | Source |
|---|---|---|
| G1 | The final product is a first-person exploration game with the look of the 21 pictures in `pictures/`. Most players use a phone. | Your words, 2026-11-11 |
| G2 | The present work finds the upper limit of the picture. The lower limit (it runs, it does not break) is not the aim now. | "求的是上限" |
| G3 | The target: the system can rebuild by hand 90 % of the architecture, the water and the reflections of the reference pictures. | Your words, 2026-11-11 |
| G4 | Light can use a different method from the pictures. It must show light against dark, and local bright areas. Physical correctness is not necessary. | Your words, 2026-11-11 |
| G5 | You judge by eye. You do not read code. You want to change values yourself and see the result immediately, because words lose information. | Sidebar request; the "wave transparency" example |
| G6 | Each system must be general. A new parameter, object type or room must need a very small change. One-off fixes for one room are not wanted. | Sidebar and JSON room requests |
| G7 | Quota is a hard cost. One message costs a fixed amount. Few, large, complete exchanges are wanted. Agents work without supervision between them. | Your words, 2026-11-11 |
| G8 | Hand-made rooms are a means. What you really buy is the proof that the engine can reach the look, and a vocabulary (shapes, water, light) that a room generator can use later. | Inferred by Fable. Not your words. |
| G9 | Scope must stay limited so that each part is done well. | "限制工作臺初版的範圍以免全都做不好" |

Inferred needs (Fable's reading, correct them if wrong):

- You need to see fast progress in the picture, not in tools. A tool is worth its cost only if it shortens the path to a look that you accept.
- No look is accepted after many water rounds. The cause is the feedback loop (you describe, an agent guesses), not the number of rounds. The sidebar and the layer views are the repair for this, not extras.
- Movement feel, water entry feedback and the underwater look are real wishes, but they are not part of G3.

## 2. What "90 %" means (proposed)

19 of the 21 pictures. `pool7` and `pool10` have free-form curved surfaces and are out (blueprint section 7, `OUT`). For each of the 19: at a glance you see the same space, the same water behaviour and the same reflection subject. Colour and light mood can differ (G4).

**You answer:** is this the correct meaning, or do you mean 90 % likeness of each picture?

## 3. The work map

State on 2026-11-11. "Round" = one builder task with its review. Sizes are estimates, not measured.

| Area | Capability | Pictures | State | Rounds |
|---|---|---|---|---|
| Tools | Room file as JSON with typed objects | all | Built | 0 |
| Tools | Parameter sidebar (you change values in the view) | all | In work | 1 |
| Tools | Layer views (which factor makes an effect) | all | Queued | 1 |
| Tools | Contact sheet: all rooms beside their pictures, keep/drop | all | Not started (blueprint M3) | 1 |
| Tools | Top-down grid painter for terrain | all | Idea | 1 to 2 |
| Shape | Walls, floor heights, steps, ramps, rectangular doorways | all | Built | 0 |
| Shape | Ceiling heights that change, beams, sunken pools with edges | most | Partly | 1 |
| Shape | Windows and skylights in any wall or ceiling | 8 | Partly (outer wall only) | 1 |
| Shape | Round columns, arches | 6 | Not started | 1 |
| Shape | Fillets and curved pool edges | 2 | Not started | 1 |
| Shape | Props: railings, stairs, ladders, plants, floats | 10 | Not started | 2 |
| Water | Reflection, see-through, ripples | 19 | Built; no look accepted | 0 |
| Water | Look plan (Opus) and one tuning round; you tune with the sidebar | 19 | Queued | 1 to 2 |
| Water | Depth tint, dark deep water, calm flat water | 6 | Partly | 1 |
| Water | Light patterns on floor and walls (caustics) | 3 | Not started | 1 |
| Water | More than one water level in one room | unknown | Not checked | 0 to 1 |
| Light | Sun with shadows and light patches | 8 | Basic | 1 |
| Light | Bright panels and windows that glow, and local lamps with falloff | 8 | Not started | 1 |
| Light | Dark corners and contact shade, bounce colour | 8 | Basic | 1 |
| Light | Fog, darkness, distance falloff | 4 | Not started | 1 |
| Light | Exposure and colour grade | all | Basic | 0 to 1 |
| Rooms | 19 room files with cameras and presets (cheap model) | 19 | 1 of 19 started | 3 to 4 |
| Phone | Frame time on your phone; cost cuts if above 33 ms | all | Not measured | 0 to 2 |

Total: about 20 to 26 rounds. The builder did about 10 rounds on 2026-11-11, so builder time is not the limit. The limits are your review time, the weekly quota, and two unknowns:

1. **Light quality.** The largest visible gap between a render and its picture today is light (flat grey against strong warm light with clear lit and shaded faces). Shape is the easy part. If simple real-time light cannot give light against dark, the choice is baked light (load time) or a lower target.
2. **Phone cost.** The reflection draws the scene two times. No phone number exists. All later choices depend on it.

## 4. The large decisions

Answer with the letter. "Default" is what the agent does if you say nothing.

| # | Decision | Options | Default and reason |
|---|---|---|---|
| D1 | Order of work | (a) tools, light basics, water, shapes, rooms in volume; (b) shapes first; (c) water first | (a). Water colour comes from the light, so water cannot be judged before the light has light against dark. |
| D2 | Who tunes a look | (a) you, with the sidebar, and you export the preset; (b) agents, by rounds of variants | (a). Rounds of variants gave no accepted look. |
| D3 | Light method | (a) simple real-time: sun shadows, local lamps, contact shade, grade; (b) baked light | (a) first. Change to (b) only if the phone number or the picture fails. |
| D4 | Movement items of the blueprint (water entry feedback, underwater look; milestone M4) | (a) park them until G3 is reached; (b) keep the blueprint order | (a). They are not part of G3. This changes the blueprint order, so it needs your word. |
| D5 | Phone measurement | (a) you measure now; (b) later | (a). 5 minutes; it can cancel the reflection method. |
| D6 | Terrain painter | (a) after the 19 rooms show that text grids are too slow; (b) now | (a). The room author is a cheap model, which writes grids quickly. |
| D7 | The parked water files (G, H, K sets) | (a) delete; (b) keep for the Opus plan | (b). |

## 5. How to give feedback at the lowest cost

One message costs the same if it is short or long. So:

- Send one message with all points. Number them.
- For a look: use the sidebar, find values that you like, and send the exported preset. Do not describe it.
- For a fault that you cannot name: say where in the picture (for example "far water, left") and what is wrong in plain words. The agent maps it to a factor (table below) and does not ask again.
- Say "default" to take each default in section 4.
- The agent sends one complete report for each of your messages. The builder writes its report to `workbench/out/builder-report.md` and sends no message.

| What you see | Usual factor |
|---|---|
| Brown or dark blotches on the water | Reflection of the ceiling or of dark walls |
| Water too vivid | Sky colours of the light preset; haze; body tint weight |
| Water looks like glass, no body | Clarity too high; haze too low |
| Floor not visible under near water | Clarity; reflection share near the viewer |
| Room looks flat | No strong sun direction; ambient level too high; no contact shade |
| Everything has one hue | The material value `floor` colours all upward faces and the bounce light |

## 6. Signs that the direction must change

- The phone number is above 33 ms with reflection on, and cost cuts do not repair it.
- After the sidebar exists, you still cannot reach a water or light look that you accept in two sessions.
- More than 3 rounds go to tools with no new picture beside a reference.
- A picture needs a shape that the grid cannot give (then: smaller unit for that room, or the picture goes to `OUT`).
