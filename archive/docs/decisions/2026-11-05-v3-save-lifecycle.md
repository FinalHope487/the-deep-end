# Decision: v3 save, menu and ending lifecycle (2026-11-05)

Source: user answers Q18, Q35-Q38 in `docs/handoff/core-aspect-answers-2026-11-05.md`. Builds on E3 in `2026-11-05-v3-rewrite-regions-lifecycle.md`.

| ID | Decision |
|---|---|
| Q18 | After the main line, "Continue" resumes at the last free-explore position |
| Q35 | Keep one world. Warn before "play again" replaces it |
| Q36 | User words: "取代v1前不管玩家存檔" (before v1 is replaced, do not handle player saves) |
| Q37 | Title screen stays simple Start / Continue. Show an extra screen only when needed |
| Q38 | Entering the exit again shows the result screen, then the player chooses to continue |

## Q36 limit

- This fixes only WHEN. Do not migrate or replace v1 player saves before the v1 replacement stage.
- It does not decide HOW. Do not read it as: delete, auto-migrate or overwrite saves. A step that can make a valid save unreadable needs a new user answer. See ROADMAP.

## Flow (Q18, Q35, Q38 with E3)

| Event | Result |
|---|---|
| First exit | Result screen. World and save stay |
| Continue exploring | Same world |
| Exit again | Result screen again |
| Close, then Continue | Resume at last free-explore position |
| Play again | Warn that the old world is replaced, then create the new one |

## Cost to reverse

Touches save data and user progress. Replaces `docs/spec.md` §7 line "reaching the result clears the save" (see E3).
