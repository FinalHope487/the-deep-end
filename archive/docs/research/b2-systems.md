# Part B2 — systems: success cases and techniques

Date: 2026-11-09. Writer: Claude. Reviewer: ChatGPT (task c2c_rsRvB, rounds 1 and 2). Spec: `00-spec.md` section 5.

## Rules used

- A case qualifies when it has (1) public success data (sales, player count, major award or critic score) AND (2) a developer or critic source that credits this system. A technical talk that only shows how a system works is not a credit.
- Each system needs 2 to 4 qualified cases. With fewer than 2, the system is marked "not proven as a success cause".
- Tiers: O official or developer, R research, M media or critic, C community. Metacritic figures come from archived pages and can change. SteamSpy figures are estimates.
- "Credit" columns state what a source says. They do not prove that the system caused the success.

## 1 Procedural map generation

| Game | Public data | Credit to the system | What the system does |
|---|---|---|---|
| Dead Cells | more than 10 million copies (2023-06, developer press release) | GameGrin and Wccftech (9/10) reviews: generated areas feel handmade; method in deepnight (Motion Twin) "hybrid approach" article | hand-made room templates placed on a designer-made graph per biome; generation varies rooms, not the level structure |
| Spelunky (XBLA 2012) / Spelunky 2 (2020) | Metacritic 87 (Xbox 360), 90 (PC); Spelunky 2 Steam owners 1–2 million (SteamSpy estimate) | Giant Bomb (4/5) and GamesRadar reviews: layouts reshuffle each run and stay balanced; method in Yu and Hull GDC 2011 post-mortem and Yu GDC 2021 "One More Run" | 4 x 4 room grid; a guaranteed solution path first, then hand-made room templates with random parts |
| Minecraft | 350 million copies, best-selling video game (Guinness World Records, 2025-04) | Game Informer review: generated world as unrivalled content generation; GameSpot review: each new randomly generated world takes hours | noise-based terrain in chunks; an endless world from a seed (Notch, "Terrain generation, Part 1") |

Counter-example: Hades uses hand-made rooms in random order; randomness is in sequence, not in geometry.

| Technique | Use | Strength | Weakness | Fits when |
|---|---|---|---|---|
| grid + room templates | Spelunky | readable; designer control per room | grid can show | small levels with a required path |
| graph + room templates | Dead Cells | designer controls pacing and order | less spatial surprise | runs with set biome order and pacing |
| noise terrain | Minecraft | endless, cheap per chunk | weak structure, needs extra features | open worlds without set routes |
| wave function collapse | Townscaper, Bad North | local rules give coherent detail | global structure is hard | tile sets with clear adjacency rules |
| BSP rooms and corridors | classic roguelikes | simple, always connected | box-like rooms | fast prototypes, grid dungeons |
| cyclic graph (Dormans) | Unexplored | loops and lock-key structure | complex to tune | exploration with backtracking and keys |

Sources: https://www.gamegrin.com/reviews/dead-cells-review/ (M); https://wccftech.com/review/dead-cells-dont-lose-your-head (M); https://giantbomb.com/reviews/spelunky-review (M); https://www.gamesradar.com/uk/spelunky-review (M); https://deepnight.net/tutorial/the-level-design-of-dead-cells-a-hybrid-approach/ (O); https://www.gamedeveloper.com/business/dead-cells-has-topped-10-million-sales-worldwide (M); https://gamedeveloper.com/design/video-a-postmortem-look-at-the-making-of-i-spelunky-i-hd (M); https://howtomarketagame.com/2021/07/22/gdc-2021-one-more-run-the-making-of-spelunky-2-with-derek-yu/ (M); https://legacy.prod.metacritic.com/game/xbox-360/spelunky (M); https://steamspy.com/dev/Mossmouth (C); https://www.guinnessworldrecords.com/world-records/best-selling-video-game (M); https://gameinformer.com/games/minecraft_xbox_360_edition/b/pc/archive/2011/11/22/review (M); https://www.gamespot.com/reviews/minecraft-review/1900-6346734/ (M); http://notch.tumblr.com/post/3746989361/terrain-generation-part-1 (O)

