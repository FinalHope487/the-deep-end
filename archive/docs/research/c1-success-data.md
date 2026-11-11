# Part C1 — sales, reach and reputation data

Date: 2026-11-10. Writer: Claude. Scope: the Steam ids in Part A (`a-1`..`a-7`). Player opinion themes: `c2-player-voice.md`.

## 1 Data sources and how to read them

| Code | Source | What it gives | Trust |
|---|---|---|---|
| OF | Publisher or developer statement (press release, official post) | copies sold | high |
| ST | Steam store page, review tooltip | review count and % positive (English filter, or all languages when the game has few reviews) | high for reviews; not sales |
| SS | SteamSpy API | owner range | estimate; lags for new games (3470560 shows 0..20,000 with 2,694 reviews) |
| SC | SteamCharts | concurrent players: now, 24 h peak, all-time peak | high after tracking starts; low for early peaks of small games |
| BX | Boxleiter method: total reviews x 20..60 | copies | rough estimate; the multiplier changes by genre and price |
| 3P | raijin.gg, steamdata.ai, steampageanalyzer, gamesensor, gamerevenuedata, VG Insights, Gamalytic, PlayTracker | copies and gross revenue | estimate; values for one game can differ by 2x or more |

Rules for this note:
- Only OF numbers are sales facts. Label every other number as an estimate.
- ST percentages below use the widest scope that Steam gave (language or all-time). The 30-day value is in brackets when it differs by 5 points or more.
- Collection date: 2026-11-10. SteamDB blocked automated reads (HTTP 429 and a bot check). This note does not use SteamDB except one line read by hand (see 2.3).

## 2 Core genre titles

### 2.1 Official sales (OF)

| Game | Fact | Date | Source |
|---|---|---|---|
| The Exit 8 (2653790) | 3,000,000 copies, all platforms | 2026-09-07 | https://www.gematsu.com/2026/09/the-exit-8-sales-top-three-million ; https://playism.com/en/news/2026/0907/1716/ |
| The Exit 8 | 2,000,000 copies (same day as the film and the Switch 2 version) | 2025-08-29 | https://www.gematsu.com/2025/08/the-exit-8-sales-top-two-million |
| The Exit 8 | 1,000,000 copies | 2024-08 | https://www.invenglobal.com/articles/25663 |
| The Exit 8 | about 30,000 copies in the first day | 2023-11/12 | https://automaton-media.com/en/news/20231201-23610/ |
| Escape the Backrooms (1943950) | "more than 4 million players" (co-development case study; players, not copies) | 2025 | https://www.gamedeveloper.com (co-dev case study) |

No OF sales number was found for POOLS, Platform 8, Anemoiapolis, The Complex, Backrooms 1998, Dreamcore, Yume Nikki, Superliminal, Manifold Garden or A Short Hike.

### 2.2 Reputation and reach (ST, SS, SC)

| Id | Game | Reviews (ST) | % positive (ST) | Owners (SS) | All-time peak (SC) |
|---|---|---|---|---|---|
| 2663530 | POOLS | 3,514 EN | 95 | 100k..200k | 350 (see 2.3) |
| 3107900 | Liminalcore | 742 | 83 [30 d: 72, n=11] | 0..20k | 40 |
| 4015300 | LIMINAL WATERS | 127 | 90 | 0..20k | n/a |
| 4189480 | Poolscape | 81 | 92 | 0..20k | n/a |
| 3654850 | AQUARIUMS | 28 | 60 | 0..20k | 1 |
| 2916260 | Liminality (Early Access) | 29 | 44 | 0..20k | n/a |
| 2251780, 3294270, 4928860 | Poolcore, Poolcore: Submersion, POOLIMINAL | 0 | n/a | 0..20k | n/a |
| 2653790 | The Exit 8 | 5,316 EN | 93 | 200k..500k | 2,785 |
| 2903560 | Platform 8 | 1,256 EN | 86 | 100k..200k | 974 |
| 1522960 | Anemoiapolis: Chapter 1 | 1,163 | 81 | 100k..200k | 143 |
| 1942120 | The Complex: Found Footage | 114 | 88 | 0..20k | 227 |
| 2172260 | The Complex: Expedition | 1,726 EN | 88 | 50k..100k | 231 |
| 1943950 | Escape the Backrooms (co-op) | 47,286 EN | 88 | 2M..5M | 48,097 |
| 2141730 | Backrooms: Escape Together (co-op) | 15,496 EN | 89 | 500k..1M | 13,088 |
| 1985930 | The Backrooms 1998 | 591 | 80 | 20k..50k | n/a |
| 1926620 | Backrooms: Lost Tape | 1,347 | 80 [30 d: 27, n=11] | 100k..200k | 71 |
| 2453060 | Dreamcore | 1,974 | 89 | 50k..100k | 144 |
| 4149700 | Dreamcore: Rabbit Hole | 432 | 72 | 0..20k | 29 |
| 3470560 | Millennium Dream | 2,694 | 92 | 0..20k (lag) | 2,002 |
| 2224400 | BBirthday | 36 | 94 | 0..20k | n/a |
| 650700 | Yume Nikki (free) | 6,620 EN | 94 | 500k..1M | 463 |
| 844590 | Hypnospace Outlaw | 4,437 EN | 96 | 200k..500k | 297 |

