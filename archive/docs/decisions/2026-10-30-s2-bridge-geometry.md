# Physical bridge cells

- Inject a copied cell-fragment map before World2 builds its spawn cell.
- Keep the default constructor geometry unchanged.
- Clip passage rooms to their owner cells. Keep each straight flight in its endpoint cell.
- Bind each flight to its actual entry room and its own passage room. Reject missing room IDs.
- Use Q2-aligned passage bounds in both meshing and compiler collision checks.
- Keep the existing three-metre minimum passage width. Outward alignment can add up to Q2.
- Check the rounded passage body against stair side walls. Permit only the intended end opening.

## Verification

- Focused bridge and geometry tests: 19 passed.
- Final geometry fast command: npm run test:fast. Exit 0. Unit 415 passed, 18 skipped. Smoke 12 passed.
- Relevant compiler corpus: six tests passed. All previous successes remain. Compiled 14 of 86. Seed 42 remains one of ten.
- Generator and bridge slow files: 47 passed. This run started before the final passage rounding correction. The compiler corpus was repeated after that correction.
- Real body search found a 131.560-metre route in both directions for the existing seed 42 bridge. This is not atomic ratio acceptance.
- ChatGPT review c2c_7a42 iteration 2 accepted the geometry slice, subject to the final fast exit. That command exited 0.

## Remaining work

- Complete ordered full-bridge witnesses and constrained ladder transitions.
- Improve physical feasibility and validate measured ratios on the final accepted set.
- Add atomic acceptance before game wiring.
- Do not enable geometry-only candidates in the game.

## Reversal

Revert the geometry commit and its tests. No save data, dependency, or deployment changes are needed.
