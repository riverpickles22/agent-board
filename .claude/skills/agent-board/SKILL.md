---
name: agent-board
description: Work a project's agent-board backlog (ideas, epics, stories, milestones) directly as JSON — no server needed. Use when the user wants to know what to work on next, capture or triage ideas, brainstorm and break a feature request down into an epic with stories and acceptance criteria, clean up / curate the backlog, lay out or update milestone deliverables, move/claim cards, save the board to git, or build a story they've declared ready ("begin X"). Projects today: arc, chaim.
---

# agent-board

agent-board is a local kanban system: one shared codebase
(`~/workspace/agent-board`), per-project JSON data directories, git as the
only versioning. You operate on the JSON files directly — the web UI is a
human lens, not a dependency.

## 1. Read the contract first

Read `<agent-board>/AGENTS.md` (schemas §2, edit rules §3, git conventions
§4, grooming §5, build §6, curation §7) and `<agent-board>/PROTOCOL.md`
(selection rule) before touching data. They are the source of truth; this
skill only tells you when to apply which part.

The project's **context directory** is the `*-system-design` repo holding
the data dir — architecture/strategy/PRFAQ docs live there, and every
`context_docs` path resolves relative to its root. Read the docs a card
links before building or enriching it.

Find the agent-board checkout: `~/workspace/agent-board`, or wherever
`projects.json` + `AGENTS.md` + `server.js` live together.

## 2. Locate the project's board

1. `BOARD_DATA_DIR` env var, if set.
2. `<agent-board>/projects.json` — match by the repo you're working in
   (e.g. cwd under `…/arc/…` → project `arc`).
3. A directory in the current project holding `epics.json` beside
   `config.json`.
4. Ask.

## 3. Workflows

**Operate.** "What's next?" → apply PROTOCOL §3 literally and show your
ranking, naming the milestone each pick serves; an empty result is an
answer (say why). Move/claim/edit cards and triage ideas per AGENTS.md §3.
Respect dependency ordering and gates — gates are opened by humans in
`config.json`, never by you. Milestone deliverables live in
`milestones.json`; when the user asks "where are we on M1?", answer from
its deliverables' epic roll-up, not vibes.

**Curate** ("clean up the backlog", "tidy the board"). AGENTS.md §7, all
five passes: group related/misfiled work, enrich thin cards (what the
change is, `systems` involved, what to read), add `Workflow impact:` notes
where flows change, re-align milestones with their epics, and check
whether Done work has drifted from the architecture/strategy docs —
propose doc updates, never silently edit them. Everything lands as
proposals the user approves.

**Groom** (brainstorm → epic + stories). Talk first, write later. On
"break it down": one epic (propose theme + milestone from config vocab) +
stories with testable `acceptance_criteria`, `context` naming what a
builder must read, honest `kind` (integration testing that outgrows a
feature story is its own `integration` story). Everything lands
`ready: false`; summarize and stop — the user reviews, flips `ready`,
decides when to commit. Full rules: AGENTS.md §5.

**Build** ("begin O1-2" / "begin epic O1"). Verify `ready` (the user
saying it's ready in-conversation counts — record it), claim, read the
story + epic + `context` + the target repo's own CLAUDE/AGENTS conventions,
implement in the code repo, write the tests the acceptance criteria call
for, run the project's checks, verify each criterion and report, move the
card. Full loop: AGENTS.md §6.

**Save.** Board edits are free; git commits happen when the user says
"save"/"commit"/"ratify" — commit the *project's* data repo with a
`Board: …` message. Code commits are separate, in the code repo, under its
rules. Never mix them.

## 4. Running the UI for the user

If the user wants to see the board: `cd <agent-board> && ./board <name>` →
http://localhost:4300 (`PORT=4301` for a second board). If the page is open
while you edit JSON, tell them to reload — the page's next write clobbers
hand-edits (AGENTS.md §3).

When reporting which board you're operating on, use its
`config.view.title` (e.g. "Chaim Build Board"), not just the project key.
`config.view` also holds the default page/milestone/theme applied on open
— update it when the user asks for a different default view, never as a
side effect. First-run on a new machine: `./board setup` installs this
skill's user-level symlink if it doesn't already exist.
