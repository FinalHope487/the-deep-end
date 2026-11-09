# Research handoff

Date: 2026-11-09. From: planning session. To: a new research-only session.

## 1. Read first

1. `AGENTS.md`
2. `docs/research/00-spec.md` (LOCKED). It is the full contract: goal, hard rules R-01..R-06, Part A/B1/B2 scope, cross-review protocol, outputs. Do not change its direction (R-03). Do not re-ask the user anything it already answers.

Ignore `docs/decisions/2026-11-07-v3-p2-room-generator-gate.md` for this task. It controls the P2 room generator goal, not this research.

## 2. Done

| Item | Evidence |
|---|---|
| User interview (23 questions + gap review G1..G7 by Claude and ChatGPT) | Results are in `00-spec.md` |
| fps and course-assignment limits removed from the project | `8a840c1`, `docs/decisions/2026-11-09-drop-fps-and-assignment-limits.md` |
| Spec revised: general output (R-06), no platform feasibility labels (R-04) | `bde0f3d` |
| ChatGPT bridge connected; workspace check passed (`workspaceId 6ff5857c6307`) | 2026-11-09 |

Nothing of Part A, B1 or B2 is researched yet. No ChatGPT research request was sent.

## 3. To do, in order

| # | Step | Output |
|---|---|---|
| 1 | Part A candidates: Claude and ChatGPT each list candidates for all 7 categories (spec section 3), independently. Merge. Cross-review for missing works or categories. | `docs/research/a-candidates.md` |
| 2 | Part A entries: split works between Claude and ChatGPT; each reviews the other's entries. Download images (spec section 3). | `docs/research/a-*.md`, `work/research-img/` |
| 3 | Part B1 (spec section 4) | `docs/research/b1-*.md` |
| 4 | Part B2 (spec section 5) | `docs/research/b2-*.md` |
| 5 | Preflight, then build the HTML once (spec section 7) | `work/research-report.html` |
| 6 | Commit `docs/research/` and push `main` | |

Steps 3 and 4 do not depend on steps 1 and 2. You may run them in parallel.

## 4. ChatGPT procedure

Use the skill `agents-with-chatgpt` (Claude bridge document). Facts for this workspace:

| Fact | Value |
|---|---|
| Workspace name / id | `dreamcore-explorer` / `6ff5857c6307` |
| Connector | `Claude with ChatGPT · hub` |
| Conversation mode | long-chat; saved chat URL from `c2c session -w <repo> --json` |
| Setup mode | manual (machine pref); tunnel is a fixed domain, no reconnect needed when doctor is green |
| CLI | `node "D:/my-projects/agent-with-chatgpt/bin/c2c.js" <command>` |

Start of session: `update-check --json`, `doctor -w hub --json`, `workspace add -w <repo> --json`, then open the saved chat in the built-in browser and run the workspace check.

Rules for each request:

- Start the message with "Ignore earlier discussion in this chat." The saved chat holds old P2 planning history.
- Name the spec path; do not paste file contents. ChatGPT reads files through the connector and uses its own web search.
- ChatGPT cannot write files. Copy its reply into the `docs/research/` notes yourself.
- Use a new task id per step (for example `c2c_rsA1`). Record checkpoints with `c2c session set`. `session set` does not accept `--json`.
- High-effort replies take 5 to 15 minutes. Poll the page tail with `javascript_tool` (`document.querySelector('main').innerText.slice(-N)`); `get_page_text` returns the top of the chat, not the tail.

## 5. Output rules (summary; the spec wins on conflict)

- Notes: English ASD-STE100, max 32 KiB per file, no images.
- `work/` is git-ignored through `.git/info/exclude`. Third-party images and the HTML stay there. Do not publish them.
- Do not commit `AGENTS.md`, `claude-decisions.json` or `docs/codex-collaboration.md`. They have edits from another source.
- Docs-only commits: no cold review (AGENTS.md).

## 6. Opening prompt for the new session

    Read docs/research/HANDOFF.md and follow it. Start at section 3 step 1.
