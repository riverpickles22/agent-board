# AGENTS.md — agent-board

**You are an AI agent working with an agent-board backlog.** This file is
the contract: schemas, edit rules, and conventions. The human-facing tour
is [`README.md`](README.md); the work-selection rule and claim loop are in
[`PROTOCOL.md`](PROTOCOL.md) — read that before picking up work.

## 1. Where data lives

Each project's backlog is a directory of JSON files, registered in
[`projects.json`](projects.json) (name → absolute path). Resolution order
when locating a board: `BOARD_DATA_DIR` env var → `projects.json` → a
directory in the current project containing `epics.json` beside
`config.json` → ask the user.

The files are the source of truth. The web app (`./board <name>`) is a
view over them; you do not need it running. Edit the JSON directly.

```
<data-dir>/
├── config.json    # vocabularies: lanes, priorities, themes, milestones, open_gates, wip_limits
├── ideas.json     # the inbox: not-yet-decided requests
├── epics.json     # decided work, by theme + milestone
└── stories.json   # buildable slices under epics
```

## 2. Schemas

**Config** — all vocabularies are per-project; never hardcode them:
```json
{ "lanes": ["Backlog","In Progress","Done"],
  "priorities": ["Now","Next","Later","Someday"],
  "themes": ["T1 …"], "milestones": ["M0 …"],
  "open_gates": [], "wip_limits": {} }
```
The **first** lane is the todo lane; the **last** lane is the done lane —
the dependency and selection rules key off position, not name.

**Epic**:
```json
{ "id": "F1", "name": "…", "description": "…", "notes": "",
  "theme": "T1 Foundation & Contracts", "milestone": "M0 Reliable foundation",
  "priority": "Now", "status": "free-text maturity tag", "tags": ["extras"],
  "gate": "none", "deps": ["other-epic-ids"], "column": "Backlog",
  "claimed_by": null, "claimed_at": null, "updated_at": null }
```
`theme` and `milestone` must come from config vocab (empty string allowed).
`gate` other than `"none"` means the epic is closed until that gate appears
in config `open_gates` — a human records that; you never flip it. `status`
is informational maturity, independent of `column`.

**Story**:
```json
{ "id": "F1-1", "epic_id": "F1", "name": "…", "description": "…",
  "kind": "feature",
  "acceptance_criteria": ["testable statement", "…"],
  "context": "repos, paths, docs the builder should read",
  "ready": false, "column": "Backlog", "priority": "Now",
  "claimed_by": null, "claimed_at": null, "updated_at": null }
```
`kind` ∈ `feature | test | integration | chore | docs`. Story ids are
`<epic_id>-<n>`. **`ready` is the definition-of-ready flag: only the human
sets it to true.** A story you drafted while grooming always lands
`ready: false`.

**Idea**:
```json
{ "id": "idea-…", "title": "…", "description": "…", "notes": "",
  "theme": "", "milestone": "", "tags": [],
  "status": "idea", "priority": "Later", "rejected_reason": null,
  "created_at": "YYYY-MM-DD", "updated_at": null }
```
`status` ∈ `idea → considering → planned → building → done`, or `rejected`
at any point. Rejecting requires `rejected_reason`; never delete an idea
for merely not being chosen.

## 3. Edit rules

- Keep the schemas above exactly; set `updated_at` (ISO timestamp) on every
  record you change.
- Array order within a priority tier is queue order — reorder by moving
  entries, never by renaming ids. Ids are permanent.
- Dependency ordering: an epic may not enter the last lane until every epic
  in `deps` is there; nothing in the last lane may leave it while a
  dependent sits there. The UI enforces this; when editing files directly,
  you enforce it yourself.
- If the board UI might be open, warn the user that hand-edits and UI edits
  can clobber each other (the page holds whole-array state) — they should
  reload after your edits.
- Never fork or copy the app into a project. One codebase; per-project
  differences belong in that project's `config.json` and data.

## 4. Git conventions

Board data is versioned by the **project's own repo** (the
`*-system-design` repo), not this one.

- **Edit freely; commit only on an explicit "save" / "commit" /
  "ratify" from the user.** Uncommitted edits are the working state; the
  commit is the user's ratification of it.
- Commit board data with a clear message ("Board: groom epic O1 into 4
  stories", "Board: O1-2 done"). Code changes from building a story are
  committed in the code repo, separately, under that repo's own rules —
  never mix the two in one commit, and never commit code without being
  asked.

## 5. Grooming (brainstorm → epics/stories)

When the user wants to develop an idea into work items:

1. Brainstorm conversationally first; don't write files while the shape is
   still moving.
2. When they say to break it down: draft **one epic** (theme + milestone
   from config vocab — propose them, let the user correct) and its
   **stories**, each with concrete `acceptance_criteria` (testable
   statements, not vibes), `context` naming the repos/paths/docs a builder
   must read, and an honest `kind`. Integration-level testing that
   outgrows a feature story becomes its own story of kind `integration`.
3. Land everything `ready: false`, summarize what you wrote, and stop. The
   user reviews, edits, flips `ready`, and says when to commit.

## 6. Building (the "begin" workflow)

When the user says to build a story (e.g. "begin O1-2"):

1. Check `ready`. If false, ask — "there's enough context in that story"
   from the user in-conversation counts; set `ready: true` to record it.
2. Claim it: `claimed_by` (your session identity), `claimed_at`, move to
   the in-progress lane, save the file.
3. Read the story's `description`, `acceptance_criteria`, and `context` —
   plus the epic and the target project's own CLAUDE.md/AGENTS.md. The
   story tells you *what*; the code repo's conventions tell you *how*.
4. Implement in the target code repo. Write the tests the story's `kind`
   and acceptance criteria call for; run the project's checks.
5. Verify each acceptance criterion. Report which pass and how you know.
6. Move the card (done lane if everything passed; back to todo with a
   `notes` explanation and cleared claim if blocked), stamp `updated_at`.
7. Committing: code repo per its rules (ask), board repo on "save".

An epic is "begin"-able too: work its ready stories in dependency/priority
order, one at a time, reporting between stories.

## 7. Selection ("what's next")

Defined in [`PROTOCOL.md`](PROTOCOL.md) §3 — pickable = first-lane, deps
done, gate open, unclaimed, WIP under limit; rank by priority tier, then
unblock count, then file order. For stories, add: `ready: true` and its
epic not gated. An empty selection is an answer — report *why* nothing is
pickable, don't force a pick.
