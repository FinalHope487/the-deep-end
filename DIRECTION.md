# Direction guide for the user

Date: 2026-11-11. Author: Fable. Status: sections 2 and 4 are user decisions; sections 1, 3, 5, 6 and 7 are proposals that the user corrects.

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

## 2. What "90 %" means (user decision 2026-11-11)

Your words: "九成是所有圖都要有但是不用做到100%完美 90%完美就好".

- All 21 pictures are targets. No picture is out.
- Each picture must be 90 % right, not perfect. You judge the 90 %.
- Result: `pool7` and `pool10` (free-form curved surfaces) are targets now. The blueprint marked them `OUT`. This is recorded in `docs/decisions/2026-11-11-target-90-percent-all-pictures.md`.

Working test until you say otherwise: at a glance you see the same space, the same water behaviour and the same reflection subject as in the picture. Light mood can differ (G4).

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
| Shape | Free-form curved surfaces (`pool7`, `pool10`); the grid cannot give them, so they need a second shape method | 2 | Not started; method unknown | 2 to 4 |
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
| Rooms | 21 room files with cameras and presets (cheap model) | 21 | 1 of 21 started | 3 to 4 |
| Phone | Frame time on your phone; cost cuts if above 33 ms | all | Not measured | 0 to 2 |

Total: about 22 to 30 rounds. The builder did about 10 rounds on 2026-11-11, so builder time is not the limit. The limits are your review time, the weekly quota, and three unknowns:

0. **Free-form shapes.** Two pictures need surfaces that a grid of cells cannot make. The method is not chosen. They come last (order D1), so that they do not delay the other 19 pictures.

1. **Light quality.** The largest visible gap between a render and its picture today is light (flat grey against strong warm light with clear lit and shaded faces). Shape is the easy part. If simple real-time light cannot give light against dark, the choice is baked light (load time) or a lower target.
2. **Phone cost.** The reflection draws the scene two times. No phone number exists. All later choices depend on it.

## 4. The large decisions

DECIDED 2026-11-11: you took the default of D1 to D7 ("d1~7照default"). To change one, send its number and the letter.

| # | Decision | Options | Chosen (the default) and reason |
|---|---|---|---|
| D1 | Order of work | (a) tools, light basics, water, shapes, rooms in volume; (b) shapes first; (c) water first | (a). Water colour comes from the light, so water cannot be judged before the light has light against dark. |
| D2 | Who tunes a look | (a) you, with the sidebar, and you export the preset; (b) agents, by rounds of variants | (a). Rounds of variants gave no accepted look. |
| D3 | Light method | (a) simple real-time: sun shadows, local lamps, contact shade, grade; (b) baked light | (a) first. Change to (b) only if the phone number or the picture fails. |
| D4 | Movement items of the blueprint (water entry feedback, underwater look; milestone M4) | (a) park them until G3 is reached; (b) keep the blueprint order | (a). They are not part of G3. This changes the blueprint order, so it needs your word. |
| D5 | Phone measurement | (a) you measure now; (b) later | (a). 5 minutes; it can cancel the reflection method. |
| D6 | Terrain painter | (a) after the first rooms show that text grids are too slow; (b) now | (a). The room author is a cheap model, which writes grids quickly. |
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

## 6. How to ask

### 6.1 Four kinds of message

Start the message with the kind. Then the agent knows what answer you want and does not guess.

| Kind | Use it when | Write | The agent gives |
|---|---|---|---|
| DO | You know what you want | The result that you want to see, not the method. Add "do not change X" if something must stay. | The work, the evidence, and what it chose for you |
| CHOOSE | You must decide and do not know the options | "Options for X" and what matters most to you (picture, phone speed, quota, time) | 2 to 4 options, what each changes, one recommendation, and a default |
| WHY | Something looks or feels wrong and you do not know the cause | See 6.3 | The cause with proof (a picture or a number), not a fix. A fix comes only if you say "and fix it". |
| CHECK | You want to know where the work stands or if a claim is true | "State of X" or "Is it true that X" | Facts with file and line or command output; what is not verified |

### 6.2 How to decide what to ask

Ask a question only if the answer changes what you do next. Go down this list and stop at the first "yes".

1. Is there a result on screen that you can judge by eye? Then judge it (keep, drop, or 6.3). Do not ask about the method.
2. Can you change it yourself in the sidebar? Then change it and send the exported preset. This costs no round of guesses.
3. Is the next step in section 3 or section 4 already decided? Then say "continue". Do not decide again.
4. Does the choice cost quota, lose data, add a dependency, or change a decided line of this file? The agent must ask you, and it asks all such points in one message. If it did not, tell it.
5. All other choices belong to the agent. It reports them under "decided for you". Read that part; overrule a line by its number.

Questions that are worth their cost, in this order: what is the largest gap to the target now; what is the cheapest test that can prove the plan wrong; what did you decide for me; what is not verified.

### 6.3 When you do not know what the problem is

Do not try to name the cause. A wrong cause sends the agent the wrong way (the "wave transparency" case: the real cause was the reflection). Give evidence, and let the agent find the cause. Send these five lines; leave a line empty if you do not know it.

| Line | Content | Example |
|---|---|---|
| WHERE | The sheet or room, and the place in the picture | "m1-pool15-doorways, far water on the left" |
| SEE | What you see, in plain words | "brown patches that move" |
| WANT | What you expected, or the reference picture and the place in it | "as pool15, the water behind the second doorway" |
| GUESS | Your guess, marked as a guess | "guess: waves too transparent" |
| KEEP | What must not change | "the near water is good" |

Then the agent must do these things in this order, in one reply:

1. Say again what it understood, in one line.
2. Show the cause with proof: a layer view, a picture with one factor off, or a number. Not an opinion.
3. Say if your GUESS was correct. If it was wrong, say what the real factor is.
4. Show 2 or 3 fixed variants beside the reference, or name the sidebar control to move.
5. Ask one question only if two readings of your words lead to different work.

Other ways to show a problem with no words for it:

- Point to a reference: "more like pool3 here". A picture carries more than a description.
- Send two renders: "this one is better than that one". The agent finds what is different between them.
- Give a rank, not a number: "A, then C, then B".
- Say the feeling: "flat", "plastic", "empty", "too clean". The agent maps it to factors with the table in section 5 and adds the new pair to that table.

### 6.4 If the agent does not understand you

Signs: it repeats work, it fixes a thing that you did not name, or its "what I understood" line is wrong. Then:

- Answer only "wrong: " plus the part of its understood line that is wrong. Do not explain again from the start.
- If two tries fail, say "show me the layers". Do not let it try a third fix.
- If the same kind of misunderstanding happens two times, tell the agent to add the case to section 5 or to this section.

## 7. Signs that the direction must change

- The phone number is above 33 ms with reflection on, and cost cuts do not repair it.
- After the sidebar exists, you still cannot reach a water or light look that you accept in two sessions.
- More than 3 rounds go to tools with no new picture beside a reference.
- A picture needs a shape that the grid cannot give (then: smaller unit for that room, or the picture goes to `OUT`).
