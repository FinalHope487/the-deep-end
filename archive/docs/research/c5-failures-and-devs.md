# Part C5 — failure cases and developer data

Date: 2026-11-10. Draft: ChatGPT (C2C task c2c_rc5). Check and edit: Claude. Trust codes: `c3-web-and-platforms.md` section 1 (OF, PL, 3P, CM, V, D).

Rules for this note:
- A Steam review count is not a sales count. Do not convert reviews, players or visits to sales.
- "Unreleased" and "few reviews" are not "failed". Section 1 keeps four classes apart.
- A cause in the "Likely cause" column is an inference unless the row says "developer states".

## 1 Failure cases

Classes: **A** = development stopped (developer states it); **B** = weak reception (score under 60 %); **C** = low reach (fewer than 10 reviews); **U** = unreleased, no outcome yet.

Steam store state and price: Steam `appdetails` API, US region, 2026-11-10 (V). Review counts: Claude's C4 pull of 2026-11-10 where marked V; the Steam review API refused later calls this day (redirect), so other counts are D.

| Game (app id) | Class | State, price | Visible fact | Likely cause | Check |
|---|---|---|---|---|---|
| Welcome To The Backrooms (2007010) | A | Early Access from 2022-10-27; free | 152 reviews, 48 % (D). Post "Welcome To The Backrooms Is Officially Dead" on 2024-07-25 | developer states: very small first team, private life limits, could not deliver the promised plan | V (post) |
| Backrooms: Lost (2924300) | A, B | Early Access from 2024-07-25; no price (delisted) | 68 reviews, 51 % (D). Post on 2026-01-14 (UTC): delist from Steam on 2026-01-25 | developer states: core programmers left after disagreements; remaining team cannot deliver updates | V (post) |
| Backrooms - Surreality (2204810) | B | Early Access from 2023-01-29; 3.99 USD | 12 reviews, 33 % (D) | long Early Access; no stop announcement found | V (state) |
| Backrooms Escape Protocol (3575840) | B | Early Access from 2025-04-09; 2.99 USD | 16 reviews, 18 % (D) | not known | V (state) |
| The Backrooms (1116520) | B | released 2019-08-01; 0.99 USD | 57 reviews, 22 % (D) | not known; no evidence of asset flip | V (state) |
| Liminality (2916260) | B | full release 2025-04-20 (left Early Access); 3.99 USD | 29 reviews, 44 % | thin content is possible; no developer account | V |
| AQUARIUMS (3654850) | B | released 2025-09-25; 8.99 USD | 28 reviews; 60 % in the C4 pull, 57 % in the draft (both 2026-11-10) | player reviews name linear play and little interaction (CM) | V |
| Return the Backrooms (1879030) | — | Early Access from 2022-11-10; 3.99 USD | 107 reviews, about 63 % (D) | Early Access for 4 years; no stop announcement found | V (state) |
| The Backrooms Simulator (1119430) | — | released 2019-07-23; no price (not for sale) | 43 reviews, 60 % (D) | reason for removal not found | V (state) |
| Poolrooms Museum (4660210) | C | released 2026-10-28; 4.99 USD; demo | 1 review | released 13 days before this check; too early | V |
| Backrooms: Poolrooms (3559920) | C | released 2026-02-13; 9.99 USD | 1 review | low discovery is possible; marketing not public | V |
| Dreamcore Retro (3381420) | C | released 2024-12-26; 1.99 USD | 8 reviews (D) | not known | V (state) |
| Explore Dreams: Dreamcore (3375310) | C | released 2024-12-02; 12.99 USD | 5 reviews (D) | not known | V (state) |
| Anemoiapolis: Chapter 1 (1522960) | — | released 2023-03-03; 8.99 USD | 1,163 reviews, 81 %. No Chapter 2 release and no cancellation notice found | sequel expectation not met; Chapter 1 is not a failure | V |
| Poolcore (2251780) | U | "To be announced" | no reviews | none yet | V |
| Poolcore: Submersion (3294270) | U | "Coming soon" | no reviews | none yet | V |
| POOLIMINAL (4928860) | U | "Coming soon" | no reviews | none yet | V |
| Dreamcore: Liminal Spaces (5119040) | U | 2027 | no reviews | none yet | V |

