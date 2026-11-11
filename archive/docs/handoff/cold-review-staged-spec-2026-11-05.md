# Cold review of the specs (2026-11-05)

Reviewer: a new ChatGPT chat with no history. It read only `docs/spec.md` and `docs/handoff/staged-delivery-2026-11-05.md` (not the code, not the interviews). Task: list core aspects (categories and components) that the specs do not describe or do not assign to a stage. Claude checked the claims it could check; the verdict column shows the result.

## Gaps

| ID | Category | Gap | Verdict (Claude) |
|---|---|---|---|
| G1 | World-generation model | No stage owns the integration of the whole generator (continuous regions, layers, cross-cell continuity, traits, three floors) | Real. Needs a user decision (room generation logic) |
| G2 | Save/data model | No versioned v2 save schema; `docs/spec.md` §7 lacks band value, timer, anomaly | Real. Fix in S2/S3 |
| G3 | Player controller | Stairs, slopes, slides, water, camera effects not owned for new geometry | Real. Add a traversal walk check to S4 and S5 |
| G4 | UI, menus, settings | Title, settings, pause and jump flows not owned for v2 | Partly built: `js/ui.js` has them, v2 shares `main.js`. Add a check in S2 |
| G5 | Game lifecycle | Behaviour after the exit is unclear: free exploration, return, new world, jump isolation | Real. `docs/spec.md` §2.2 says "continue"; §6-§7 end screen and save delete. Needs a user decision |
| G6 | Rendering pipeline | Tile textures, water shading, signs, wet filter not owned for new features | Partly real. Add to S4 acceptance |
| G7 | Performance budgets | Draw calls, triangles, generation work and memory are checked only in S7 | Real. Check budgets in every stage |
| G8 | Test interface | `?test=1` interface for v2 state and generator diagnostics has no owner | Real. Add to S1 |
| G9 | Runtime errors | WebGL context loss, storage failure, asset decode failure | Real but small. Add to S7 |
| G10 | Release | S7 stops before the production switch | By design (Q9). Needs a user decision at S7 |
| G11 | Accessibility | No flashing or motion option; no non-audio guide | Absent. Add a "reduce flashing" setting |
| G12 | Security/privacy | `?test=1` exists in the public build (`dist/index.html` contains it) | Real, low risk. Decide in S7 |

## Contradictions

| ID | Contradiction | Verdict |
|---|---|---|
| C1 | Startup: `docs/spec.md:26` limits time to press Start; the staged spec (Q4) uses first playable frame | Real. Claude's default was wrong. Use both, as two measures |
| C2 | Audio: S6 can be dropped and the score still passes, yet `docs/spec.md` treats audio as core | Real. Make S6 required before the default switch |
| C3 | H6 (same seed, same world in any load order) versus `docs/spec.md` §2.1 (toys depend on oppression at generation time) | Real. Split structure (strictly deterministic) from decoration (may depend on state, never on load order) |
| C4 | Staged S4/S5 add pool-room doors; `docs/spec.md` §2.2.4 says regions are continuous with no door per region | Real. Same root as G1 |
| C5 | Band value and timer are restored on reload but missing from the save list | Same as G2 |
| C6 | S7 prepares but does not deploy; spec §9 and A13 need a public site | By design (Q9) |
| C7 | After-ending exploration undefined | Same as G5 |
| C8 | Three.js loads from a CDN, but A15 says no external JS | Not a contradiction. `dist/index.html` loads Three.js from `cdn.jsdelivr.net/npm/three@0.170.0`; A15 means the project's own files |
| C9 | Deep water cannot be entered, yet the wet filter triggers at depth 0.9 m or more (`docs/spec.md` §3.1, A8) | Not checked. Read the code before deciding |

## Ranked (reviewer)

G1, G3, G2, G7, G10. Claude moves G5 and C2 up because they need a user decision.
