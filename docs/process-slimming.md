# Process slimming: plan and record

Date: 2026-11-17. Author: Fable. Status: APPLIED 2026-11-17, with the differences in section 7.

Purpose: remove agent work that does not move the product forward. Section 2 and section 3 are general. Use them to change the template repository. Section 4 is this project only.

## 1. The test for each file and each step

Ask: "Who reads this, and what do they do differently after they read it?" If there is no answer, remove the file or the step.

## 2. Waste classes and the rule that stops each

| # | Waste class | Rule |
|---|---|---|
| W1 | One fact in many files. A change must be made in each. | One fact has one home. Other files link to it. |
| W2 | History kept as a current document. | A current file holds only what is in force. Reasons and history stay in Git. |
| W3 | Fixed end-of-round steps for each change size. | A step runs only when its trigger is true (section 3.3). |
| W4 | Verification that does not follow risk. | Test and review scope follow what the change can break. |
| W5 | Output that no reader uses. | Write for a named reader. Quote one sentence, not a full section. |
| W6 | Machine-made noise that a rule makes mandatory. | No rule points to a file that a hook writes. |

## 3. Target structure (general)

### 3.1 Files

| File | Holds | Size limit | Loaded at start |
|---|---|---|---|
| `AGENTS.md` | Rules that do not change with the project state | 12 KiB | Yes |
| `STATE.md` | Goal, contracts in force, next step, stop signals, file map, test command | 3 KiB for English, 6 KiB for CJK text | Yes |
| `DECISIONS.md` | One line for each decision: date, decision, user words, reverse cost | No limit; newest first | No. Read when a decision is in doubt. |
| `ROADMAP.md` | Open items only | 8 KiB | No. Read when work is chosen. |
| `QUESTIONS.md` | Open questions only | - | No |
| `docs/how-to-ask.md` | Message templates for the user | - | Never by an agent |

`CLAUDE.md` imports `AGENTS.md` and `STATE.md` only.

### 3.2 What is removed

| Removed | Replaced by | Class |
|---|---|---|
| A devlog | `git log` with Conventional Commits. Make a summary only when the user asks. | W2, W3 |
| One long file for each decision | One line in `DECISIONS.md`. A format or interface specification stays beside its code. | W1, W2 |
| A baseline section (commit SHA, test counts) | `git log -1`; the test result goes in the commit message. | W1 |
| A direction file that mixes agent facts and user templates | `STATE.md` and `docs/how-to-ask.md` | W5 |
| A start step that reads a hook-made decision file | Start step: read `STATE.md` | W6 |
| A decision file imported by `CLAUDE.md` | Its rules in force go to `STATE.md` | W2 |

### 3.3 Triggers for end-of-round steps

| Step | Trigger |
|---|---|
| Update `STATE.md` | The goal, a contract, the next step or a stop signal changed |
| Add a line to `DECISIONS.md` | The user decided something, or the agent went against a decided line |
| Edit `ROADMAP.md` | An item was done (delete it) or found (add it) |
| Cold review | Code changed. Loop until no blocking item only when a contract changed; other code gets one pass. (Open: see 5.1) |
| Run tests | Only the suite that covers the changed code |
| Troubleshooting note | A fault that can come again was found |

### 3.4 Rule text changes in `AGENTS.md`

| Present rule | Change |
|---|---|
| Start step 1: read the decision JSON | Read `STATE.md` |
| Quote the full text of each rule and of each related rule | In a message to the user, write the content of the item. Do not give a bare number or section name: the user does not have the agent's context. Add the number only when the user asks. In files and in agent reasoning, use the ID. (User, 2026-11-17) |
| All documents use ASD-STE100 | Proposed: see 3.6 |
| Write `docs/decisions/<date>-<slug>.md` | Add one line to `DECISIONS.md` |
| End of round: write the baseline in `ROADMAP.md` | Deleted |

### 3.5 Plans that other files refer to (proposed 2026-11-17)

| Rule | Reason |
|---|---|
| A file points to a plan by path and item ID. It does not copy the plan text. A message to the user does the opposite: it gives the text. | A copy in a file goes out of date. A message is read one time. |
| An item ID does not change and is not used again. The order of work is one list of IDs in one file. | A change of order then edits one list. |
| The state of an item (open, done, void) is in one file only. | Two state records disagree. |
| When a plan ends, move its rules in force to `STATE.md`, archive the plan, and correct each file that points to it. | A finished plan is history (W2). |
| A script checks that each path written in a Markdown file exists. | A dead pointer is found by a machine, not by a later agent. |

### 3.6 Language by reader (proposed 2026-11-17; replaces "all documents use ASD-STE100")

| Document | Reader | Language |
|---|---|---|
| Build handoff for a low-tier builder | An agent that follows steps | Controlled, simple, imperative. One instruction for each sentence. |
| Goal, state, decisions, design reasoning | The user and an agent that must judge | Natural language, in the user's language. Give the reason for each rule in one line. |

Do not translate files that exist. Apply the rule when a file is written or written again.

### 3.7 Procedures that are not needed in each round (proposed 2026-11-17)

Keep in `AGENTS.md` only what an agent must know before it knows that it needs it: what needs the user's approval, what is forbidden, how to decide for the user, and one trigger line for each procedure. Move each procedure to its own file, loaded when its trigger is true.

