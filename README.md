# agent-board

A local kanban board for feature backlogs, shared by every project you
point it at — plus a protocol and a Claude skill that let AI coding agents
read the same board, break requests into epics and stories, and build the
ones you've marked ready.

This file is for **humans**: what it is and how to run it. If you are an AI
agent, read [`AGENTS.md`](AGENTS.md) and [`PROTOCOL.md`](PROTOCOL.md)
instead — schemas, edit rules, and the work-selection protocol live there.

## Quick start

```sh
./board            # list registered projects
./board arc        # serve arc's backlog
./board chaim      # serve chaim's backlog
```

Then open **http://localhost:4300**. Ctrl+C stops it. Run a second board at
the same time with `PORT=4301 ./board chaim`. Needs only Node.js (v18+) —
no install step, no dependencies, and it binds to `127.0.0.1` only.

`./board` reads [`projects.json`](projects.json), a simple name → data-directory
map. The paths in it are machine-specific on purpose — this is a personal,
single-user tool.

## How it's organized

**This repo is the app; each project owns its data.** The board code lives
here once. A project's backlog lives in that project's own `*-system-design`
repo as plain JSON, versioned by that repo's normal git history:

| Project | Data directory |
|---|---|
| arc | `arc/arc-system-design/roadmap/` |
| chaim | `chaim/chaim-app/chaim-system-design/roadmap/board/data/` |

Saving your backlog **is** a git commit in the project's repo — there is no
other persistence layer, no database, no sync service. Diffs of board
changes show up in normal review like any other file.

## What's on a board

- **Ideas** — the inbox. Anything worth remembering, before it's decided.
  Ideas move `idea → considering → planned → building → done`, or
  `rejected` (kept with a reason, never silently deleted).
- **Epics** — decided work, organized by **theme** (what area it belongs
  to) and **milestone** (when it should roll out), with priorities,
  dependencies, and six-or-fewer lanes you configure per project.
- **Stories** — the buildable slices under an epic, each with acceptance
  criteria, context for whoever builds it, a kind
  (`feature / test / integration / chore / docs`), and a **ready** flag:
  your recorded judgment that there's enough context for an agent to go
  build it.

Themes, milestones, lanes, and priority tiers are all defined per project
in that project's `config.json` — the app has no hardcoded vocabulary.

## Working with AI (the point of all this)

The `agent-board` Claude skill (installed at user level, so it works from
any repo) gives a Claude Code session four abilities:

1. **Operate** — "what should I work on next?", move cards, triage ideas.
2. **Groom** — brainstorm with you, then break a request down into an epic
   and stories with acceptance criteria, landed on the board for you to
   review. Nothing is marked ready by the AI — that's your call.
3. **Build** — when you say a story is ready ("ok, begin O1-2"), the agent
   claims it, reads its context, implements it in the target code repo,
   writes the tests the story calls for, moves the card, and asks before
   committing.
4. **Save** — board edits happen freely; git commits happen when you say
   "save" — that's the ratification step.

## Wiring a new project

1. Create a data directory in the project's design/docs repo (an empty one
   works — every file has sensible defaults).
2. Add a `config.json` with the project's lanes, priorities, themes, and
   milestones (copy `data/config.json` here as a starting point).
3. Register it in `projects.json` with a short name.
4. `./board <name>`.

## Why our own board, not an off-the-shelf tool?

Evaluated 2026-08-02 against Flux, vibe-kanban, cline/kanban, kandev, and
agent-kanban. Kept ours: it's ~1,200 dependency-free lines either of us can
read in full, the data model carries our own concepts (evidence gates,
rejected-with-reason, definition-of-ready), state lives in each project's
repo rather than a container volume or side branch, and the strongest
external argument — offloading maintenance — didn't hold (the closest
design match, Flux, was the least maintained; the best-maintained ones are
heavier than the problem). Revisit if non-Claude agents need the board
(MCP), a second person joins, or the field consolidates on a winner.