## 2 Lighting and atmosphere rendering

| Game | Public data | Credit to the system | What the system does |
|---|---|---|---|
| INSIDE | The Game Awards 2016: Best Art Direction and Best Independent Game | Gamereactor (9/10) and Hardcore Gamer reviews single out the light and shadow; method in Gjoel, Svendsen, GDC 2016 | separate diffuse, specular and bounce; local volumetric light with shadows; dithering against banding |
| Team Fortress 2 | Metacritic 92 (PC) | critics name the art style as the main difference; method in Mitchell, Francke, Eng, NPAR 2007 | warped diffuse and rim light for readable silhouettes |
| Journey | BAFTA 2013: five awards incl. Artistic Achievement; Game Developers Choice 2013 Game of the Year | Game Informer review: "visual stunner", credits the sand movement technology; method in John Edwards, GDC 2013 | stylised sand shading: glitter, normal-map ripples, wind |

| Technique | Use | Strength | Weakness | Fits when |
|---|---|---|---|---|
| baked lightmaps | static scenes | high quality at low run cost | no change at run time; bake time | fixed architecture and light |
| light probes | moving objects in baked scenes | cheap indirect light on dynamic objects | low detail; leaks at walls | few dynamic objects in static rooms |
| volumetric fog and light | INSIDE | strong depth and mood | cost; banding without dithering | dark, hazy spaces |
| screen-space AO and reflections | many 3D games | no pre-bake | missing data off screen | dense close-range scenes |
| real-time ray-traced GI | high-end PC and console | correct dynamic bounce light | high cost; noise | hardware with ray-tracing support |
| non-photorealistic shading | TF2, Journey | readable, ages well | needs a consistent art direction | stylised games |

Sources: https://gdcvault.com/play/1023002 (O); https://80.lv/articles/the-rendering-of-inside-low-complexity-high-fidelity (M); https://gameinformer.com/b/news/archive/2016/12/01/the-game-awards-2016-winners-news-and-reveals.aspx (M); https://www.gamereactor.eu/inside-review/ (M); https://hardcoregamer.com/reviews/review-inside/214397/ (M); https://doi.org/10.1145/1281500.1281666 (R); https://legacy.prod.metacritic.com/game/pc/team-fortress-2 (M); https://www.bafta.org/media-centre/press-releases/british-academy-games-awards-in-2013-winners-announced (O); https://www.imdb.com/title/tt1821474/awards (C); https://gameinformer.com/games/journey/b/ps3/archive/2015/07/21/journey-review-beauty-trumps-complexity (M); https://gdcvault.com/play/1017742/Sand-Rendering-in (O)

## 3 Water rendering

| Game | Public data | Credit to the system | What the system does |
|---|---|---|---|
| Sea of Thieves | 40 million players (Rare, 2024-04, before the PS5 release) | Press Start and MobileSyrup reviews single out the water (spray, foam, rolling waves); method in Rare, SIGGRAPH 2018 "The Technical Art of Sea of Thieves" | FFT ocean spectrum (Tessendorf), stylised non-PBR shading, foam and subsurface tint |
| Assassin's Creed IV: Black Flag | Metacritic 88 (PS3); GameSpot 9/10 | GameSpot: water effects are part of the pleasure of sailing; GamesRadar: seas and storm swells | ocean waves and storm states, spray, light on water around naval play |

Status: 2 qualified cases. The reviews do not name the wave algorithm of Black Flag.

