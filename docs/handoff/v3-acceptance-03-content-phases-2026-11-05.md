# The Deep End — v3 Acceptance: Content Phases (P3W, P3V, P3S, P3M, P3A, P3U)

Status: PROPOSED. Part 3 of 4. Read Parts 1 and 2 first. Common rules CP-01 to CP-24 apply to every phase here.
Date: 2026-11-05.

Every content phase also inherits:

- All checks of P2 and P2M that still apply (regression ID `<phase>-R01`).
- A measured GPU memory ceiling, approved by the user before the phase starts. The old guessed values (96/112/120/132/140/144 MiB) are NOT targets (Part 1, section 7).
- An approved screenshot manifest with frozen coordinates (Part 1, section 9).
- The P2M route and placeholder modules stay valid (`<phase>-G0x`: the four zones, exit, save and Continue/Play Again flows still pass).

Per-phase blocks list only what is new.

---

## 1. P3W — Water

Goal: pools, shallow flooding and deep water integrated into the continuous space. Water is walkable or blocking by one rule. No real-time reflection or refraction (GB-09).

Allowed paths (PROPOSED): `js/v3/water/`, water use inside `js/v3/modules/`, `tests/`, `docs/`.
Forbidden: journey code except through contracts, v1 files, frozen `versions/`.

| ID | Check | Pass condition |
|---|---|---|
| P3W-W01 | Water classes | Dry and shallow are walkable. Deep water is NOT enterable (`2026-11-05-v3-core-space-water.md`, `docs/spec.md` 3.1). Ordinary pools mix shallow and deep (Q7). Special flooded spaces keep their own level rule. A deep flooded hall has at least one wadeable route (Q25) |
| P3W-W02 | Boundary | The deep-water edge is visible and has a safe passage nearby (SC-03B) |
| P3W-W03 | Safety | Tests: deep-water boundary collision; escape from shallow water; recovery from an illegal position; deep water is never a legal spawn or save position |
| P3W-W04 | Shallow look | Shallow water shows floor tile and light without real-time reflection |
| P3W-W05 | Water in space | Water appears inside real rooms with walls, not on bare floor |
| P3W-W06 | Reachability | Reachability test (P2-S06) stays true with water placed |
| P3W-W07 | Determinism | Same seed gives same water layout, any query order |
| P3W-W08 | Sound hook | Water gives a hook for sound. Full audio is P3U |
| P3W-G06 | Main line | The four zones and the exit stay reachable (P2M-J12 re-run) |
| P3W-G07 | Placeholders | P2M placeholder modules stay valid, and swapping still needs no journey edit (P2M-J14) |
| P3W-M01 | Memory | GPU and cache memory under the approved P3W ceiling |
| P3W-P01 | Performance | GB-01 to GB-04 hold. Water adds no per-frame allocation |
| P3W-SV01 | Save | Water state is not saved. It is rebuilt from the seed |
| P3W-U01 | User check | The user answers SC-03A/B |
| P3W-V01 | Preview | `?gen=v3&phase=p3w` loads the frozen artifact |
| P3W-R01 | Regression | All P2 and P2M checks green |

Screenshots: SC-03A, SC-03B.

N/A in P3W: stairs, bridges, voids, special architecture, final landmarks, final atmosphere, full audio.

---

## 2. P3V — Floors, stairs, bridges, voids

Goal: multi-level space. Stairs enter water. Walkways cross over lower spaces. Voids are open and safe.

Allowed paths (PROPOSED): `js/v3/vertical/`, `js/v3/modules/`, `tests/`, `docs/`.
Forbidden: journey code except through contracts, water rules (changes need a decision file), frozen `versions/`.

