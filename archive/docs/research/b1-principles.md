# Part B1 — general success principles

Date: 2026-11-09. Writer: Claude. Reviewer: ChatGPT (task c2c_rsRvB, round 1). Spec: `00-spec.md` section 4.

## Evidence types

| Code | Type | Rule |
|---|---|---|
| R | research data (study, experiment, large data set) | may support a causal statement within the study scope |
| D | developer experience (talk, post-mortem, interview) | states what the team did and saw; not a controlled test |
| K | critic analysis | interpretation only |
| S | shared trait | successful games share it; no causal claim |

Each principle states its scope. Where evidence is D, K or S only, read the statement as "teams report" or "successful games show", not as "this causes success".

## 1 Player motivation and retention

| ID | Principle | Evidence | Example games | Sources |
|---|---|---|---|---|
| M1 | Satisfying the needs for competence, autonomy and relatedness predicts enjoyment and the wish to play again. | R: Ryan, Rigby, Przybylski 2006, four studies (self-report) | Super Mario 64, Zelda: Ocarina of Time (in study), MMOs | https://doi.org/10.1007/s11031-006-9051-8 (R) |
| M2 | Design approach: keep challenge close to player skill (flow) and let the player adjust it, for example by choice of path or assist options. Chen and Thorson report this as their method; no controlled test of success. | D + theory: Chen 2007 (flOw); D: Celeste assist mode | flOw, Celeste | https://doi.org/10.1145/1232743.1232769 (R); https://maddymakesgames.com/articles/celeste_and_forgiveness/ (O) |
| M3 | Information gaps raise curiosity (general psychology). Outer Wilds developers report that they built progression on knowledge instead of items; this is a design report, not a causal test in games. | R (general psychology: Loewenstein 1994 information-gap theory); D: Outer Wilds team | Outer Wilds, Return of the Obra Dinn | https://gdcvault.com/play/1027008/Independent-Games-Summit-Sparking-Curiosity (O); https://www.gamedeveloper.com/design/live-die-repeat-how-i-outer-wilds-i-piques-curiosity-in-an-ambivalent-solar-system (M) |
| M4 | Most players leave very early. Global median mobile day-1 retention is about 23%, day 7 about 4%, day 28 under 1% (Q1 2024, more than 10,000 games). The first session therefore carries most of the retention risk. | R (industry data, descriptive; no cause) | mobile games in the data set | https://gamedevreports.substack.com/p/gameanalytics-benchmarks-in-mobile (M; summary of GameAnalytics report) |

## 2 Visual quality and lighting

| ID | Principle | Evidence | Example games | Sources |
|---|---|---|---|---|
| V1 | Readability before detail: silhouette and value contrast first, then surface detail. | D (peer-reviewed): Mitchell, Francke, Eng 2007, TF2 illustrative rendering | Team Fortress 2 | https://doi.org/10.1145/1281500.1281666 (R); https://cdn.fastly.steamstatic.com/apps/valve/2007/NPAR07_IllustrativeRenderingInTeamFortress2_Slides.pdf (O) |
| V2 | Light and colour can guide the route without interface markers. Let the player tune or remove the aid. | D: DICE "Runner Vision" (red marks on usable objects); EA post on the redesign for Catalyst | Mirror's Edge, Mirror's Edge Catalyst | https://gamedeveloper.com/design/the-philosophy-of-faith-a-mirror-s-edge-interview (M); https://www.ea.com/news/runners-vision-in-mirrors-edge-catalyst (O) |
| V3 | A distinctive stylised look can keep its visual appeal across hardware generations. Critics give The Wind Waker as an example. This does not show that stylisation causes commercial success. | K: retrospective critic analysis | The Legend of Zelda: The Wind Waker | https://www.gamespot.com/reviews/the-legend-of-zelda-the-wind-waker-hd-review/1900-6414506/ (M) |

## 3 Atmosphere and tension (audio, pacing, negative space)

| ID | Principle | Evidence | Example games | Sources |
|---|---|---|---|---|
| T1 | Design approach: alternate tension and relief, and pace events by an estimate of player stress. Valve reports this method for Left 4 Dead. | D: Booth 2009, Left 4 Dead AI Director | Left 4 Dead | https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf (O) |
| T2 | Sound raises self-reported immersion. Physiological measures did not show a significant effect (mixed result). | R: Nacke et al. 2010, Interacting with Computers 22:336-343 | Half-Life 2 mod (test), Amnesia | https://ub-ir.bolton.ac.uk/esploro/outputs/journalArticle/More-than-a-feeling-Measurement-of/999710108841 (R) |
| T3 | Frictional Games reports: fear of the unknown is strong, but a threat that is too opaque frustrates, and repeated exposure turns a threat into a gameplay object and lowers fear. | D: Thomas Grip (Frictional Games) | Amnesia: The Dark Descent (Water Lurker is never seen), SOMA | https://frictionalgames.blogspot.com/2019/10/9-years-9-lessons-on-horror.html (O); https://gamedeveloper.com/design/the-tricky-design-problem-of-i-soma-i-s-memorable-monsters (M) |
| T4 | Game-specific design choice: safe rooms give rest from constant tension. The RE2 remake team kept the rule "no attack inside" to protect that rest. | D: Kazunori Kadoi (RE2 remake director) | Resident Evil series | https://www.pcgamer.com/the-art-of-crafting-the-perfect-videogame-safe-room (M) |

## 4 Onboarding and usability

| ID | Principle | Evidence | Example games | Sources |
|---|---|---|---|---|
| O1 | Tutorials help in complex games and matter little in simple ones. Teach by doing. | R: Andersen et al. 2012, CHI, A/B test with more than 45,000 players; up to +29% play time, in the most complex game only | Refraction, Hello Worlds, Foldit | https://doi.org/10.1145/2207676.2207687 (R) |
| O2 | Teach the rules through the first level layout, in safe steps, without text. | D: Miyamoto and Tezuka on World 1-1 (2015 video interview) | Super Mario Bros. | https://gamedeveloper.com/design/how-miyamoto-built-i-super-mario-bros-i-legendary-world-1-1 (M) |
| O3 | Playtest early, measure, iterate. | D with data: Microsoft user research on Halo 3 (heat maps of deaths) | Halo 3 | https://www.wired.com/2007/08/ff-halo/ (M) |
| O4 | Accessibility options widen who can play. | D: Naughty Dog, 60+ options in The Last of Us Part II | The Last of Us Part II | https://www.playstation.com/en-us/games/the-last-of-us-part-ii/accessibility/ (O) |

## Limits

- M4 is descriptive data. It shows where players leave; it does not show what keeps them.
- V3 is critic analysis of one game. Read it as an example, not a rule.
- M4 covers mobile games only. O4 shows the options exist; it does not measure how many more people play.
- No principle here is specific to one game project (R-06).