| Procedure | Trigger |
|---|---|
| How to write and close a question | A question for the user comes up, or the user answers one |
| How to delegate | A subagent or another agent gets work |
| How to change a data format | A stored format changes |
| How to close a round and push | Code is ready to push |
| Housekeeping of `ROADMAP.md`, `QUESTIONS.md`, dead pointers, size limits | The user asks, or a check script fails |

Checks that a machine can do (dead pointers, size limits) are a script, not a procedure that an agent reads.

The table mixes two kinds (user, 2026-11-17). Keep them apart:

| Kind | Definition | Rows above | When it runs |
|---|---|---|---|
| Task procedure | Needed because of what the task is | Questions, delegation, data format, close and push | When the task meets the trigger |
| Chore | Not related to the task. It keeps the project records in order. | Housekeeping | Not at the end of a task round. Only when the user asks or a check script fails. |

## 4. Steps for this project

Do them in this order. Each step is one commit, so each can be reverted alone.

1. Commit the user's pending edits (`AGENTS.md`, `DIRECTION.md`, `docs/codex-collaboration.md`) as they are. Do not touch the deleted `docs/final-proposal/` files; the user decides.
2. Write `STATE.md` from: `DIRECTION.md` sections 1, 2, 4, 7; the two decision files of 2026-11-11 that `CLAUDE.md` and `ROADMAP.md` use; the 2026-11-17 user decisions (section 6).
3. Write `DECISIONS.md` from the nine files in `docs/decisions/`. Move those files to `archive/docs/decisions/`. Keep `2026-11-11-room-file-json.md` and `2026-11-11-parameter-sidebar.md` content that is a format specification in `workbench/README.md`.
4. Move `DIRECTION.md` sections 5, 6, 8 to `docs/how-to-ask.md`. Delete `DIRECTION.md`.
5. Delete `docs/devlog.md`, the three `claude-decisions.json` files, the empty `DECISIONS.jsonl`. Find the hook that writes `claude-decisions.json` and report it; do not change settings without the user.
6. Remove the baseline section from `ROADMAP.md`. Apply the 2026-11-17 order changes (section 6).
7. Edit `AGENTS.md` as in 3.4. Change `CLAUDE.md` to import `AGENTS.md` and `STATE.md`.
8. `docs/testing.md` and `docs/project-rules.md` cover the parked game only. Add one line in `STATE.md`: read them only when a file outside `workbench/` changes. The workbench test command is `node workbench/feel-check.mjs`.
9. Update agent memory: retire the devlog rule; replace the phone-first rule with the 2026-11-17 performance decision.

Not read, not changed: `SOP.md`, `SOP/`, `NOTES.md`, `docs/submission.md`, `docs/handoff/`.

Reverse: `git revert` the commit of the step. Step 9 has no Git record; the old memory text is in this file's Git history only if it is copied here first.

## 5. Open choices (the default applies if the user says nothing)

| # | Choice | Default | Other option |
|---|---|---|---|
| 5.1 | Cold review depth | Keep the user's rule of 2026-11: loop until no blocking item, for each code batch | Loop only for contract changes; one pass for other code |
| 5.2 | Language rule | 3.6, if the user approves it | Keep ASD-STE100 for all documents |
| 5.3 | Where the procedures of 3.7 live | Plain files under `docs/procedures/`, so each agent type can read them | Claude skills under `.claude/skills/` (other agent types do not load them) |

Withdrawn 2026-11-17: the proposal to cut the full-text quote rule to one sentence. The user needs the text.

## 6. User decisions of 2026-11-17 that step 2 and step 6 record

- Phone frame time is not a gate. Find the upper limit first; keep a lower limit that still reads as the same thing. Quality values can be set one by one, with preset sets. The method is not decided.
- The workbench is a fast test place for the upper limit. Rooms made there can go into the game. Generated maps must be loadable there later. The game does not include the workbench tools.
- Order: layer views move before the light test. One simple picture is assembled early to test the component vocabulary and the room format, with no look tuning.
- No builder starts yet. Fable can write the base of the light design.
- The user's statements are examples of intent unless the user says "decided". The agent confirms the principle first and proposes the method later.

## 7. What was applied on 2026-11-17, and the differences from the plan

| Plan | Applied |
|---|---|
| Delete `docs/devlog.md` | Kept as a short stub. The submitted assignment page links to the path. |
| Move all nine decision files | Moved five. `2026-10-18-tech-stack.md` stays (external link). `2026-10-31-resident-guard-tests.md` stays (basis of `docs/testing.md`). The component order file became `docs/components-plan.md`, because it is a plan in force, not history. |
| Delete the `claude-decisions.json` files | The tracked one is removed from Git and the name is in `.gitignore`. The files stay on disk: a tool outside this repository writes them. |
| Check script and its hook (3.5, 3.7) | Not built. Fable does not write code. Specified as item 31 in `ROADMAP.md`. |
| Language rule (3.6) | Applied to new files: `STATE.md`, `DECISIONS.md`, `docs/procedures/`. Files that exist were not translated. |
| `AGENTS.md` | Cut to about half. Removed text moved word for word to six files in `docs/procedures/`, except the edits in 3.4. |
| Cold review depth (5.1) | Not changed. |

To port this to the template: create the files of 3.1, the six procedure files and the trigger table in `AGENTS.md`, the file map in `STATE.md`, and the rules of 3.5 in the writing section. Use this repository at the commit that adds this section as the worked example.
