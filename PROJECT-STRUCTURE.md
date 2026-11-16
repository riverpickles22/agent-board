# Shared project structure

Every project uses the same places for context and progress, so a person or
agent can switch projects without learning a second tracking system. This
contract applies to all projects registered with agent-board and to new
projects created for this workspace.

## Required layout

```text
<project>/                         workspace; may hold several Git repos
  AGENTS.md                        entry point linking to the project briefing
  <project>-context/         canonical context repo
    AGENTS.md                      project briefing and links to code repos
    README.md                      human orientation
    design/
      README.md                    design index and document placement rules
      hld.md                       architecture map; distinguish built/proposed
      <subject>/                   detailed designs as needed
    strategy/
      roadmap.md                   direction, sequence, and evidence gates
      ...                          strategy, PRFAQ, research as needed
    roadmap/
      README.md                    board usage and project-specific conventions
      config.json                  vocabulary, gates, WIP limits, saved view
      ideas.json                   proposals and decisions
      epics.json                   the sole live epic backlog
      stories.json                 buildable slices and verification evidence
      milestones.json              outcomes and deliverables linked to epics
      capabilities.json            optional; reusable capabilities — the shared
                                   registry is on agent-board's own board
      archive/                     clearly labelled historical material
      .gitignore                   lists journal.jsonl — the server's change
                                   journal is working state, never committed
  <code-repo>/
    AGENTS.md                      local implementation and verification rules;
                                   links to the project briefing
```

The workspace entry point must link to the canonical briefing rather than
copy its body. A symlink is also valid. Other agent entry points, such as
`CLAUDE.md`, must lead to that same briefing. Resolve context paths from the
context repo root, regardless of the agent's current directory.
Code repos that already use `CLAUDE.md` may retain that entry point; it must
link to the same project briefing and carry the local implementation rules.

Agent-board itself is the tooling exception: its context, UI specifications,
and `roadmap/` live in this repo. Do not create a second copy of the tool to
satisfy the layout. Its design index is `design/DESIGN.md`.

## One source for each kind of information

- `design/` explains the system and clearly labels proposals. Cross-check
  the code before describing a proposal as implemented.
- `strategy/` explains why and in what order. The narrative roadmap links
  to `roadmap/milestones.json` and the live epics; it is not a second queue.
- `roadmap/` records current progress. CSVs and prose lists may be dated
  snapshots or generated exports, never a separately maintained backlog.
  The running server also writes `roadmap/journal.jsonl` (who changed what
  since the last save, AGENTS.md §3); it is working state and stays out of
  git through `roadmap/.gitignore`. `./board new` writes that file when the
  data dir has none; an existing project adds the one line `journal.jsonl`.
- Code repos hold implementation details and their checks. Cross-project
  schemas and workflow rules live in agent-board's `AGENTS.md` and
  `PROTOCOL.md`; project briefings link to them rather than fork them.

Subjects, themes, priorities, milestones, lane names, and evidence gates
remain project-specific and come from `config.json`. Consistency means the
same ownership and workflow, not identical product plans. A project may keep
additional reference material; index it and state whether it is current,
proposed, or historical. Create subject folders only when they hold content.

## What a document must say

The layout above says where a file goes. These three rules say what it
holds. Each exists because two projects that matched the layout exactly
drifted the same way without it.

**The briefing stays a briefing.** `AGENTS.md` holds what an agent must
obey: what the project is, where its repos and checks are, the rules
specific to it, and links out to everything else. It does not hold document
abstracts, section-by-section tours of another file, or a restatement of
the shared work loop. When an entry in it grows past a few lines, move the
body into the document it describes — or into the index that lists it — and
leave the link. Length is not the test; a long briefing of
project-specific rules is doing its job. Describing other documents instead
of governing the work is the failure.

**Every document says what it is.** A status line near the top: `Current`,
`Proposed`, `Draft`, or `Historical`, with the date it was last checked
against reality. A design document that describes unbuilt behaviour marks
that section proposed, per-section when the document mixes both;
cross-check the code before writing `Current`. The architecture map
(`design/hld.md`) is re-checked each time an epic closes, by the agent
that built it (AGENTS.md §6 step 8), so its date moves with the work. `design/` and `strategy/`
each carry a README indexing their documents with that status, so a reader
learns whether a file still holds without opening it.

**A narrative may argue an order; it may not keep a queue.** `strategy/`
exists to explain why and in what order, and that argument is worth more
than the board can hold — keep it. But anything a document tracks as open
(a risk, an unresolved question, a thing to decide) exists as a card,
and the document names it. A bullet list of open items in prose is a queue
no board can see, and it is the drift this contract exists to prevent.

## The common work loop

Start with the project briefing, `board status <project>`, and the card's
linked context. Use `board next <project>` when selecting work. Capture
ideas, shape them for human review, then decompose approved work into an
epic and stories before building. Readiness and gates remain human decisions.

Claim and move each story before coding. Record acceptance evidence and
`how_to_test`, then move it to the project's review or completion lane as
soon as that stage is reached. Use `needs` for a specific blocking question.
Keep the card current across changes to multiple code repos; record commit
hashes when those commits are authorized. Update affected design documents
and instructions with the implementation.

Commit only on explicit instruction. Keep board data, design/strategy
documents, and code changes in separate commits in their owning repos.
Agent-board's UI exception remains: its screen spec and matching UI change
belong together in one `Design:` commit, separate from board data.

## Maintaining the structure

Before registering a project or moving its documents, check this contract.
Update the project briefing, design index, incoming links, and card context
paths in the same change. Preserve IDs, decisions, approvals, history, and
existing uncommitted work. A migration must not approve unrelated work.

Run `board doctor <project>` and check moved document links after a migration.
Doctor validates board data; it does not enforce this directory layout.
Propose changes to this shared contract here before introducing a different
structure in one project. A future scaffold or validator must use this
contract rather than define another one.
