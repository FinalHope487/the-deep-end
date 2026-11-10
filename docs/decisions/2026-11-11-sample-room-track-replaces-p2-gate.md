# Sample-room track replaces the P2 gate as the current direction (READ FIRST)

Date: 2026-11-11. Status: user direction. Owner: user.

User decision in chat, 2026-11-11: "取代閘門". This file replaces `docs/decisions/2026-11-07-v3-p2-room-generator-gate.md` as the file that `CLAUDE.md` imports.

## 1. Current work

Find the upper limit of picture quality with sample rooms. Blueprint: `docs/handoff/sample-room-workbench-blueprint-2026-11-11.md`. Benchmark: the 21 pictures in `pictures/`.

The user accepts results. The agent does not. Do not call a look, a room or a milestone "accepted" before the user says so in chat.

## 2. What stops applying from the old gate

| Old gate part | Text | State |
|---|---|---|
| Section 1 | Goal: an accepted room generator plan, then a first-person demo | PAUSED. Not the current goal. |
| Section 2 | Only subjects S1 to S3 are open; no atmosphere | STOPPED for the sample-room track. Light, water, material and shape are open there. |
| Section 7.1 to 7.3 | ChatGPT writes the plan; previews; no build before the user accepts a plan | STOPPED for the sample-room track. Code in `workbench/` is permitted when the blueprint milestone is delegated. |
| Section 7.4 | Demo scope: dry rooms, no water, no stairs | STOPPED for the sample-room track. |
| Section 8 | Order of reading | Replaced by section 5 of this file. |

## 3. What stays

| Old gate part | State |
|---|---|
| Section 3, user words on room structure | Valid. Use them when layout work starts again. |
| Section 4, rules G-01 to G-10 | Valid for any layout generator work. They do not limit hand-written sample rooms. |
| Section 5, void and proposed items | Unchanged. The void plans stay void. |
| Section 6, frozen P1 facts | Unchanged. Do not edit the P1 files. |

Layout generator work (how space is divided, walls, corridors) is not started by this file. It needs a new user decision.

## 4. Limits of this decision

- It permits the blueprint work only. The blueprint section 2 lists what is out of scope.
- It does not choose the builder agent or its quota. That is a separate user decision (`AGENTS.md`, paid quota).
- It does not decide that sample-room data or kit code goes into the game.
- It does not drop P0, P1 or the phase plan. They are parked.

## 5. Order of reading for any agent

1. `AGENTS.md`
2. This file
3. The blueprint, for sample-room work
4. The old gate sections 3 to 6, for layout work
5. Other plans and decisions, in the light of this file

## 6. Basis and reverse cost

Basis: four P2 plan rounds gave no computed layout and no plan that the user accepted. The user named the v1 faults as light, material, shape, water and movement, and set the reference pictures as the benchmark. The old gate excluded these subjects.

Reverse: `git revert` the commit that adds this file. That restores the `CLAUDE.md` import and the old gate header. Delete `workbench/` if it exists.
