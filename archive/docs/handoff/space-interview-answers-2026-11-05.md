# Space interview answers, Batch 0 (user, 2026-11-05)

> **IMMUTABLE SOURCE RECORD.** This file holds the user's own answers. Do not edit, reword, reorder or delete any line. Edit it only if the user's task from the start is to modify this file. Put derived work in other files. Later answers go in new dated files.

Questions designed by ChatGPT (task `c2c_f4a9`) from the user's view, relayed by Claude. Applies to the new generator (decision E1 in `docs/decisions/2026-11-05-v3-rewrite-regions-lifecycle.md`).

## User's basic view (own words, summarised)

- Space must be generated continuously, not as rooms joined by corridors.
- Only when an interior is subdivided do things differ: wall against wall, or large solid regions.
- Two rooms need not be joined by a corridor. A corridor can be built by the continuous space itself. Continuous doorways and flooded areas are also fine.
- The user wants to be interviewed before each stage.

## Answers

| Q | Topic | Answer |
|---|---|---|
| Q1 | How space continues | A (floor, water or ceiling extends directly) and B (walls and doorways, the other part is found after passing). C (corner, height change, columns, ceiling height separate spaces) also wanted, with the note: "要審慎考慮如何實作否則很容易矯枉過正" (think carefully about how to build it, or it is easy to overdo) |
| Q2 | Large solid mass | Not the options. The user means filler walls only: to make a rectangular space, solid wall is added in the non-rectangular leftover parts inside it, and no rooms are generated in those gaps. The user says this is a reference, not an implementation instruction |
| Q3 | Passages | A (a passage is a naturally extending narrow space), B (narrow hole in a thick wall), C (hall extends straight to the next hall). Note on C: "需要審慎拿捏使用時機" (choose carefully when to use it) |
| Q4 | Reachability | A: the main line is always reachable; other places may be unreachable |
| Q5 | Scale change | C: gradual and sudden changes alternate |
| Q6 | Role of water | B (shallow water is walkable and links places). Also: "照圖片集和普遍poolcore的形象" (follow the photo set and the common poolcore image) |
| Q7 | Heights | A (upper level has only part walkways over an open hall), B (from one level you see stairs, water or rooms of other levels), C (some areas are fully separated between levels), D (some high or deep spaces are only distant views) |
| Q8 | Regular versus irregular | B: mostly irregular; regular long corridors and colonnades are an occasional special sight |

## Links to earlier records

- Amendment 1 (regular long corridors MUST be generatable) still holds. Q8 sets how often they appear: occasionally.
- Q6 adds no new rule beyond B; the photo set stays the reference for water roles.