| Technique | Use | Strength | Weakness | Fits when |
|---|---|---|---|---|
| sum of Gerstner waves | many games | simple, controllable shape | repeats; few wave sizes | calm or stylised water, small areas |
| FFT spectrum | Sea of Thieves | realistic open sea; many wave sizes | cost; needs tuning | large open oceans |
| flow maps | rivers, pools | directed flow at low cost | static pattern | channels and streams |
| planar reflection | indoor pools | exact reflection | extra render pass per plane | one flat water plane in view |
| screen-space reflection | many 3D games | cheap, works on any surface | missing data off screen | large water with varied view |
| refraction and caustics | pools, shallows | strong sense of clear water | cost; can look noisy | clear shallow water |
| height-field or shallow-water simulation | Atlas (GDC 2019) | real interaction with objects | cost; limited area | water the player must change or disturb |

Sources: https://history.siggraph.org/wp-content/uploads/2022/09/2018-Talks-Ang_The-Technical-Art-of-Sea-of-Thieves.pdf (O); https://press-start.com.au/?p=59431 (M); https://mobilesyrup.com/2018/03/30/sea-of-thieves-review/ (M); https://videogameschronicle.com/news/rare-says-sea-of-thieves-has-attracted-40-million-players-ahead-of-ps5-release (M); https://www.metacritic.com/game/assassins-creed-iv-black-flag/critic-reviews/ (M); https://www.gamespot.com/reviews/assassin-s-creed-iv-black-flag-review/1900-6415509/ (M); https://www.gamesradar.com/assassins-creed-iv-black-flag-review/ (M); https://gpuopen.com/gdc-presentations/2019/gdc-2019-agtd6-interactive-water-simulation-in-atlas.pdf (O)

## 4 Ambient audio

| Game | Public data | Credit to the system | What the system does |
|---|---|---|---|
| Alien: Isolation | 2.11 million copies (Sega, FY to 2015-03); BAFTA 2015 Audio Achievement | PC Gamer "Seeing with your ears" (audio team on sound as information); The Sound Architect interview (Cooper, Bullock) | layered ambience with deliberate ambiguity; tension changes with alien and player state; original film sound effects |
| Hellblade: Senua's Sacrifice | BAFTA 2018: five awards incl. Audio Achievement (David García Díaz) | Ninja Theory on binaural voices (PCGamesN) | binaural recording of the voices around the player's head; voices also warn of attacks in combat |

| Technique | Use | Strength | Weakness | Fits when |
|---|---|---|---|---|
| layered ambient beds | most games | continuous mood, cheap | can loop audibly | every space |
| random one-shots | Alien: Isolation | variation; keeps the player alert | needs rules against clutter | tense or empty spaces |
| HRTF and binaural | Hellblade | exact direction on headphones | weak on speakers | headphone play; close voices |
| occlusion and obstruction | many 3D games | sound follows the architecture | needs geometry queries | games with walls and rooms that matter |
| adaptive music | Alien: Isolation | follows game state | composition and mix cost | tension that rises and falls |
| procedural audio | engines, ambience | endless variation, small size | can sound synthetic | wind, water, machines |

Sources: https://gamespot.com/articles/alien-isolation-sells-2-1-million/1100-6427238/ (M); https://www.bafta.org/media-centre/press-releases/british-academy-games-awards-winners-announced-2/ (O); https://pcgamer.com/the-audio-of-alien-isolation (M); https://www.thesoundarchitect.co.uk/alienisolation/ (M); https://www.bafta.org/media-centre/press-releases/games-awards-winners-announced-2018 (O); https://www.pcgamesn.com/hellblade-senuas-sacrifice/hellblade-3d-sound (M)

## 5 Enemy and chase AI

| Game | Public data | Credit to the system | What the system does |
|---|---|---|---|
| Alien: Isolation | 2.11 million copies | Creative Assembly on the two-layer AI (PCGamesN; Game Informer 2025) | a director knows where the player is and keeps the alien near; the alien itself does not know and must search |
| Left 4 Dead | Metacritic 89 (PC) | GamesRadar and Giant Bomb reviews credit the Director for tension and replay value; method in Booth 2009, "The AI Systems of Left 4 Dead" | AI Director paces by an estimate of player stress |
| F.E.A.R. | Metacritic 88 (PC); reviews single out the AI | Orkin GDC 2006, goal-oriented action planning; Worthplaying review | planner gives squads flank and cover behaviour |

