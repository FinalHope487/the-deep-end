# Part C6 — more player voices, recent and multi-language re-tally, second coder

Date: 2026-11-10. Writer: Claude. Second coder: ChatGPT (blind). Base themes: `c2-player-voice.md` 2.5. Codebook: `work/c6-codebook.md`. Codes: `work/c6-codes-claude.txt`, `work/c6-codes-chatgpt.txt` (git-ignored work files).

## 1 Sample

| Item | Value |
|---|---|
| Games | 21 core genre games (groups 1–3 in `c4-price-and-trends.md`) |
| Pools fetched | Steam negative reviews: most helpful (all languages), most recent (all languages), most helpful in simplified Chinese, Japanese and English |
| Dedup | first 120 characters of the text (the Steam page offset is ignored, so page 2 repeats page 1) |
| Coding sample | 147 reviews, stratified: up to 3 most helpful + 2 most recent + 1 zh + 1 ja + 1 en per game; seed 20261110 |
| Strata | top-all 63, recent 38, en 18, zh 16, ja 12 |
| Text | cut at 400 characters |
| Rule for both coders | Steam labels ("Product refunded", "Early Access Review") are not review text. X only when no other code fits. |

## 2 Agreement between two blind coders

Coder A: Claude. Coder B: ChatGPT in a new chat that could read only the codebook and the sheet. Coder A saved its codes outside the workspace until coder B finished.

| Code | Theme | A | B | Both | % agree | Cohen kappa |
|---|---|---|---|---|---|---|
| T1 | thin, boring, walking only | 47 | 55 | 46 | 93 | 0.85 |
| T2 | short or poor value | 14 | 19 | 14 | 97 | 0.83 |
| T3 | performance, bugs, bad update, servers | 37 | 38 | 36 | 98 | 0.95 |
| T4 | missing options, save, control comfort | 29 | 33 | 27 | 95 | 0.84 |
| T5 | clone, asset flip, cash grab | 6 | 5 | 4 | 98 | 0.72 |
| T6 | expectation mismatch | 17 | 27 | 17 | 93 | 0.74 |
| T7 | unfinished or abandoned | 6 | 8 | 6 | 99 | 0.85 |
| T8 | cheap scares, hostile monster | 11 | 12 | 11 | 99 | 0.95 |
| T9 | chapters or hub break the flow | 4 | 4 | 4 | 100 | 1.00 |
| T10 | AI content | 5 | 5 | 5 | 100 | 1.00 |
| X | other | 30 | 20 | 20 | 93 | 0.76 |

Whole-set match on 112 of 147 reviews (76 %); mean Jaccard 0.85; mean kappa T1–T10 0.87. A kappa above 0.8 is usually read as strong agreement. T5 and T6 are 0.72–0.74.

Where the coders differ (35 reviews):

| Pattern | Reviews | Fix for the codebook |
|---|---|---|
| B codes T6 for "not the poolrooms theme" or "not like POOLS", with no promise from the store or a demo | R003, R007, R105, R112, R114, R146 | T6 needs an explicit source of the promise (demo, prequel, store page, trailer, tags). A theme drift is X. |
| B adds T1 to "boring for me" or "pixel hunting" | R041, R136, R141, R088, R096 | keep T1 for "nothing to do / repeats"; "not for me" is X |
| B adds T2 to a refund or "should be free" | R027, R062, R064, R076, R082 | a refund word alone is T2; the codebook already says this |
| A adds T5 for low effort or an in-game store | R037, R062 | T5 needs "copy", "assets", "cash grab" or "low effort" in the text |
| B adds T4 to slow or dark play | R042, R113, R131, R134 | slow walk and darkness are T4; coder A missed some |

The theme ranking does not depend on the coder: both coders put T1 first, T3 second and T4 third.

## 3 Theme share by stratum

Cell = % of reviews in the stratum with the code. Range = both coders agree (low) to either coder (high).

| Code | all (147) | top-all (63) | recent (38) | en (18) | zh (16) | ja (12) |
|---|---|---|---|---|---|---|
| T1 thin, walking only | 31–38 | 30–32 | 32–45 | 33–39 | 31–44 | 33–42 |
| T3 performance, bugs | 24–27 | 25–27 | 26–29 | 22–28 | 25 | 17 |
| T4 options, comfort | 18–24 | 14–17 | 16–26 | 28–33 | 31–38 | 17 |
| T6 expectation | 12–18 | 16–24 | 5–11 | 22 | 0–6 | 8–25 |
| T2 short, value | 10–13 | 8–13 | 16 | 11 | 6–12 | 0–8 |
| T8 cheap scares | 7–8 | 10 | 11 | 6 | 0 | 0–8 |
| T7 unfinished | 4–5 | 6–8 | 0 | 0–6 | 12 | 0 |
| T5 clone | 3–5 | 3–6 | 3 | 0–6 | 6 | 0 |
| T9 hub, chapters | 3 | 2 | 3 | 6 | 0 | 8 |
| T10 AI content | 3 | 5 | 3 | 6 | 0 | 0 |

