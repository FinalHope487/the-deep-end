# Part C3 — browser channels and social-world platforms

Date: 2026-11-10. Draft: ChatGPT (C2C task c2c_rc3c). Check and edit: Claude. Scope: distribution facts only. This note does not judge if Poolcore can ship on a platform (`00-spec.md` R-04). The feasibility study uses these facts later.

## 1 Trust codes

| Code | Meaning |
|---|---|
| OF | official platform or developer page |
| PL | number shown on the platform page or API |
| 3P | third-party tracker or archive |
| CM | one player comment; not a share of opinion |
| V | Claude read the source on 2026-11-10 and the value matches |
| D | from the ChatGPT draft only; Claude did not open the source |

Do not add or convert visits, plays, votes, minutes and favorites. They measure different events. None of them is a sale.

## 2 Browser-game channels

| Channel | Revenue and exclusivity | Technical limits | Review | Source | Check |
|---|---|---|---|---|---|
| itch.io | free, donation, pay-what-you-want or paid; creator sets the platform share; no general exclusivity | one self-contained `.html` file can be uploaded without a ZIP; ZIP: extracted size ≤ 500 MB, each file ≤ 200 MB, ≤ 1,000 files | no curation before release | https://itch.io/docs/creators/html5 | V (limits); D (revenue) |
| CrazyGames | Basic Launch: no revenue; Full Launch: ad revenue share, SDK required | total ≤ 250 MB, ≤ 1,500 files; initial download ≤ 50 MB; ≤ 20 MB to be shown on the mobile homepage | quality and content review | https://docs.crazygames.com/requirements/technical/ ; https://docs.crazygames.com/requirements/intro/ | V |
| Poki | players that Poki brings: revenue split 50/50; exclusivity covers the open web only (Steam, app stores and consoles stay with the developer) | SDK, fast loading, desktop and mobile QA | curated; broad audience | https://sdk.poki.com/ | V |
| Newgrounds | old ad-revenue program not active; payout not public | ZIP with root `index.html` | content rating at upload | Newgrounds wiki (URL not in draft) | D |
| Game Jolt | not public | not verified | not verified | – | D |

Facts that matter for a single-HTML build:
- itch.io is the only checked channel that accepts one `.html` file as is.
- CrazyGames and Poki require their SDK and a review. A file that runs is not a file that they accept.
- CrazyGames counts the whole first download. One HTML file with all assets inside must be ≤ 50 MB (≤ 20 MB for the mobile homepage).

## 3 Browser-playable genre games (purposive sample)

Not a random sample. Ratings are counts of ratings, not plays. All rows D (Claude did not open each page).

| Channel | Games | Public numbers | Note |
|---|---|---|---|
| itch.io | Blue Space, Empty Hours, CATROOMS, Hypnagogia, Red Light Green Light, The Backrooms: Null Level, Was this here before?, Dream Cleaner, Dimension Incident, Pick A Door, Poolrooms Drainer, Intraliminal | 1–23 ratings each; plays not public | most are free, 5–15 min, jam size |
| Poki | Backrooms Recovery (2026-08); Backroom Bill (2026-10) | 77,782 and 12,322 votes; 4.4 and 4.3 of 5 | plays not public |
| Newgrounds | Explore The Backrooms (2026-08-15) | 531 views, 71 votes, 2.73 of 5 | text adventure |
| CrazyGames | Escape Series (2024-09) | 8.5 of 10 | room escape, not a pool game |

Player comments (CM, single cases): mobile look control is uncomfortable (CATROOMS); progress and load time are not clear (Dream Cleaner); a hidden item needs a clearer clue (Blue Space). These match C2 themes T4 (control comfort) and guidance, but the counts are too small to give a share.

## 4 Roblox, VRChat, Fortnite UEFN

These platforms need a rebuild in their own tools (Roblox Studio, Unity for VRChat, UEFN). They show audience size for the theme, not a channel for an HTML file.

### 4.1 Roblox (PL, games API, 2026-11-10)

| Experience | Creator | Created | Updated | Visits | Favorites | Playing now | Check |
|---|---|---|---|---|---|---|---|
| Backrooms | Red Panda Industries | 2022-04-03 | 2026-11-09 | 208,579,699 | 3,798,345 | 2,319 | V |
| [VR SUPPORT] Poolrooms HD (backrooms level 37) | Flufflepunk | 2022-08-12 | 2026-07-24 | 8,264,774 | 26,011 | 12 | V |
| Infinite Shift: Poolrooms | yellodo | 2026-10-15 | 2026-10-31 | 901,219 | 3,527 | 8 | V |
| The Backrooms | TheInfernoBoy1 | – | 2026-09-12 | 156.3M+ | 707,310 | 792 | D |

API: `https://games.roblox.com/v1/games?universeIds=3472976893,3840010459,10771001873`. The ChatGPT draft gave older page values (196.8M, 7.7M) and said the creation dates were not public; the API shows them. Poolrooms HD says that it has no jump scares, and its creator says that work on it has stopped (D).

### 4.2 VRChat (3P archive vrcw.net, values dated 2026-06-25)

| World | Published | Visits | Favorites | Note | Check |
|---|---|---|---|---|---|
| The Backrooms v11.2 (Friday1) | 2022-04-09 | about 4.41M | 139K | levels, puzzles, secrets | D |
| Liminal Dreams: The Poolrooms (Lotus) | 2024-08-24 | 706,883 | 38,423 | looping maze, "no entities" | D |
| Aesthetic Poolrooms (Kadeko) | 2024-05-25 | 100,389 | 8,938 | themed pool spaces | D |
| Poolroom Madness (Malikart2022) | 2024-06-16 | 80,549 | 4,195 | social walk | D |

vrcw.net refused the automated read (HTTP 403). Claude did not bypass it.

### 4.3 Fortnite UEFN (3P, fortnite.gg, 2026-11-10)

| Island | Code | Released | Minutes played | Favorites | Check |
|---|---|---|---|---|---|
| THE BACKROOMS LOST | 9976-7848-6649 | 2023-05-04 | 36.8M | 164.8K | V |
| THE POOLROOMS | 9158-5762-7423 | 2024-01-26 | 628.4K | 8.6K | V (UEFN, up to 4 players) |
| Liminal Backrooms | 5066-7426-3382 | 2024-12-14 | about 243.8K | 3.5K | D |
| Infinite Backrooms | 1137-9483-8915 | 2025-11-01 | about 143.5K | 879 | D |
| Backrooms: Abyss | 6384-1712-9567 | 2026-09-12 | about 47.7K | 357 | D |

Pages: `https://fortnite.gg/island?code=<code>`. Creator payout per island is not public.

## 5 What the evidence shows

| Question | Evidence | Limit |
|---|---|---|
| Is there an audience for pool and backrooms spaces outside Steam? | Roblox Backrooms 208.6M visits; Poolrooms HD 8.3M; UEFN Backrooms Lost 36.8M minutes; VRChat Liminal Dreams 707K visits | visits are events, not people or buyers |
| Can calm exploration with no monster get reach? | Poolrooms HD (8.3M visits, no jump scares); Liminal Dreams (707K visits, no entities) | no satisfaction or completion data |
| Do browser players reward the same things as Steam players? | not shown; samples are too small and the measures differ | needs a larger web sample with play counts |
| Does reach give revenue? | no checked page gives developer earnings | revenue is not public |

## 6 Not found

Game Jolt upload and revenue rules; play counts and session length for itch.io games; Poki player comments; Roblox creator revenue and retention; synchronized VRChat counts for November 2026; UEFN payout per island; any study that links C2 player patterns to web revenue.