| Technique | Use | Strength | Weakness | Fits when |
|---|---|---|---|---|
| navigation mesh + pathfinding (A*) | almost all 3D games | base of all movement; handles complex rooms | must rebuild when geometry changes | any agent that walks |
| finite state machine | many enemies | simple, easy to debug | grows unclear with many states | few clear behaviours |
| behaviour tree | Alien: Isolation (alien) | modular; designers can read it | can feel scripted | many behaviours with priorities |
| GOAP | F.E.A.R. | emergent plans from goals | cost; hard to tune | squads, tactical combat |
| utility AI | many games | smooth choice between options | score tuning is hard | agents that weigh many needs |
| director layer | Left 4 Dead, Alien: Isolation | controls pacing over time | can feel unfair if seen | horror, co-op, chase pacing |

Sources: https://www.pcgamesn.com/interview-creative-assembly-alien-isolations-terrifying-alien-ai (M); https://gameinformer.com/retrospective/2025/06/24/how-creative-assembly-built-its-perfectly-evolved-ai-xenomorph (M); https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf (O); https://gamesradar.com/left-4-dead-review (M); https://giantbomb.com/reviews/left-4-dead-review/1900-86/ (M); https://legacy.prod.metacritic.com/game/pc/left-4-dead (M); https://www.techspot.com/products/pc-games/fear.86958/ (M); https://worthplaying.com/article/2005/10/28/reviews/28594 (M)

## 6 Movement feel

| Game | Public data | Credit to the system | What the system does |
|---|---|---|---|
| Celeste | more than 500,000 copies in 2018; The Game Awards 2018 Best Independent Game and Games for Impact | Maddy Thorson "Celeste and Forgiveness" | input forgiveness: coyote time, jump buffer, corner correction, dash freeze and shake |
| Titanfall 2 | Metacritic 89 (Xbox One) | GameSpot credits the movement loop; GamesRadar: traversal is fundamental to combat, navigation and level design | traversal system: wall-running, sliding, double jump, vaulting |

Status: 2 qualified cases. Celeste is about input response; Titanfall 2 is about traversal design.

| Technique | Use | Strength | Weakness | Fits when |
|---|---|---|---|---|
| coyote time | Celeste | forgives late jumps | invisible; can hide level errors | precise platforming |
| jump buffer | Celeste | forgives early input | can trigger unwanted jumps | fast input sequences |
| variable jump height | most platformers | fine control | harder to learn | jump-heavy play |
| acceleration curves | all movement | sets weight and feel | tuning per surface | every controller |
| hit-stop | action games | impact feel | breaks flow if overused | combat contacts |
| camera lag and lead | 3D games | smooth view; shows path ahead | motion sickness if wrong | fast movement |
| wall-run, slide, vault | Titanfall 2 | high speed and route choice | levels must support it | open, vertical levels |

Sources: https://maddymakesgames.com/articles/celeste_and_forgiveness/ (O); https://www.nintendolife.com/news/2018/12/indie_hit_celeste_sold_over_500000_copies_in_2018 (M); https://thegameawards.com/news/god-war-wins-game-year (O); https://www.metacritic.com/game/titanfall-2/ (M); https://www.gamespot.com/reviews/titanfall-2-review/1900-6416561/ (M); https://www.gamesradar.com/titanfall-2-review/ (M)

## 7 Environmental storytelling

