# Decision: rewrite the generator, redesign regions, after-exit flow, no time cap (2026-11-05)

Source: user answers after the cold review (`docs/handoff/cold-review-staged-spec-2026-11-05.md`).

| ID | Decision | Replaces |
|---|---|---|
| E1 | Rewrite the world generator from zero as a new version (name: v3 for now; "some v2 version or v3" per the user). Reuse an existing v1/v2 design when the function stays the same: port it one by one, or add it back as a concept in the new code | the plan in `docs/handoff/staged-delivery-2026-11-05.md` that extends the current v2 (S1, S2 and the "stack traits on v2" parts of S4/S5); `docs/decisions/2026-11-05-interview-d1-d3.md` D2 ("v2 becomes the main line") now applies to the new version |
| E2 | Four atmosphere regions whose theme comes from trait weights (not fixed scenes). The themes themselves must be redesigned | the original four themes (shallow hall, stepped pools, narrow pipe corridor, deep dark pool) as the fixed list in `docs/spec.md` §2.2 |
| E3 | After the exit the end screen offers "continue exploring" or "play again". The save is kept after the exit. The atmosphere value stays at its final value | `docs/spec.md` §6-§7 (end screen clears the save) |
| E4 | No time cap on the main line. The main line must only be completable. Direct walk is about 15-25 min; wandering has no limit | the 30-minute cap in `docs/spec.md` §2.2, gate H2 and fixed decision F04 in the staged spec |

## Consequences (Claude's reading)

- The verified S2 work (bridge search, atomic acceptance, seal links) is not discarded automatically. The first task of the rewrite is an inventory: for each existing design, mark "port", "rebuild differently" or "drop". The user's rule: same function means reuse.
- The staged spec needs a new version for the new generator. Its coverage matrix (100 points) stays valid because it lists player outcomes. Stage content and file lists change. S1 changes from "safe v2 start" to "new generator foundation with the same safety rules".
- Region themes need a design interview before the atmosphere bands (D1) get content.
- E4 removes the hard cap, so gate H2 becomes "the main line can be finished" plus "a direct walk takes about 15-25 min". Check the guide hints so a wandering player is not lost forever.
- Cost to reverse: doc-only now. After code starts, going back to extending v2 means dropping the new generator.

## Cold review items that stay open

G1 (generator integration owner) is answered by E1. G5 and C7 are answered by E3. C2 (audio required), C1 (startup measures), C3 (deterministic structure versus state-dependent decoration), G2 (save schema), G7 (budgets each stage), G8 (test interface), G11 (reduce-flashing option) are resolved with defaults when the staged spec is rewritten.