| ID | Check | Pass condition |
|---|---|---|
| P3V-V01 | Stairs | Stairs connect two levels. Player can climb and descend with no catch |
| P3V-V02 | Stairs to water | Stairs can enter shallow water (SC-04A) |
| P3V-V03 | Bridges | A walkway crosses a lower space and has railings or clear edges (SC-04B) |
| P3V-V04 | Voids | Voids are open and visible. Falling is either impossible or recoverable (the rule is stated in the decision file) |
| P3V-V05 | Multilevel travel | Every level of every space connects to the start (reachability test) |
| P3V-V06 | Collision | No clipping on stairs, ramps or railing ends |
| P3V-V07 | Slides | If slides are included, they end in a safe place. A test confirms the exit tile is safe |
| P3V-V08 | Height range | Level heights are within the documented range |
| P3V-V09 | Determinism | Same seed gives same vertical layout |
| P3V-G06 | Main line | Zones and exit stay reachable on the multilevel world |
| P3V-G07 | Placeholders | P2M placeholder modules stay valid |
| P3V-M01 | Memory | Under the approved P3V ceiling |
| P3V-P01 | Performance | GB-01 to GB-04 hold with the most complex level in view |
| P3V-U01 | User check | The user answers SC-04A/B |
| P3V-U02 | Motion | Stairs do not cause nausea-prone camera bob. Reduced-motion rule honoured |
| P3V-SV01 | Save | Level position saves and restores |
| P3V-V99 | Preview | `?gen=v3&phase=p3v` loads the frozen artifact |
| P3V-R01 | Regression | All earlier checks green |

Screenshots: SC-04A, SC-04B.

N/A in P3V: special architecture, final landmarks, final atmosphere, full audio.

---

## 3. P3S — Special architecture

Goal: reusable special features: ceiling openings, sunlight through structure, large windows, photograph-style views. These are modules for the later landmark work.

Allowed paths (PROPOSED): `js/v3/special/`, `tests/`, `docs/`.

| ID | Check | Pass condition |
|---|---|---|
| P3S-A01 | Ceiling opening | A real opening in the ceiling with visible surrounding structure (SC-05A) |
| P3S-A02 | Sunlight | A light beam enters a dark room using baked or faked light, no real-time shadow (SC-05B, GB-09, GB-10) |
| P3S-A03 | Reusable | Each feature is a module usable by any region (Q10, AR-04) |
| P3S-A04 | Wonder rate | D3: a normal direct journey meets about 1–2 wonders. Report the distribution over the NP-09 corpus (share of journeys with 0, 1, 2, 3 or more). The pass share is PROPOSED and needs approval. An average alone can hide many zeros |
| P3S-A05 | Determinism | Same seed gives same features |
| P3S-A06 | No overuse | A feature does not appear in more than the agreed share of spaces (value PROPOSED, set from the corpus) |
| P3S-G06 | Main line | Zones and exit stay reachable |
| P3S-M01 | Memory | Under the approved P3S ceiling |
| P3S-P01 | Performance | GB-01 to GB-04 hold. Draw calls stay at or under 100 |
| P3S-U01 | User check | The user answers SC-05A/B |
| P3S-V01 | Preview | `?gen=v3&phase=p3s` loads the frozen artifact |
| P3S-R01 | Regression | All earlier checks green |

Screenshots: SC-05A, SC-05B.

N/A in P3S: final landmarks, final atmosphere, full audio.

---

## 4. P3M — Final region and landmark modules

Goal: replace the P2M placeholders with the official region themes and landmark modules. Do NOT rewrite journey code, the save format or the generator.

Region and landmark designs (from `2026-11-05-v3-modular-regions-landmarks.md`):