| Game | Public data | Credit to the system | What the system does |
|---|---|---|---|
| BioShock | BAFTA Video Games Awards 2007 (ceremony 2007-10-23): Best Game | The Guardian (2007) on discovering the history of Rapture as a storytelling strength; GameSpot review | damage, signs and spatial detail show what happened in the city |
| What Remains of Edith Finch | BAFTA 2018 Best Game | Ian Dallas (Giant Sparrow): the house is the frame; the smaller stories come out of its bedrooms | each sealed room is a story; the house shape is the family history |
| Gone Home | BAFTA 2014 Debut Game; more than 250,000 copies (2014-02) | Game Developer: environmental storytelling without combat or a big budget; Steve Gaynor interviews | one house as the text |

Audio logs and notes are text and voice in the space. They are exposition, not environmental storytelling by themselves.

| Technique | Use | Strength | Weakness | Fits when |
|---|---|---|---|---|
| placed props and vignettes | BioShock, Gone Home | story without words | can be cliché (Smith and Worch, GDC 2010) | spaces with a past |
| readable traces (notes, audio logs) | BioShock, Gone Home | exact information | breaks pace; reads as exposition | details props cannot show |
| architecture that shows history | Edith Finch | the space itself is the story | high art cost | one central building or place |
| light that leads to story objects | many games | guides without UI | can feel forced | dark or large spaces |

Sources: https://www.engadget.com/2007-10-24-bafta-bioshock-game-of-the-year-wii-sports-wins-most-awards.html (M); https://www.theguardian.com/technology/gamesblog/2007/sep/06/storytellingan (M); https://www.gamespot.com/reviews/bioshock-review/1900-6200177/ (M); https://www.gdcvault.com/play/1012647 (O); https://www.bafta.org/media-centre/press-releases/games-awards-winners-announced-2018 (O); https://www.godisageek.com/2017/04/interview-with-ian-dallas-creative-director-on-what-remains-of-edith-finch/ (M); https://www.bafta.org/media-centre/press-releases/british-academy-games-awards-in-2014-winners-announced/ (O); https://www.destructoid.com/more-than-250000-people-have-gone-home/ (M); https://www.gamedeveloper.com/design/how-i-gone-home-i-s-design-constraints-lead-to-a-powerful-story (M)

## 8 Progression and replay loop

| Game | Public data | Credit to the system | What the system does |
|---|---|---|---|
| Slay the Spire | 1.5 million copies (GamesBeat); PC Gamer 92/100 and PC Gamer Best Design 2019 | PC Gamer: one of the most elegantly designed games, strong combos per run; Giovannetti GDC 2019 on metrics-driven balance | random cards and relics per run; data from every run tunes the balance |
| Hades | more than 1 million copies (Supergiant, 2020); Hugo Award 2021 Best Video Game (first game to win one) | Greg Kasavin (Tom's Guide; GameDaily): permanent progression and a story that moves forward with each run make death part of play | story continues across deaths; permanent upgrades |

Dead Cells (more than 10 million copies) also has permanent unlocks plus run variety, but no source found credits its sales to this loop. It is not counted.

| Technique | Use | Strength | Weakness | Fits when |
|---|---|---|---|---|
| meta-progression | Hades, Dead Cells | progress even after failure | can replace skill with grind | hard, repeated runs |
| run variety (random items, routes) | Slay the Spire | each run is new | balance is hard | many runs per player |
| narrative across runs | Hades | death gives story reward | high writing cost | character-driven games |
| telemetry-based balance | Slay the Spire | balance from real play data | needs players and tools | live or early-access games |

Sources: https://gdcvault.com/play/1025731 (O); https://gamesbeat.com/slay-the-spire-passes-1-5-million-copies-sold/ (M); https://pcgamer.com/slay-the-spire-review (M); https://pcgamer.com/best-design-2019-slay-the-spire (M); https://www.pcgamer.com/mythological-roguelike-hades-has-sold-more-than-1-million-copies (M); https://www.engadget.com/hades-wins-2021-hugo-award-173943441.html (M); https://www.tomsguide.com/features/hades-exclusive-interview-supergiant (M); https://www.gamedaily.biz/?p=588 (M)
