# S2 game activation

## Decision

- Enable S2 only for `?gen=v2`.
- Plan tiles in two local module Workers. Keep the existing physical acceptance budgets.
- Request the current owner first. Prefetch tiles within the view range.
- Dispatch at most one unfinished job per Worker. Give required owners the next free slot.
- Promote queued prefetch requests without replacing their Promise. Do not interrupt running verification.
- Start the 600 s job watchdog at dispatch. Reject queued and running requests on planner failure.
- Publish each completed tile as one immutable snapshot. Do not publish tentative cuts.
- Build a new World2 from ready snapshots. Cancel old mesh jobs before scheduling new jobs.
- Keep loaded meshes for unchanged ready owners of the same seed. Remove cells whose owners leave the snapshot.
- Keep Player position and progress when a neighboring tile completes.
- Start or continue only after all tiles within 1 m of the target position are ready.
- Block movement into unprepared tiles. End fog before their missing geometry.
- Pin current visible tiles separately from prefetch requests. Evict only completed, unpinned cache entries.
- Hold required owners until activation finishes. Publish a completed result before cache eviction.
- Verify required owner membership in the active World2 before enabling play.
- Keep the previous save and run state until a new world is playable. Restore that state on preparation failure.
- Use one transition lock for new-game and continue actions. Release it after success or failure.
- Keep save data unchanged. Recompute tile plans after a page reload.

## Evidence and limits

- Initial all-neighbor blocking took about 74 s on the local desktop browser.
- Owner-first activation took about 42 s in the first focused source run.
- These timings are local observations. They are not mobile startup limits.
- A real-Worker bridge midpoint reload restored the exact position at -6 m after 129.4 s of Continue waiting.
- A far-save trace found a required owner queued behind one Worker while the other was idle. Use the central dispatch queue to remove that delay.
- Loading runs before activation. Measure frame pacing separately after planning completes.
- A11 passed locally on 2026-10-31: v2 averaged 57.1 fps with 0.87% slow frames at phone size and 4x CPU throttling.
- Source and dist passed both fixed B1 keyboard round trips. Source also passed midpoint save and reload.
- Continue overlap and new-seed request failure with retry passed focused browser checks.
- Keep the fixed seed 42 denominator at ten. Two accepted bridges do not satisfy the other eight borders.
- Complete the baseline pass without reservations first. Run soft rescue only for the remaining borders.
- Keep baseline records and geometry unchanged. Accept rescue candidates only after joint physical verification.
- Preserve original S1 border IDs, draws, cuts, and all physical acceptance checks in both modes.

## Reversal

Remove the S2 client integration from main and cells. Keep the core verifier and its tests.
No save migration is required.
