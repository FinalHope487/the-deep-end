# Part C4 — price and release trends

Date: 2026-11-10. Writer: Claude. Scope: the Steam ids in Part A, and Steam search counts for seven genre words. Reviews and reach: `c1-success-data.md`.

## 1 Sources

| Data | Source | Note |
|---|---|---|
| List price, release date, categories | Steam `api/appdetails`, `cc=us`, 2026-11-10 | list price = `price_overview.initial` (no sale price) |
| Reviews, % positive | Steam review tooltip (same as C1) | |
| Play length | median "hrs on record" of positive reviewers in the C2 review sample | SteamSpy average and median playtime are 0 for all ids (not available). Use as a proxy only: the sample is "most helpful" reviews, and hours on record include idle time. |
| Release counts | Steam search, `category1=998` (games only), text term | text search on title and store text, not a tag filter |

Groups: 1 = pool and liminal walkers, 2 = Exit-8-like and Backrooms, 3 = dreamcore and dream exploration, 4 = reference games (`a-4`..`a-7`).

## 2 Price, length and reputation (core groups, 50 reviews or more)

| Game | Group | Release | List USD | Reviews | % pos | Median h (positive) | USD per h | Multiplayer |
|---|---|---|---|---|---|---|---|---|
| POOLS | 1 | 2024-04 | 9.79 | 3,514 | 95 | 2.7 | 3.63 | |
| Liminalcore | 1 | 2024-10 | 7.99 | 742 | 83 | 3.5 | 2.28 | |
| LIMINAL WATERS EE | 1 | 2025-10 | 9.49 | 127 | 90 | 5.4 | 1.76 | |
| Poolscape | 1 | 2026-05 | 4.99 | 81 | 92 | 2.8 | 1.78 | |
| Escape the Backrooms | 2 | 2025-10 (1.0) | 9.99 | 47,286 | 88 | 19.8 | 0.50 | yes |
| Backrooms: Escape Together | 2 | 2022-10 | 9.99 | 15,496 | 89 | 9.6 | 1.04 | yes |
| The Exit 8 | 2 | 2023-11 | 3.99 | 5,316 | 93 | 1.5 | 2.66 | |
| The Complex: Expedition | 2 | 2025-07 | 14.99 | 1,726 | 88 | 4.4 | 3.41 | |
| Backrooms: Lost Tape | 2 | 2022-12 | 15.99 | 1,347 | 80 | 1.6 | 9.99 | |
| Platform 8 | 2 | 2024-05 | 3.99 | 1,256 | 86 | 1.4 | 2.85 | |
| Anemoiapolis: Chapter 1 | 2 | 2023-03 | 8.99 | 1,163 | 81 | 2.4 | 3.75 | |
| The Backrooms 1998 | 2 | 2025-02 | 9.99 | 591 | 80 | 1.0 | 9.99 | yes |
| The Complex: Found Footage | 2 | 2022-08 | 4.99 | 114 | 88 | 1.0 | 4.99 | |
| Yume Nikki | 3 | 2018-01 | free | 6,620 | 94 | 5.8 | – | |
| Hypnospace Outlaw | 3 | 2019-03 | 19.99 | 4,437 | 96 | 14.0 | 1.43 | |
| Millennium Dream | 3 | 2026-01 | 7.99 | 2,694 | 92 | 4.4 | 1.82 | |
| Dreamcore | 3 | 2025-01 | 17.99 | 1,974 | 89 | 10.6 | 1.70 | |
| Dreamcore: Rabbit Hole | 3 | 2026-04 | 5.99 | 432 | 72 | 3.0 | 2.00 | |

Below 50 reviews (do not use for trends): Liminality 3.99 (29 reviews, 44 %), AQUARIUMS 8.99 (28, 60 %), BBirthday 8.99 (36, 94 %). Not released or no review score: Poolcore, Poolcore: Submersion, POOLIMINAL, Poolrooms Museum (4.99), Backrooms: Poolrooms (9.99), Dreamcore Retro (1.99), Explore Dreams: Dreamcore (12.99), Dreamcore: Liminal Spaces.

### 2.1 Group medians (50 reviews or more)

