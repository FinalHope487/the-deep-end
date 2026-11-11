# Archive

NOT CURRENT. Do not read a file here unless the user or a delegation names it. Do not use a file here as a goal, a rule or a plan.

Moved on 2026-11-11 by user direction: keep cold-start agents on the current goal (`DIRECTION.md`, `docs/decisions/2026-11-11-*.md`).

## Rule that was used

A document stays out of the archive only if a cold-start agent needs it for the sample-room track or it is a standing project rule. All other documents were moved. The decision used the file name and the date, not a full read.

| Moved | Why |
|---|---|
| Generator v1, v2 and v3 plans, decisions, baselines, acceptance and measurement files | Layout generator work is paused |
| The P2 gate and the 2026-11-05 interview files | Replaced by the sample-room decision |
| Research files (market, genre) | Not used by the workbench |
| Old root handoff files, `CLAUDE.md.bak`, `checks.sh` | Old rules and one-time scripts |
| `ROADMAP.md`, `ROADMAP/` and `docs/devlog.md` up to 2026-11-11 | History; new short files replace them |
| `docs/spec.md`, `docs/screenshots/` | The v1 game, not the benchmark |
| `picture-scenes-plan-summary.md`, `direction-discussion-2026-11-11.md`, `poolcore-water-plan.md` | Plans for each picture; replaced by components first |

## Paths

A file keeps its old path below `archive/`. Example: `archive/docs/decisions/2026-11-07-v3-p2-room-generator-gate.md`.

Comments in `js/`, `tests/` and `tools/` still give the old paths. Add `archive/` in front.

## Move a file back

`git mv archive/<path> <path>`. Do this when layout generator work or game work starts again, or when the user tells you.
