# Direction discussion record, 2026-11-10 to 2026-11-11

Author: Fable. Use: memory of the discussion between the user and Fable. Read it before you propose a direction, a process change or a generator design.

Labels: FACT (checked in files), USER (user words or answers), PROPOSED (Fable idea, not decided), WITHDRAWN (Fable said it, then took it back).

Decided items are not here. They are in `docs/decisions/2026-11-11-sample-room-track-replaces-p2-gate.md` and `docs/handoff/sample-room-workbench-blueprint-2026-11-11.md`.

## 1. The problem the user brought

USER: "做完p0 p1後發現接下來產出的實作計畫仍與想像中不同 看了研究報告也還不太明瞭往哪裡做比較妥當".

## 2. Diagnosis

| # | Finding | Label | Evidence |
|---|---|---|---|
| D1 | The target is visual, but the process asked for a text plan to be accepted first. | FACT | old gate section 7 |
| D2 | All four P2 plan rounds were judged on hand-placed drawings. No generator ever ran. | FACT | `work/c2c_p2plan-rev4.md:40-42` |
| D3 | The plans used "room objects joined by corridor objects". The user asked for continuous space. | FACT | `docs/handoff/space-interview-answers-2026-11-05.md:9` |
| D4 | P1 was frozen before the generator was known. Round 4 then set a limit stricter than P1 (pieces stay in one 64 m cell; P1 permits 64 m overhang on each side). | FACT | `work/c2c_p2plan-rev4.md:22`; `js/v3/core/world.js:264-277` |
| D5 | The research answered market questions, not "what should the space look like". | FACT | `docs/research/review-brief.md` section 1 |
| D6 | The process is heavy for exploration: since 2026-11-05, 37 docs commits and 11 feat commits; 119 Markdown files. | FACT | `git log` count, 2026-11-10 |
| D7 | "流動性" has no checkable definition. | FACT | ChatGPT fact check `c2c_d4b7` |

## 3. What the user said

| Subject | Label | Words or answer |
|---|---|---|
| Round 4 drawings | USER | "圖壞掉了看不出所以然 不是他能控制的問題 我預期空間是具有流動性的 要有房間的概念但有時也不需要"; "整體就不對" |
| Space default | USER | "兩者分區交替" (open areas alternate with thick-wall areas) |
| Where it hurts | USER | "agent一次只能做一種 做不出我理想中的樣子 或許要多做幾種 但是這會有龐大的開發成本"; "空間長相沒畫面"; "程序生成或模板組裝"; "流程太慢太重" |
| Deadline | USER | "沒有硬期限" |
| P0, P1, the 11 phases | USER | "整個放掉也行" |
| The one firm requirement | USER | "有起點到出口的主線". Infinite extent, same-seed result and save were not chosen. |
| How the user takes part | USER | "常看圖、短回饋" |
| Fable's role | USER | "你是fable不應該寫程式 你需要把你所想變成可以讓其他agent照做的藍圖" |
| v1 picture | USER | "特定元件旁潛在的破圖問題一直無法被解決 特定的pattern容易連續遇到好幾個 重複頻率過高"; "光影太平"; "材質單調"; "造型太方太空" |
| v1 water | USER | "水面像貼圖"; "入水沒有回饋"; "水下不像水下" |
| v1 feel | USER | "移動節奏不對"; "碰撞與地形不順" |
| Benchmark | USER | "你的參考圖集" (`pictures/`) |
| Aim | USER | "我說的求的是上限 原本只為了保下限" |
| Sample rooms | USER | "agent 做，我挑"; "畫面目標的試驗場"; vary shape, light, water, material |
| Role of sample rooms in the game | USER | "方案一和二的折衷 我預期有部分完全隨機生成 有部分預先寫好但小部分隨機" (some parts fully generated; some parts written in advance with a small random part) |
| v1 feel faults | USER | "全部併進工作台" (movement, collision, water entry, underwater look all go into the workbench) |
| What the player does other than walk to the exit | USER | "找隱藏的東西"; "跟水和設施互動" |

Not confirmed: the old gate records "能夠無限延伸的結構". Fable reads it as "the structure looks as if it continues", not "the player can walk without end". Ask the user before layout work depends on it.

## 4. Ideas about the layout generator (none decided, none started)

Layout work needs a new user decision. Rules G-01 to G-10 of the old gate stay valid for it.

