# Research spec: poolcore / liminal works and game development methods

Date: 2026-11-09. Status: LOCKED by user in chat 2026-11-09; revised same day (R-06 added, feasibility labels removed). Owner: user.

## 1. Goal

Give the user a reference for game development. Two parts:

| Part | Subject | Depth |
|---|---|---|
| A | Works: poolcore, liminal space, and the adjacent types in section 3 | Theme, flow, content outline, visual fields. No detailed game design. |
| B1 | General success principles | Principle, evidence, example games |
| B2 | Why specific systems succeeded, and how they are made | Success cases plus a technique comparison |

Sources for B do not need to relate to poolcore.

## 2. Hard rules

| ID | Rule |
|---|---|
| R-01 | Keep every concept on its own research line. Do not join two user examples into one direction (for example, NOT "poolcore procedural map generator"). |
| R-02 | Do not research only the user's examples. Add similar and different examples in every category. |
| R-03 | The direction in this file is locked after user approval. Do not change it during research. |
| R-04 | Do not judge platform feasibility (for example single-HTML or web). Feasibility is assessed after the research, as separate work. No fps or course-assignment limit applies. |
| R-05 | Sources in English, Chinese and Japanese. |
| R-06 | The output is a general game-development reference. You may cite The Deep End (this repo) only as a short example, one line maximum per mention. Do not write advice, sections or filters that serve only this game. |

## 3. Part A scope

Categories (all equal weight unless noted):

1. Poolcore
2. Liminal space / Backrooms
3. Dreamcore, weirdcore and related web aesthetics
4. Non-liminal exploration games where space is the main subject (walking sim, architecture puzzle, non-Euclidean)
5. Non-horror calm / healing spaces
6. Analog horror and found footage: camera and media technique ONLY, not its aesthetic or lore
7. Non-game sources (original posts, video series, photography, 3D animation): same fields as games

Include unreleased, early-access and cancelled works if public material exists. Mark the status.

Membership rule: a work belongs to a category if (a) the author uses the label, or (b) a store tag plus one independent source use it, or (c) two independent sources use it. Write the basis in the entry.

One work = one full entry with one or more category tags. Do not write a second entry for another category.

Depth: the agent decides. Famous works, deep games and works worth writing about get more text. Other works may also get more text.

Fields per work:

| Field | Note |
|---|---|
| Theme | |
| Flow | For non-game works: narrative or viewing structure |
| Content outline | |
| Art style and rendering | |
| Lighting and colour | |
| Camera and media texture | Lens, VHS, noise, materials (tile, water, reflection) |
| Space composition and scale | Room shapes, repetition, scale distortion, routes |
| Status | Released / early access / unreleased / cancelled |
| Sources | With tier (section 6) |

Images: download official store or press screenshots to `work/research-img/` (git-ignored). Embed them in the final HTML. Do not download video; link it. For non-game works with no store or press kit: use images the original author published (own site, social account, video thumbnail); record author and URL. If none exists, give a link only.

## 4. Part B1 scope

Domains: player motivation and retention; visual quality and lighting; atmosphere and tension (audio, pacing, negative space); onboarding and usability.

Per principle: statement, evidence, example games.

Evidence: research data, developer experience and critic analysis are all accepted. Mark the evidence type on each principle. Do not state a causal claim when the only evidence is that successful games share the trait.

## 5. Part B2 scope

Seed systems: procedural map generation; lighting and atmosphere rendering; water rendering; ambient audio; enemy or chase AI; movement feel; environmental storytelling; progression and replay loop.

Add a system when a source clearly credits a game's success to it.

"Success" needs BOTH: public data (sales, reviews, awards) AND a developer source (GDC talk, postmortem, interview) or a critic that credits the system.

Per system: 2 to 4 success cases (game, evidence, why it worked); one technique comparison table (pros, cons, conditions where it fits; platform-neutral); key references. No code.

If a system has only 0 or 1 qualified case: keep the system, list what exists, complete the technique table, and mark "not proven as a success cause". Do not use weaker cases to fill the count.

## 6. Cross-review protocol

1. Claude and ChatGPT research each topic independently, then review each other.
2. Rounds 1 to 3: resolve every blocking gap. Blocking gap = (a) a missing well-known work or whole category, (b) a wrong fact, (c) a key claim with no source. Log other findings; do not re-research them.
3. After round 3: resolve only systemic issues (they change later implementation, change the method, or overturn a conclusion). Log single-aspect details only.
4. Source tiers: official / developer (store page, GDC, interview, devlog) > media review > community and wiki. Community sources are allowed and marked.

## 7. Outputs

| Output | Location | Language |
|---|---|---|
| Internal notes | `docs/research/*.md` (max 32 KiB each, no images) | English, ASD-STE100 |
| Final report | `work/research-report.html` (git-ignored, contains third-party screenshots, personal use, not published) | Chinese |

Make the HTML once, after all research and review end. Do not revise or review it after that.

Preflight before that one build: check that every entry has the required fields, every source has a URL and tier, every image file exists, and the HTML template renders with test data.

## 8. Related decision

The project-level limit change is in `docs/decisions/2026-11-09-drop-fps-and-assignment-limits.md`. It does not affect this research.