### 2.3 Third-party estimates (3P, BX)

| Game | Estimates | Note |
|---|---|---|
| POOLS | 144k (steamdata.ai); 184k, about USD 1.5M gross (raijin.gg); 131k..263k (steampageanalyzer, BX); SteamDB page by hand: VG Insights ~231.7k, Gamalytic ~232.9k, PlayTracker ~288.7k | The same SteamDB line shows an all-time peak of 68,138. SteamCharts shows 350. The two do not agree; treat the peak as unverified. |
| Escape the Backrooms | 2.8M (gamesensor); 3.8M, USD 32.3M gross (raijin.gg); 6.3M..6.9M (gamerevenuedata) | Automaton reports a peak above 35,000 at the full release (2025-10-23). SC shows 48,097. |
| The Complex: Found Footage | about 1.69k units (steamdata.ai) | it was free first, then paid; units count the paid period only |
| Superliminal | 540.7k, USD 6.5M gross (raijin.gg) | SS 1M..2M |
| A Short Hike | 428k (raijin.gg); 575k..1.15M (steampageanalyzer, BX) | developer: Switch sales "much stronger" than PC (2020) |
| Manifold Garden | none found | SS 200k..500k |

Sources: https://raijin.gg/app/1943950 ; https://gamesensor.info/app/1943950 ; https://automaton-media.com/articles/newsjp/escape-the-backrooms-20251024-362903/ ; https://raijin.gg/app/1049410/Superliminal ; https://www.steampageanalyzer.com/games/1055540 ; https://mynintendonews.com/2020/10/11/a-short-hike-dev-says-sales-have-been-much-stronger-on-switch-compared-to-pc

### 2.4 Awards and critics

| Game | Item | Source |
|---|---|---|
| The Exit 8 | Japan Game Awards 2024, Breakthrough Award; CEDEC Awards | https://awards.cesa.or.jp/2024/en/year/prize/14.html |
| The Exit 8 | OpenCritic 67 (via Deku Deals); no stable Metascore | https://www.dekudeals.com/items/the-exit-8 |
| POOLS | Finnish Game Awards, Best Creative Achievement; PS Store 4.27 / 5 (2,904 ratings) | https://en.wikipedia.org/wiki/Pools_(video_game) ; https://www.playstation.com/en-us/games/pools/ |
| POOLS | PS5 and PS VR2 version, 2025-11-25 | same |
| Anemoiapolis | Final Weapon review: unnerving, but little challenge or narrative | https://finalweapon.net/2023/03/17/anemoiapolis-chapter-1-review |

## 3 Reference titles (Steam, 2026-11-10)