Sources: `https://store.steampowered.com/app/<id>/`; posts: `https://steamcommunity.com/app/2007010/allnews/`, `https://steamcommunity.com/app/2924300/allnews/`.

Corrections to the brief: Poolrooms Museum is released. Liminality is out of Early Access. The draft wrote "price not verified" for six games; the API gives the prices above.

### 1.1 What the cases show

| Pattern | Strength | Cases |
|---|---|---|
| A project stops when the team cannot maintain it | strong (two developer statements) | Welcome To The Backrooms; Backrooms: Lost |
| Long Early Access with a low score | medium (state only, no cause) | Backrooms - Surreality; Return the Backrooms |
| A low score shows dissatisfaction, not its production cause | strong for the score; weak for the cause | Liminality; AQUARIUMS; Backrooms Escape Protocol; The Backrooms |
| Few reviews show low reach, not low sales | strong for the count; no cause | Poolrooms Museum; Backrooms: Poolrooms; Dreamcore Retro; Explore Dreams |
| A chapter promise leaves an open expectation | medium | Anemoiapolis (4 Steam threads ask for Chapter 2, `c6-voice-retally.md` 4.2) |

No checked source shows that AI assets, asset flips, release timing or missing marketing caused any case above. Do not use these labels without a source.

## 2 Developer data

"Team" = people who made the cited game, not the company size today. "Time" = the period a source gives, not full-time months.

| Game | Team | Time | Engine | Funding, publisher | Marketing and talk | Source | Check |
|---|---|---|---|---|---|---|---|
| The Exit 8 | solo (KOTAKE CREATE) | about 9 months | Unreal Engine 5 | self-published on PC; PLAYISM for later ports; budget not public | IDC 2024 talk: cut features until the rule is easy to read; reuse assets; reach via social posts and streamers. PLAYISM: more than 3 million copies, all platforms | https://www.4gamer.net/games/751/G075133/20241203035/ ; https://playism.com/en/news/2026/0907/1716/ | V (sales); D (talk) |
| Platform 8 | solo (KOTAKE CREATE) | about 5 months; released 2024-05-31 | Unreal Engine 5 | self-published | interview: changed the core action; reused Exit 8 know-how; audience from the first game | https://gamemakers.jp/article/2024_07_09_72386/ ; https://automaton-media.com/en/interviews/interview-the-exit-8-developer-kotake-create-on-the-perks-of-being-a-solo-dev-and-how-platform-8-came-to-be/ | D |
| POOLS | small (Tensori) | not public; released 2024-04-26 | not confirmed | Tensori / UNIKAT; not public | devlog 2024-01: chapters 2–3 done; demo and videos before launch; interview defends no monsters and no puzzles | https://tensori.itch.io/pools/devlog/681340/devlog-2 ; https://www.pcgamer.com/games/adventure/games-industry-should-be-less-cautious-says-maker-of-experimental-game-about-exploring-a-swimming-pool-dimension/ | D |
| Escape the Backrooms | solo start (Fancy); later Blackbird Interactive and publisher Secret Mode | Early Access 2022-08; total not public | not public | contract not public | YouTube devlogs got millions of views before Early Access; peak near 1,000 concurrent players at Early Access; co-dev for ports and updates. "Over 4 million players" on PC, Xbox, PlayStation, Switch 2 (players, not copies) | https://www.gamedeveloper.com/production/co-dev-case-study-how-blackbird-interactive-and-secret-mode-helped-escape-the-backrooms-ride-the-backrooms-hype-wave (2026-10-06) | V |
| Anemoiapolis | mainly Andrew Quist | work shown 2020–2021; Chapter 1 2023-03-03 | Unity, Blender | self-published; not public | demo, devlogs, trailers; 2021 devlog on save and pause, demo expectations, an optional monster-free mode | https://q-andrew.itch.io/anemoiapolis/devlog/287777/a-work-in-progress-behind-the-curtain | D |
| The Complex: Found Footage | solo (pgWave) | not public; released 2022-08-18 | not confirmed | self-published; Patreon, totals not public | VHS camera look is the store hook; no post-mortem found | https://www.patreon.com/u23359502/about | D |
| Backrooms: Escape Together | Triiodide Studios; size not public | Early Access from 2022-10-18 | Unreal Engine 5 (Nanite, Lumen) | self-published | 1–6 player co-op, procedural spaces, proximity voice, Discord feedback | https://www.backrooms.game/ | D |
| Dreamcore | solo start (Valentín Iribarren / Montraluz), spare time beside a 12-hour job | June 2022 to release 2025-01-23 | Unreal Engine 5 | publisher Tlön Industries; not public | developer: the August 2023 demo "completely changed" the project; launch with two areas, more by updates | https://www.dreamcoregame.com/blog/1 | V |
| Millennium Dream | LucidDreamLab; size not public | not public; released 2026-01-27 | Unreal Engine 5 | self-published | store promise: Chinese nostalgia spaces and in-game photos; critic analysis only | https://m.thepaper.cn/newsDetail_forward_32948255 | D |
| Yume Nikki | solo (Kikiyama, pseudonym) | web release 2004 | RPG Maker 2003 | free; Steam edition 2018 through PLAYISM | free spread and fan interpretation; no creator post-mortem | https://www.wired.com/story/yume-nikki-japanese-game-that-took-14-years-to-officially-come-out/ | D |
| Superliminal | Pillow Castle Games, about 5–6 people | prototype 2014; release 2019 | not confirmed | studio; support received, amount not public | GDC breakdown of perspective puzzles | https://www.gamedeveloper.com/design/watch-a-breakdown-of-superliminal-s-perspective-driven-puzzles ; https://www.gamespark.jp/article/2020/11/15/103865.html | D |
| A Short Hike | mainly solo (Adam Robinson-Yu) | about 4 months to the first release 2019-04-05; Steam 2019-07-30 | Unity | Humble Original funding, amount not public | GDC 2020 post-mortem: flexible scope, milestones, cheap art style, playtests, GIFs on social media, trailer, press outreach | https://www.gdcvault.com/play/1026613/Independent-Games-Summit-Crafting-A | V (talk exists); D (content) |
| Manifold Garden | William Chyr, solo start; others joined later | 2012 to 2019 | Unity | Indie Fund and platform deals; total not public | long iteration on impossible geometry; GDC 2016 level design talk | https://www.gdcvault.com/play/1023143/Level-Design-Workshop-Level-Design ; https://www.workwithindies.com/learn/ama-with-william-chyr-studio | D |

