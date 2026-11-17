# Drop fps and course-assignment limits

Date: 2026-11-09. Status: user direction. Owner: user.

## Decision

1. Remove all fps limits (50 fps floor, 60 fps target, slow-frame ratio).
2. Remove all course-assignment limits (deadline, submission content, GitHub Pages entry, "map generates outward" as an assignment rule).
3. Keep one hard constraint: the game must build into one HTML file.

## Effect

| Item | Change |
|---|---|
| `ROADMAP.md` hard constraints | Four lines replaced by the single-HTML line |
| `ROADMAP.md` to-do "mid-range phone >= 50 fps check" | Deleted |
| Agent memory `assignment-poolcore` | Rewritten to the single-HTML constraint |
| Existing tests and measurement tools (`tools/measure-fps.mjs`, P0/P1 performance baselines) | Not changed. They stay as information, not as gates |
| P2 room generator gate (`2026-11-07-v3-p2-room-generator-gate.md`) | Not changed |

Procedural outward generation stays a product direction from the user's P2 words (G-03), not an assignment rule.

## Reverse cost

Low. Restore the four lines from git history (`git show HEAD~1:ROADMAP.md`) and the memory file.
