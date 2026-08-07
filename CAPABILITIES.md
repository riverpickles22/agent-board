# agent-board — what it can do

*The medium-altitude view, for humans and agents. As of 2026-08-05.
Served by the running board at `/docs` and `/llms.txt`. Details:
[README.md](README.md) (humans) · [AGENTS.md](AGENTS.md) +
[PROTOCOL.md](PROTOCOL.md) (agent contract) · [design/](design/DESIGN.md)
(UI specs).*

## What it is

A local, zero-dependency kanban system shared by multiple projects. Each
project's backlog is plain JSON files in that project's own repo; **git is
the only persistence** (commit = the human ratifying the working state).
AI agents operate on the JSON files directly — the web UI
(`./board <name>` → localhost:4300) is a human lens, never a dependency.
Binds to 127.0.0.1 only.

## The three pages (in flow order: capture → intent → work)

**Ideas** — the inbox. Three active columns: `idea` →
`ready for review` (the agent's hand-off: the deep dive holds enough to
decide) → `ready to implement` (the human's thumbs-up). Cards drag
between the active columns (and between burners, nudging priority);
the archive is not a drop target since rejecting requires a reason.
The Idea column
splits into **Front burner / Back burner** by priority so attention goes
to the top. `done` and `rejected` live behind an archive toggle.
Ideas can declare informational `deps` (shown only when set). Each idea
has a deep-dive page: context, pros/cons, a **decision lens** (effort ×
impact, quick-win flag, compounding), freeform sections, and an
append-only dated brainstorm log.

**Milestones** — the narrative. Per milestone: summary, user outcome,
gate/exit criteria, ROI, context docs, and **deliverables that roll up to
epic chips with live done-counts** (click a chip to jump to the card on
the board). Optional architecture block showing subsystems as
new/changed/existing. ←/→ keys step through milestones.

**Board** — the work. Kanban over epics with drag-and-drop, a
**dependency guard** (a card can't enter the done lane before its deps;
deps can't leave while dependents are done), and a **Next up strip** that
renders the agent selection rule with each pick's why (priority ·
unblocks N) — human and agent see the same answer to "what's next".
Filters by milestone/theme/tag with a savable per-project default view.
A **Rows mode** toggle (Epics | Rows) switches the board to story
swimlanes: one row per epic, its stories as draggable cards across the
same lanes — stories move within their row, gated epics refuse drops,
and the preferred mode saves with the default view. Stories (buildable
slices with acceptance criteria and a human-set `ready` flag) also live
inside each epic's modal.

A fourth **Docs** tab renders this document inside the UI, so a person
browsing the board sees the capabilities without the repo or curl.

## What an agent can do (the Claude skill)

- **Operate** — answer "what's next?" via the selection rule (pickable =
  first lane + deps done + gate open + unclaimed + WIP under limit;
  ranked by priority → unblock count → file order); move/claim cards;
  triage ideas.
- **Groom** — brainstorm → one epic + stories with testable acceptance
  criteria; everything lands `ready: false` for human review.
- **Curate** — six propose-then-approve passes: group, enrich, workflow
  impact, milestone alignment, context-doc drift, **design drift**
  (UX specs vs the actual UI).
- **Develop an idea** — fill the deep-dive fields through conversation;
  judge by the decision lens; **self-move the idea to `ready for
  review`** when it's decision-ready (the one status an agent sets
  unprompted).
- **Build** — verify ready → claim → read the story/epic/context →
  implement in the code repo → test → verify each criterion → move the
  card. New **value drivers** get folded into the docs (including this
  file) in the same change.
- **Design** — change the UI itself, spec-first: edit the screen's
  markdown spec in `design/` (ASCII wireframe + anchored component
  tables), get approval, then make `index.html` match. Spec and UI
  always commit together.
- **Save** — git commits only on the human's explicit "save"/"ratify".

## The machinery underneath

- **Per-project vocabulary** — lanes, priorities, themes, milestones,
  gates, WIP limits all live in each project's `config.json`; nothing is
  hardcoded (lane semantics are positional: first = todo, last = done).
- **Gates and WIP limits** — a gate is opened by a human in config, never
  by an agent; both feed the selection rule and the Next-up strip.
- **UX-spec framework** — every screen is described in `design/*.md`;
  drift is detectable by flag (`spec_state`), anchor grep, and curation.
- **Zero-step setup and updates** — any `./board` run self-installs the
  Claude skill as a symlink; updates in this repo are live for new agent
  sessions with no copy step.
- **Multi-project** — `projects.json` registers name → data dir; one
  codebase serves arc, chaim, and agent-board's own dogfood backlog.
- **Live reload** — the server watches the data dir and pushes change
  events to every open page, which refetches and re-renders. Agent edits
  to the JSON appear in an open browser within a second; no manual
  reload, and the page no longer clobbers file edits with stale state.
  (Refreshes wait politely while a modal, drag, or save is in flight.)

## HTTP surface (the running site)

`GET /` (the UI) · `GET /api/board` (full board JSON) ·
`PUT /api/<epics|stories|ideas|config|milestones>` (whole-file write) ·
`GET /api/events` (SSE change feed — powers live reload) ·
`GET /docs` + `GET /llms.txt` (this document).

---

*Maintenance rule (AGENTS.md §6): any medium-or-larger capability change —
new UI surface, workflow, route, or status semantic — updates this file
in the same change, at this altitude: what it does, not how.*