| Region | Theme | Landmark |
|---|---|---|
| 1 | Bright shallow water, open tile floor, sparse columns | Wide shallow hall, few columns, dry viewing platform (Q11 is PROVISIONAL: wait for the user's final confirmation before acceptance) |
| 2 | Floors, stairs into water, open voids, wet and dry platforms | Multi-level pool hall, partial upper walkway, stairs into shallow water |
| 3 | Narrow and open spaces alternate, cool light and sound | Big void hall with several high walkways |
| 4 | Large deep pools, empty space, sun and dark contrast | Huge deep pool hall, railed high view, faint sun |

Allowed paths (PROPOSED): `js/v3/modules/regions/`, `js/v3/modules/landmarks/`, the module registry file, `tests/`, `docs/`.
Forbidden: `js/v3/journey/`, `js/v3/save/`, `js/v3/core/`. A change there means P3M broke the module boundary and must be reported.

| ID | Check | Pass condition |
|---|---|---|
| P3M-M01 | Boundary diff | `git diff` for P3M touches no forbidden path |
| P3M-M02 | Registry | Final modules replace placeholders only in the registry |
| P3M-M03 | Identity | Each landmark has a clear identity. Its shape and surroundings change per seed (Q45) |
| P3M-M04 | Four themes | Each region shows the weighted traits above, not one fixed room type (E2) |
| P3M-M05 | Replace test | A test swaps one final landmark for a stub. No other module changes (AR-10) |
| P3M-M06 | Add-region test | Test fifth region passes still (AR-05). Not shipped |
| P3M-M07 | Alternatives | Rejected options stay in the decision file as candidates, not built |
| P3M-G06 | Main line | All four zones and the exit pass the P2M tests unchanged |
| P3M-G07 | Save | P2M save files still load (same format version) |
| P3M-G08 | Reachability | Reachability corpus (NP-09) passes with final landmarks |
| P3M-G09 | Determinism | Same seed gives same landmarks |
| P3M-M10 | Memory | Under the approved P3M ceiling. Largest landmark in view is measured |
| P3M-P01 | Performance | GB-01 to GB-04 hold at the heaviest landmark |
| P3M-F01 | Finds | The final 12 finds (P2M-F01) are placed reachably in the final modules, including across floors. Tests: fixed seeds, reachability of every find |
| P3M-U01 | User check | The user answers SC-06A/B and approves each region's look |
| P3M-V01 | Preview | `?gen=v3&phase=p3m` loads the frozen artifact |
| P3M-R01 | Regression | All earlier checks green |

Screenshots: SC-06A, SC-06B.

N/A in P3M: final atmosphere, full audio.

---

## 5. P3A — Atmosphere

Goal: descending atmosphere bands, figures, local effects, visual navigation. Reversible atmosphere effects may change. Structure may not (Part 1, section 3).

Allowed paths (PROPOSED): `js/v3/atmosphere/`, module-owned effect files, `tests/`, `docs/`.

| ID | Check | Pass condition |
|---|---|---|
| P3A-T01 | Bands | Each region has an atmosphere band. The value descends along the main line (D1) |
| P3A-T02 | Floors | Atmosphere stops descending at each floor until the next region |
| P3A-T03 | Numbers | Band values are approved by the user before the phase (OD-07) |
| P3A-T04 | No structure change | Atmosphere does not change walls, routes or landmarks. A test compares structure at two atmosphere values |
| P3A-T11 | D1 state machine | Fixed time-series tests: value falls inside a region over time; entering the next region early moves quickly to its new cap; the value never rises; long stay, revisit, exit, save and load, and unload and rebuild keep these rules; an anomaly (odd stay) changes only a reversible layer and never the value |
| P3A-T05 | Final value | After the exit, the final atmosphere is kept (E3) |
| P3A-T06 | Figures | Figures follow the existing safety rules: no jump scare, no blocking path |
| P3A-T07 | Lights | Local light effects are baked or faked (GB-10) |
| P3A-T08 | Navigation | Visual landmarks help orientation without a map. Guide strength stays fixed (Q31) |
| P3A-T09 | Early and late look | Early is bright and calm. Late is cool and oppressive (SC-07A/B) |
| P3A-T10 | Decor creation | Decor that reads atmosphere at creation is rebuilt correctly after unload and return |
| P3A-G06 | Main line | Zones and exit stay reachable |
| P3A-M01 | Memory | Under the approved P3A ceiling |
| P3A-P01 | Performance | GB-01 to GB-04 hold with all effects |
| P3A-S01 | Reduced effects | A reduced-effects setting removes flashing and strong motion |
| P3A-U01 | User check | The user answers SC-07A/B |
| P3A-V01 | Preview | `?gen=v3&phase=p3a` loads the frozen artifact |
| P3A-R01 | Regression | All earlier checks green |

Screenshots: SC-07A, SC-07B.

N/A in P3A: full audio, final UI.

---

## 6. P3U — Audio, interface, controls, accessibility

Goal: complete audio, readable interface, controls for both orientations, accessibility settings.

Allowed paths (PROPOSED): `js/v3/audio/`, `js/v3/ui/`, `assets/` audio files, `tests/`, `docs/`.

| ID | Check | Pass condition |
|---|---|---|
| P3U-A02 | Music direction | Directional music does not lead toward the next region (Q29) |
| P3U-A03 | Water sound | Water gives positional or region sound using the P3W hook |
| P3U-A04 | Start | No sound before a user gesture. Audio resumes after pause |
| P3U-A05 | Volume | Master volume setting works and is shared across previews (VP-08) |
| P3U-A06 | Safety | No sudden loud peak. A level test checks peak against the agreed limit (value PROPOSED) |
| P3U-I01 | Orientation | Portrait and landscape both playable (Q39) |
| P3U-I02 | Pause | Pause on return from background (Q40) |
| P3U-I03 | Settings | Volume, quality, text size, contrast, show FPS readable and persistent (Q42) |
| P3U-I04 | First-use hints | Short hints on first use only (Q43) |
| P3U-I05 | No gamepad, no puzzle | Not required (Q33, Q34) |
| P3U-I06 | Text size | Text stays readable at the largest setting without overlap |
| P3U-I07 | Contrast | The contrast setting raises text contrast. A check measures ratio (value PROPOSED, 4.5:1) |
| P3U-I08 | Keyboard | All menus work by keyboard |
| P3U-I09 | Touch targets | Touch targets meet the agreed size (value PROPOSED, 44 CSS px) |
| P3U-F01 | Pick-up UI | Pick-up works by touch and by mouse or E. Name and sound show as in `docs/spec.md` section 4 |
| P3U-G06 | Main line | Zones, exit and save flows still pass |
| P3U-M01 | Memory | Under the approved P3U ceiling. Audio buffers released on pause where possible |
| P3U-P01 | Performance | GB-01 to GB-04 hold. Audio decode does not stall the main thread past GB-05 |
| P3U-U01 | User check | The user answers SC-08A/B on a real phone |
| P3U-D01 | Device | Touch and performance claims come from a physical target device (GB-12) |
| P3U-V01 | Preview | `?gen=v3&phase=p3u` loads the frozen artifact |
| P3U-R01 | Regression | All earlier checks green |

Screenshots: SC-08A, SC-08B.

## 7. Selected decisions that need their own check

Each row names the phase that owns the check. Visual items are judged by the user from a fixed screenshot or fixture (CP-20).

| Decision | Owner | Check |
|---|---|---|
| Q5 wide and narrow bridges | P3V | Fixture with both widths, both walkable |
| Q7 ordinary pools mix shallow and deep | P3W | Corpus share of pool rooms with both |
| Q8 occasional usable special stairs and slides | P3V | Corpus count and a usability test |
| Q21 dead ends hold a small item | P2M | Corpus: every dead end above the agreed length holds one |
| Q25 deep flooded hall has a wadeable route | P3W | Reachability inside the hall |
| Q26 main line sometimes forces a floor change | P3V | Corpus share of journeys with a forced change |
| Q27 every sunbeam has a visible source | P3S | Fixture check of source and beam pairing |
| Q28 silent space ends, ambience returns | P3U | Scripted audio-state test |
| Q30 figures act locally | P3A | Fixture, no path block |
| Q32 pause menu lists visited zones, no map | P3U | UI check: list present, map absent |
| Q41 navigable with sound off | P3U | Muted route test with signs and lights |
| Q20 auto quality changes without a notice | P3U | Scripted slow-frame test, no popup |

End of Part 3.