### 2.1 What developers say (repeated across cases)

| Practice | Cases | Strength |
|---|---|---|
| Keep the scope small and the player action easy to explain | The Exit 8; A Short Hike; Platform 8 | developer talks (one V) |
| Show the concept early: demo or devlog videos | Dreamcore (demo changed the project, V); Escape the Backrooms (devlogs, V); POOLS; Anemoiapolis | developer statements |
| Calm exploration with no monster is a stated design choice | POOLS; Anemoiapolis (optional mode) | interviews and devlogs |
| A solo hit may need partners for ports, co-op and updates | Escape the Backrooms (V) | one case study |
| Spatial tricks need long iteration and clear guidance | Manifold Garden; Superliminal | GDC talks |

### 2.2 Team size and time

No source gives a minimum or ideal team or schedule. Observed routes:

| Route | Cases |
|---|---|
| solo, months | The Exit 8 (about 9), Platform 8 (about 5), A Short Hike (about 4) |
| solo start, years | Dreamcore (about 2.5), Manifold Garden (about 7), Anemoiapolis (about 3 or more) |
| solo launch, then partners | Escape the Backrooms |
| small team, years | Superliminal (about 5) |

These are case reports, not controlled evidence. They do not show that a practice caused sales.

## 3 Not found

- Budgets for all 13 developer cases.
- Team size and full-time months for POOLS, Escape the Backrooms, Backrooms: Escape Together, Dreamcore, Millennium Dream; Manifold Garden at launch.
- Engine for POOLS, Escape the Backrooms, The Complex: Found Footage, Superliminal.
- Marketing spend, wishlist counts, wishlist-to-sale rate and refund rate for any failure case.
- An Anemoiapolis Chapter 2 release or a cancellation notice.
- Post-mortems for the low-score games in class B.
- Review counts marked D: the Steam review API redirected all calls after the C4 pull. Claude retried once and did not bypass the block.