| Group | Games | Median list USD | Median h (positive) |
|---|---|---|---|
| 1 Pool and liminal | 4 | 8.74 | 3.2 |
| 2 Exit-8-like and Backrooms | 9 | 9.99 | 1.6 |
| 3 Dreamcore and dream | 5 | 7.99 | 5.8 |
| 4 Reference | 33 | 14.99 | 5.0 |

### 2.2 Price bands (all groups, 50 reviews or more)

| Band USD | Games | Median % pos | Median reviews |
|---|---|---|---|
| free | 3 | 91 | 2,954 |
| 0.01–4.99 | 6 | 90 | 1,320 |
| 5–9.99 | 19 | 88 | 2,063 |
| 10–14.99 | 5 | 88 | 10,909 |
| 15 and more | 18 | 93 | 4,014 |

### 2.3 Rank correlations (Spearman, core paid games, n = 17)

| Pair | rho | Read |
|---|---|---|
| price – % positive | 0.04 | no relation |
| price – median hours | 0.51 | longer games ask more |
| price – review count (log) | 0.37 | weak |
| USD per hour – % positive | −0.49 | games that charge more per hour get lower scores |

n = 17 is small. A rho of 0.5 is not proof. The two lowest scores at a 9.99 price (Lost Tape, Backrooms 1998) both have about 1 h median play and many cheap-scare complaints (C2), so length and design are mixed in this result.

## 3 Release counts per half-year (Steam search, games only)

| Term | Total hits | 2022H2 | 2023H1 | 2023H2 | 2024H1 | 2024H2 | 2025H1 | 2025H2 | 2026H1 | 2026H2* |
|---|---|---|---|---|---|---|---|---|---|---|
| anomaly | 2,458 | 12 | 13 | 21 | 78 | 109 | 98 | 143 | 199 | 216 |
| backrooms | 677 | 18 | 22 | 26 | 29 | 20 | 42 | 44 | 54 | 56 |
| liminal | 664 | 11 | 9 | 16 | 24 | 29 | 37 | 39 | 60 | 57 |
| dreamcore | 65 | 1 | 2 | 0 | 1 | 4 | 4 | 6 | 5 | 9 |
| poolrooms | 61 | 1 | 0 | 1 | 2 | 5 | 4 | 5 | 5 | 7 |
| weirdcore | 20 | 1 | 1 | 1 | 1 | 1 | 0 | 1 | 2 | 3 |

\* 2026H2 counts games released to 2026-11-10 plus games with an announced date to 2026-12-31. Games with "Coming soon" or no date are not in any column (anomaly 489, backrooms 174, liminal 186, dreamcore 20, poolrooms 18, weirdcore 8). Parsed rows are fewer than total hits because the search JSON pages stop early (anomaly 1,661 of 2,458; backrooms 548 of 677).

Do not use the term "pool rooms" (two words): it gave 419 hits with a jump to 89 in 2026H2 because it matches any game with both words. Use "poolrooms".

## 4 What the numbers show

1. Core genre games sell at 4–10 USD. The reference games sell at about 15 USD. Only long or deep games ask 15–20 USD (Hypnospace Outlaw 14 h, Dreamcore 10.6 h).
2. Price alone does not predict the score. Price per hour of play does (rho −0.49): 1–3 USD per hour keeps scores at 83–95 %; 10 USD per hour goes with 80 %.
3. "Anomaly" games grew about 10x after The Exit 8 (2023-11): 21 in 2023H2, 199 in 2026H1. Backrooms and liminal titles grew about 2–4x in the same time.
4. "Poolrooms" titles stay few: 1–7 per half-year, 61 in total. The niche is not crowded on Steam by title count, but the top title (POOLS, 95 %, 3,514 reviews) sets the bar.
5. Dreamcore titles are also few (65), and their one large hit (Dreamcore, 17.99) depends on 10 h of content.

## 5 Limits

- Prices are US list prices on one day. Regional prices and launch discounts are not in this note.
- Hours are a proxy from helpful positive reviews, not a play-time statistic.
- Steam text search finds a word in the store text. Some hits are not genre games; some genre games do not use the word.
- No sales data here. Use C1 for sales facts and estimates.
