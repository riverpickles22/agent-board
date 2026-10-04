# agent-board roadmap

**Status: Current — 2026-10-04. No milestones ratified; see below.**

Direction and sequence for the tool itself. This is not a queue: the live
work is in [`roadmap/epics.json`](../roadmap/epics.json) and
[`roadmap/stories.json`](../roadmap/stories.json), and outcomes are in
[`roadmap/milestones.json`](../roadmap/milestones.json). `roadmap/` is
local to each checkout and gitignored, so these links resolve only where
that board exists. Run `./board status board` or `./board next board` to
see it.

## Direction

agent-board serves two customers: the human deciding what to build, and
the agent operating the board. Work is filed under the themes in
`roadmap/config.json`: *Decide fast*, *Trust the board*, *Flow*, and
*Agent enablement*.

## Sequence

No milestones are ratified. The board is ideas-first: proposals are
captured and shaped in `roadmap/ideas.json`, and approved ones become epics
in priority order. When a direction is ratified, record it as milestones in
`roadmap/milestones.json` and describe the sequence here.

## Evidence gates

None are defined; `open_gates` in `roadmap/config.json` is empty. Add a
gate here and in config together when one is agreed.