Playtime of the negative reviewers (median hours, share under 2 h): top-all 2.3 h, 44 %; recent 2.0 h, 47 %; en 1.3 h, 61 %; zh 1.75 h, 50 %; ja 1.55 h, 67 %.

What changes from C2:
1. The order stays. "Thin, walking only" is the first complaint in every stratum and both languages. C2's result is not an artifact of English "most helpful" reviews.
2. Most-helpful reviews hold more expectation complaints (T6 16–24 %) than recent ones (5–11 %). Long comparison reviews ("the demo was better", "not like Exit 8") get the helpful votes.
3. Recent reviews hold more value complaints (T2 16 %) and more T1 (up to 45 %).
4. Chinese reviews ask most for options and comfort (T4 31–38 %): no Chinese text, machine translation, no key rebind, no save. They also report abandoned games (T7 12 %).
5. AI content (T10) is a new theme: 5 reviews, all for 2026 games (Dreamcore: Rabbit Hole, Millennium Dream). C2 did not have it.
6. Strata of 12–18 reviews give wide error (about ±25 points). Read the language columns as signs, not shares.

## 4 More voice sources

### 4.1 Bilibili (search API, sorted by plays, 2026-11-10)

Top three videos per game, three hot comments each. The search API returned HTTP 412 after some calls; Claude did not bypass it. Yume Nikki returned no data.

| Game | Top video plays | What the hot comments say |
|---|---|---|
| The Exit 8 | 9.0M, 5.7M, 5.2M | rule explanations and anomaly time stamps; viewers learn the rule from the video |
| Escape the Backrooms | 6.9M, 5.9M, 2.9M | the removed "return to the front rooms" exit ending is called "despair for its own sake" (15,588 likes); a request for a peaceful difficulty (1,896) |
| Millennium Dream | 3.0M | nostalgia for childhood; few comments (TV client viewers) |
| Dreamcore | 2.8M; Rabbit Hole pool chapter 1.9M | the pool chapter is a favorite; "why do I feel sick watching" (motion); a Daisy Bell game is criticized for random jumpscares (3,382) |
| POOLS | 1.5M, 0.9M, 0.6M | "no monster lets me enjoy the atmosphere; the duck that follows but never kills is just right" (791); "a ghost follows you but never jumps out" (3,681); "a cyber Louvre for 30 yuan" (1,013) |
| Backrooms: Escape Together | 0.54M | level bugs, blocked exits |
| Platform 8 | 0.31M | "how do you find the light rule without a guide?" (521) |
| Anemoiapolis | 0.21M | real 1980s bathhouse memories (1,821); fear of dark water you cannot see into (1,274); "no monster, only curiosity" (731) |
| LIMINAL WATERS | 16K | people watch pool videos to fall asleep; water sound as a sleep aid |

### 4.2 Steam discussions (first page, non-pinned, reply count)

| Game | Threads with most replies |
|---|---|
| The Exit 8 | "DO NOT BUY THIS GAME" 58; "Other games like this?" 54; "Some anomalies too subtle" 32 |
| POOLS | "$10.80 for a 2 hour walking game" 57 |
| Backrooms: Lost Tape | "Why is this game hated so much?" 42 |
| Liminalcore | "Looks amazing in VR with UEVR" 35; "Disappointed with the AI art" 8 |
| Anemoiapolis | "Hopes for Chapter 2" 30, plus 3 more chapter-2 threads; "VR support" 20 |
| Hypnospace Outlaw | "games like this" 27 |
| The Complex: Found Footage | "Proof backrooms doesn't work as a game" 25; "Why can't you save" 10 |
| The Complex: Expedition | "Option to disable VHS filter and 4:3" 16; "How to play the better Early Access version" 7 |
| Dreamcore | "Level 3 is horrific" 16; "no entity" 12 |
| Liminality | "Hard crashing" 14; "Are the maps in this game original?" 6 |
| Dreamcore: Rabbit Hole | "VR update" 11; "Sunflower level" 10 |

Two signs that the reviews do not show:
- VR requests in 7 of 20 games (POOLS, Liminalcore, Anemoiapolis, Escape the Backrooms, Dreamcore, Dreamcore: Rabbit Hole, Millennium Dream).
- "Games like this?" threads with many replies (The Exit 8 54, Hypnospace Outlaw 27, Platform 8 15): finished players look for more of the genre.

## 5 Not done

- YouTube comments and Japanese community sites (5ch, note.com, X in Japanese): not read in this round.
- Bilibili beyond the first search block.
- A third coder or a tie-break pass. Use the range in section 3.
