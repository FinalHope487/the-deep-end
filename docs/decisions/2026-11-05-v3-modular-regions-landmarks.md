# Decision: v3 regions and landmarks are replaceable modules (2026-11-05)

Source: user answers Q10-Q17, Q45 in `docs/handoff/core-aspect-answers-2026-11-05.md`. Options: `docs/handoff/question-bank-2026-11-05.md`.

| ID | Status | Decision |
|---|---|---|
| Q10 | Selected | Region 1: bright shallow water, open tile floor, sparse columns |
| Q11 | Provisional | Region 1 landmark: wide shallow hall, few columns, dry viewing platform |
| Q12 | Selected | Region 2: floors, stairs into water, open voids, wet and dry platforms |
| Q13 | Selected | Region 2 landmark: multi-level pool hall, partial upper walkway, stairs into shallow water |
| Q14 | Selected | Region 3: narrow and open spaces alternate, cool light and sound |
| Q15 | Selected | Region 3 landmark: big void hall with several high walkways. Keep the other options as alternatives |
| Q16 | Selected | Region 4: large deep pools, empty space, sun and dark contrast. Keep the other options of all 4 regions as alternatives |
| Q17 | Selected | Region 4 landmark: huge deep pool hall, railed high view, faint sun |
| Q45 | Selected | Each landmark keeps a clear identity. Its shape and surroundings change per new world |

## Architecture requirement (user words, Q45)

The user may later propose other designs. Replace a design without large edits to dependent code (highly modular). The user may add regions or change style (Q10).

- Define region themes and landmark designs as replaceable modules.
- Do not put the region count (four) or a landmark geometry into the shared generator contract.
- A new region or a replacement landmark must not need large changes in unrelated modules (generation, path, goal, save, tests).
- Four regions stay the scope now. Do not build a fifth. "Alternative" is a kept candidate, not a delivery duty.

**Replaces**: the fixed four-building plan in `docs/spec.md` §2.2, for v3 only. E2 in `2026-11-05-v3-rewrite-regions-lifecycle.md` stays valid.
**Cost to reverse**: without the module boundary, a landmark change touches generation, path, goal, save and tests. This is the main architecture risk.