| # | Idea | Label |
|---|---|---|
| L1 | One lattice is the ground truth. Rooms, corridors and open floor are regions on it. A wall is derived from the border of two regions and is optional. This gives "rooms sometimes, no rooms sometimes" without a second system. | PROPOSED |
| L2 | Several "brushes" (district styles, hand-made templates) write to the same lattice. A new kind of space is a new brush, not a new generator. This answers the cost worry in section 3. | PROPOSED |
| L3 | A macro district layer decides where open districts and thick-wall districts alternate. | PROPOSED |
| L4 | Four pure stages: districts, regions, walls and openings, main line. | PROPOSED |
| L5 | Two-tier generation as in Minecraft structures: a coarse layer is computed from the seed for any place; detail is streamed near the player. Each brush has a bounded reach, so one area needs only its near neighbours. | PROPOSED |
| L6 | Mix generation with hand-made parts. Players praise that mix. | FACT for the praise (`docs/research/review-brief.md` R10); PROPOSED as a choice |
| L7 | A computed 2D layout sandbox: throwaway code that draws real generator output for many seeds, so the user judges computed pictures, not hand-placed ones. A finite window is enough for it. | PROPOSED. Was to run beside the sample rooms; not started. |
| L10 | Consequences of the user answer on the role of sample rooms: (a) a room file later needs variation points (optional parts, alternatives) so that a written room has a small random part; (b) a generator is still necessary for the fully generated parts, so the layout question comes back, but for a smaller job; (c) hidden things need branches and dead ends in the layout; (d) interaction with water and facilities moves props (K12) up. | PROPOSED. Do not add variation points to the format before a milestone needs them. |
| L8 | "The world must be generated all at once." | WITHDRAWN. L5 replaces it. P1 is parked, not dropped. |
| L9 | Keep the v1 runtime and change only the generator behind `world.layout(cx, cz)`. | WITHDRAWN after the user named the v1 faults in light, material, shape, water, movement and collision. |

## 5. Ideas about the process (none written into the rule files)

| # | Idea | Label |
|---|---|---|
| P1 | Two tracks. Exploration: throwaway code, no tests, no plan approval, the user judges output. Formal: the present rules. `AGENTS.md` already frees prototypes from tests. | PROPOSED |
| P2 | The detail of a blueprint matches what is known. Only the next milestone is fixed. | PROPOSED; used in the workbench blueprint |
| P3 | Evidence is "how the output was made": the exact command, seed and commit. Fable re-runs it. | PROPOSED; used as W-04, W-05 |
| P4 | Each brief has a list of files that must not change and a list of stop conditions. | PROPOSED; used in blueprint sections 10, 11 |
| P5 | Decide the layout data format, the mesher design and the fit of P1 only after the look and the layout are found. | PROPOSED |
| P6 | Write a decision record that changes the order set by E1 (`docs/decisions/2026-11-05-v3-rewrite-regions-lifecycle.md`): look first, contract later. | PROPOSED; not written |
| P7 | Survey which v1 parts can be reused (player, water, audio). | PROPOSED; not done |

## 6. Ways an agent can go wrong, and the guard

| Failure | Guard |
|---|---|
| Hand-places a picture and presents it as output | One command makes every picture; Fable re-runs it |
| Hard-codes one case | No id or file name in code; check by `grep` and diff |
| Picks a kind view | Cameras are fixed in data before the first render |
| Meets an unknown and invents an answer | Stop conditions; report, do not improvise |
| Grows the scope | Forbidden file list; `git diff --stat` |
| Declares success | Only the user accepts, in chat |

## 7. Research points that still guide the direction

| Point | Source |
|---|---|
| "Thin, walking only" is the first complaint. | `docs/research/review-brief.md` R1 |
| Praise counts: atmosphere 13, visuals 12, scale and exploration 4. This supports picture quality before layout scale. | `docs/research/c2-player-voice.md:72` |
| Solo projects stop when scope is not small. | R9 |

## 8. Open items

| Item | Who |
|---|---|
| Builder agent and quota for workbench M1 | User |
| One-HTML limit: game only, or the tool too | User |
| Meaning of "無限延伸" (section 3) | User, before layout work |
| Start of layout work (L1 to L7) | User |
| Process ideas P1, P6 into rule or decision files | User must ask for it |
| Which interactions with water and facilities (swim, dive, slide, jump), and what "hidden things" are | User, before layout work |