| Id | Game | Reviews (ST) | % | Owners (SS) | All-time peak (SC) |
|---|---|---|---|---|---|
| 219890 | Antichamber | 10,261 EN | 95 | 1M..2M | 2,352 |
| 473950 | Manifold Garden | 4,539 EN | 95 | 200k..500k | 324 |
| 1049410 | Superliminal | 14,631 EN | 93 | 1M..2M | 1,255 |
| 1382070 | Viewfinder | 6,467 EN | 92 | 200k..500k | 607 |
| 265690 | NaissanceE | 2,954 EN | 84 | 200k..500k | n/a |
| 1703340 | The Stanley Parable: UD | 24,613 EN | 94 | 1M..2M | 6,477 |
| 251110 | INFRA | 2,591 EN | 87 | 200k..500k | 142 |
| 303210 | The Beginner's Guide | 15,632 EN | 88 | 500k..1M | n/a |
| 1256230 | Hyperbolica | 1,226 | 84 | 20k..50k | n/a |
| 520720 | Dear Esther: LE | 1,489 EN | 75 | 200k..500k | 2,004 |
| 232430 | Gone Home | 10,909 EN | 77 | 500k..1M | 1,198 |
| 501300 | What Remains of Edith Finch | 18,793 EN | 94 | 500k..1M | 550 |
| 638230 | Journey | 12,910 EN | 92 | 500k..1M | 3,256 |
| 384190 | ABZU | 9,956 EN | 93 | 500k..1M | 1,311 |
| 1055540 | A Short Hike | 12,754 EN | 99 | 200k..500k | 382 |
| 1307580 | TOEM | 3,473 EN | 98 | 200k..500k | 401 |
| 406150 | Refunct | 7,499 EN | 95 | 200k..500k | 476 |
| 1291340 | Townscaper | 10,643 EN | 95 | 1M..2M | 1,162 |
| 1118240 | Lake | 2,555 EN | 87 | 200k..500k | 815 |
| 897030 | Paratopic | 1,384 | 78 | 100k..200k | 97 |
| 238320 | Outlast | 29,958 EN | 96 | 2M..5M | 11,684 |
| 2881650 | Content Warning | 35,607 EN | 93 | 5M..10M | 63,320 |
| 2406770 | Bodycam | 38,325 EN | 79 | 500k..1M | 38,757 |
| 558420 | Stories Untold | 3,321 EN | 85 | 100k..200k | 366 |
| 2186570 | TELEFORUM | 1,002 EN | 91 | 0..20k | 222 |

Full rows for all 64 ids: `work/success/steam-stats.json` (git-ignored; re-create with the scripts named in section 5).

## 4 What the numbers show

| # | Finding | Evidence |
|---|---|---|
| F1 | Scale in this genre comes from two routes: co-op multiplayer, or a simple rule that spreads as a meme and on video. Solo atmosphere walkers stay in the 100k..300k range. | Escape the Backrooms SS 2M..5M, SC 48k; Content Warning SS 5M..10M; The Exit 8 OF 3M; POOLS 3P 144k..289k; Dreamcore SS 50k..100k |
| F2 | The Exit 8 kept selling for three years. Each new channel (Switch, Switch 2, film, sequel) added a step. Platform 8 (sequel) reached 100k..200k owners. | OF 1M (2024-08), 2M (2025-08), 3M (2026-09) |
| F3 | High reputation does not give high reach without a hook. Many 92..99% games have under 1,000 all-time peak players. | A Short Hike 99%, peak 382; TOEM 98%, peak 401; Manifold Garden 95%, peak 324 |
| F4 | Pool and liminal walkers made after POOLS mostly stay under 1,000 reviews. Several have 0 reviews. | 3107900 742; 4015300 127; 4189480 81; 3654850 28; 2916260 29; 2251780, 3294270, 4928860 zero |
| F5 | Review score falls when a game is a clone, is short for its price, or is left unfinished. | 3654850 60%; 2916260 44%; 4149700 72% (undisclosed AI voices); 1926620 30-day 27% after a bad update |
| F6 | A strong emotional theme can carry a small walker to a top score and a large player peak. | 3470560 Millennium Dream: 92%, peak 2,002; top review (3,065 helpful) is about lost relatives |
| F7 | Single-player walkers have a short playing life. Concurrent players fall to tens within months; reviews arrive mostly near launch. | POOLS now 19 against 3,514 reviews; Dreamcore keeps players by adding levels (peak month 2025-01, later than launch) |

## 5 Method and limits

- Scripts (session scratch, not in the repo): Steam store page plus `steamcommunity.com/app/<id>/homecontent/` (`appHubSubSection` 10 = all, 16 = positive, 17 = negative); SteamSpy `api.php?request=appdetails`; SteamCharts HTML. The old `store.steampowered.com/appreviews/<id>?json=1` endpoint now returns HTML.
- English review counts under-count games with large Chinese or Japanese audiences (The Exit 8, Platform 8, Millennium Dream). Use OF numbers for those games where they exist.
- SC misses early peaks for games added to tracking late. SS lags for new games.
- 3P sources use their own models. They are not independent data.
