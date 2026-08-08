# agent-board

A local kanban board for feature backlogs, shared by every project you
point it at — plus a protocol and a Claude skill that let AI coding agents
read the same board, break requests into epics and stories, and build the
ones you've marked ready.

This file is for **humans**: what it is and how to run it. If you are an AI
agent, read [`AGENTS.md`](AGENTS.md) and [`PROTOCOL.md`](PROTOCOL.md)
instead — schemas, edit rules, and the work-selection protocol live there.
For the one-page medium view of everything the tool can do, see
[`CAPABILITIES.md`](CAPABILITIES.md) — a running board also serves it at
`/docs` (and `/llms.txt`, for agents that only have the URL).

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
| board | `agent-board/roadmap/` — this repo, dogfooding its own backlog |

Saving your backlog **is** a git commit in the project's repo — there is no
other persistence layer, no database, no sync service. Diffs of board
changes show up in normal review like any other file.

## What's on a board — the context stack

Four layers, each answering a different question:

1. **The system** (*what are we building?*) — the project's
   `*-system-design` repo is the **context directory**: architecture,
   strategy, PRFAQ. The Milestones page opens with a one-paragraph
   overview linking those docs. Git history of that repo is the record of
   how the plan evolved.
2. **Milestones** (*what do we seek to accomplish, when?*) — one place
   per milestone: summary, gate/exit criteria, and deliverables that link
   down to epic chips with a live done-count. Rendered on the
   **Milestones** page from `milestones.json`.
3. **Epics & stories** (*the work*) — epics organized by **theme** and
   **milestone**, with priorities, dependencies, and the **systems** each
   change touches. Stories are the buildable slices: acceptance criteria,
   context for whoever builds it, a kind
   (`feature / test / integration / chore / docs`), and a **ready** flag —
   your recorded judgment that there's enough context for an agent to go
   build it.
4. **Ideas** (*the inbox*) — anything worth remembering, before it's
   decided. Three active columns: `idea → ready for review → ready to
   implement`, then `done` — with `rejected` kept alongside done in an
   archive toggle (with a reason, never silently deleted). **Ready for
   review** is the AI's hand-off: an agent moves an idea there itself
   once the deep dive holds enough for you to decide; **ready to
   implement** is your thumbs-up. Approved ideas are decomposed into an
   epic + stories on the board before building — even a small ad hoc
   request gets a lightweight epic with one story, milestone optional —
   and the agent moves those cards through the lanes live as it works.

Themes, milestones, lanes, and priority tiers are all defined per project
in that project's `config.json` — the app has no hardcoded vocabulary.

**Each project also owns its view** (`config.json` → `"view"`): the board
`title` shown in the header and browser tab — so you always know *which*
project you're looking at — and the default page, milestone, and theme
filters applied when the board opens. Set up the filters you like and
click **★ set as default view** in the filter bar to save them; the button
only appears when your current view differs from the saved one.

## The Claude skill — nothing to set up, nothing to update

**Setup is automatic.** Every `./board` run (listing, serving, anything)
installs or repairs the skill symlink at `~/.claude/skills/agent-board` if
it's missing — there is no separate command to remember. `./board setup`
still exists if you want it to explain itself, and it refuses (rather than
overwriting) if something unexpected occupies that path.

**Updates are automatic too.** The install is a *symlink into this repo*,
never a copy — so when the skill changes here (your edits or `git pull`),
new Claude sessions see the latest version with no action from you. There
is no copy step, ever.

**Activating it:** nothing to do — new Claude Code sessions in *any* repo
discover user-level skills automatically, and this one activates when you
talk about backlog work: "what should I work on next?", "break this
request down into stories", "begin O1-2", "save the board".

**Linking it to the project you're working with:** the session resolves
which board you mean in this order — `BOARD_DATA_DIR` env var if set, then
`projects.json` matched against the repo you're sitting in, then asking
you. So registering a project in `projects.json` is all the linking a new
project needs.

## Working with AI (the point of all this)

The `agent-board` Claude skill gives a Claude Code session five abilities:

1. **Operate** — "what should I work on next?", move cards, triage ideas,
   "where are we on M1?" answered from the milestone's deliverable
   roll-up.
2. **Groom** — brainstorm with you, then break a request down into an epic
   and stories with acceptance criteria, landed on the board for you to
   review. Nothing is marked ready by the AI — that's your call.
3. **Curate** — "clean up the backlog": group related work, enrich thin
   cards (what the change is, systems involved, what to read first), note
   workflow impact, re-align milestones with their epics, and flag when
   finished work has drifted from the architecture or strategy docs —
   proposing doc updates for you to ratify, never silently editing them.
4. **Build** — when you say a story is ready ("ok, begin O1-2"), the agent
   claims it, reads its context, implements it in the target code repo,
   writes the tests the story calls for, moves the card, and asks before
   committing.
5. **Design** — "redesign the ideas page", "add X to a card": the UI
   itself is defined by markdown specs in [`design/`](design/DESIGN.md) —
   one ASCII-wireframed spec per screen. The agent edits the spec first,
   you approve the sketch, then it makes `index.html` match. Spec and UI
   always change together, so the specs stay a true picture of the app.
6. **Save** — board edits happen freely; git commits happen when you say
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
