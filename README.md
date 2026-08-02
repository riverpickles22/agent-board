# agent-board

A local, zero-dependency kanban board — and a protocol for letting any AI
coding agent read it, understand priority, and self-dispatch work — meant to
be used by more than one project instead of being rebuilt into each.

**Origin:** generalized from a board built inside
`chaim-app/chaim-system-design/roadmap/` (see that repo's
`agent-kanban-mvp.md` for the original design thinking). This repo pulls out
the parts that were already project-agnostic — the server, the Board and
Ideas views, the epic/story/idea schema, and the agent selection-rule
protocol — and drops the parts that were specific to that project (a
customer action-item × automation-level dashboard, milestone PRD pages, a
PRFAQ-sourced overview page). Chaim's own board is untouched and keeps
those extra pages; this tool is the shared subset.

## What's here

| File | What it is |
|---|---|
| `server.js` | Zero-dependency Node server: serves the UI, reads/writes a project's `data/*.json`. |
| `index.html` | The whole UI — a single-page app, hash-routed (`#/board`, `#/ideas`), inline CSS/JS, no build step, no `node_modules`. |
| `PROTOCOL.md` | The agent-facing spec: what makes a card pickable, and the claim/work/move loop. Read this before wiring a coding agent to a project's board. |
| `data/` | A demo dataset (two example cards, one example idea) showing the schema. Point `BOARD_DATA_DIR` at a real project instead of using this. |
| `.claude/skills/agent-board/` | A Claude Code skill so any session can read/update a project's board directly, without the server running. |

## Running it

```sh
node server.js                                    # uses ./data (the demo dataset)
BOARD_DATA_DIR=/path/to/project/data node server.js  # uses a real project's data
PORT=5000 node server.js                           # override the port (default 4300)
```

Then open `http://localhost:4300`. No install step — needs only Node.js
(v18+).

## Wiring a project to it

Each project that wants a board gets its own **data directory** —
`epics.json`, `stories.json`, `ideas.json`, and an optional `config.json`
(lane names, priority tiers, open gates, WIP limits — see `server.js`'s
`DEFAULTS` for what applies if a file is missing). This tool has no opinion
about where that directory lives; point `BOARD_DATA_DIR` at it. Two data
directories in use today:

- **arc** — `arc/arc-research-design/roadmap/` (currently just
  `ideas.json`; add `epics.json`/`config.json` there when arc wants the
  full board, not just the idea backlog).
- **chaim** — not migrated. Chaim's existing board at
  `chaim-app/chaim-system-design/roadmap/board/` keeps running as-is; it has
  Dashboard/Milestones/Overview pages this tool intentionally doesn't
  generalize. Point it at this tool later only if that's a deliberate
  choice, not a default.

Adding a third project: create a data directory with the files above (or
none, if starting empty — every resource defaults to sensible empty state,
see `server.js`), then run the server with `BOARD_DATA_DIR` pointed at it.

## Schema

**Epic** (`epics.json`):
```json
{
  "id": "F1",
  "name": "Short name",
  "description": "What it is.",
  "notes": "",
  "priority": "Now",
  "status": "",
  "tags": ["theme-or-milestone-or-whatever-a-project-wants"],
  "gate": "none",
  "deps": [],
  "column": "Backlog",
  "claimed_by": null,
  "claimed_at": null,
  "updated_at": null
}
```
`tags` is deliberately free-form (project-defined meaning — Chaim might tag
with milestone/theme names, arc might tag with phase names); the tool
doesn't hardcode what a tag means, only that it can be filtered on. `gate`
plus `config.json`'s `open_gates` let a human record "don't start this yet,
strategically" without an agent overriding that judgment — see
`PROTOCOL.md` §3.

**Story** (`stories.json`): `{ id, epic_id, name, description, column,
priority, updated_at }` — optional, epic-scoped, empty by default.

**Idea** (`ideas.json`):
```json
{
  "id": "idea-3",
  "title": "Short name",
  "description": "What it is and why it might matter.",
  "status": "idea",
  "priority": "Next",
  "tags": [],
  "notes": "",
  "rejected_reason": null,
  "created_at": "2026-08-02",
  "updated_at": "2026-08-02"
}
```
`status`: `idea → considering → planned → building → done`, or `rejected`
at any point (kept, with a reason, not deleted — same status-lifecycle
pattern as `arc-core/conventions.md` §5: proposed/canon/deprecated).

**Config** (`config.json`, optional — defaults shown in `server.js`):
```json
{ "lanes": ["Backlog","In Progress","Review","Done"],
  "priorities": ["Now","Next","Later","Someday"],
  "open_gates": [], "wip_limits": {} }
```

## Design constraints (kept on purpose)

- **Zero dependencies.** No `npm install`, no build step, no framework —
  just `node server.js`. This is what makes it cheap enough to point at a
  third, fourth, fifth project without a maintenance tax.
- **Files are the database.** Everything is plain JSON under a data
  directory; git is the history and the audit log. No hosted service, no
  schema migrations.
- **Single user (or a person plus their own agents) per data directory.**
  Concurrency is git-commit-safe, not lock-safe — see `PROTOCOL.md` §5. A
  real multi-agent-swarm service is explicitly out of scope; revisit only
  if this genuinely proves insufficient.
