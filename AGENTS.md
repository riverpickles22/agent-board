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
├── config.json      # vocabularies: lanes, priorities, themes, milestones, open_gates, wip_limits, view
├── ideas.json       # the inbox: not-yet-decided requests
├── epics.json       # decided work, by theme + milestone
├── stories.json     # buildable slices under epics
└── milestones.json  # what each milestone accomplishes; deliverables -> epics; context docs
```

**The context directory.** The git repo containing the data dir (the
project's `*-system-design` repo) is the project's *context directory*:
architecture, strategy, PRFAQ, design proposals. Every `context_docs`
path below is **relative to that repo's root**. Its git history is the
versioning of the system/business story — when a ratified change updates
a design doc, that commit *is* the record of how the plan evolved.

**The context stack**, top to bottom: system (context docs) → milestone
(what we seek to accomplish) → epic/story (the work) → idea (the inbox).
Cards link upward via `milestone` and `context_docs`; keep those links
real — they are what makes "read the context before building" possible.

## 2. Schemas

**Config** — all vocabularies are per-project; never hardcode them:
```json
{ "lanes": ["Backlog","In Progress","Done"],
  "priorities": ["Now","Next","Later","Someday"],
  "themes": ["T1 …"], "milestones": ["M0 …"],
  "open_gates": [], "wip_limits": {},
  "view": { "title": "Chaim Build Board", "default_page": "board",
            "default_milestone": "M0 Reliable foundation", "default_theme": "all",
            "default_board_mode": "epics" } }
```
The **first** lane is the todo lane; the **last** lane is the done lane —
the dependency and selection rules key off position, not name.

`view` is the project's saved view: `title` names the board in the UI
header and browser tab (when you report which board you're operating on,
use it); `default_page` (`board`|`ideas`), `default_milestone`, and
`default_theme` are applied when the board opens (`"all"` or a vocab
entry). `default_board_mode` (`epics`|`rows`, default `epics`) picks the
board rendering: epic cards in lanes, or story swimlanes grouped by epic. Rules: when wiring or renaming a project, set `view.title` so
boards are tellable apart. Update `view` when the user asks ("make M1 my
default view") — never as a side effect of other edits; the UI's
"★ set as default view" button writes the same fields.

**Epic**:
```json
{ "id": "F1", "name": "…", "description": "…", "notes": "",
  "theme": "T1 Foundation & Contracts", "milestone": "M0 Reliable foundation",
  "priority": "Now", "status": "free-text maturity tag", "tags": ["extras"],
  "systems": ["chaim-server", "chaim-ui"],
  "context_docs": [ {"label": "…", "path": "architecture/….md", "note": "§5"} ],
  "gate": "none", "deps": ["other-epic-ids"], "column": "Backlog",
  "claimed_by": null, "claimed_at": null, "updated_at": null }
```
`theme` and `milestone` must come from config vocab (empty string allowed).
`gate` other than `"none"` means the epic is closed until that gate appears
in config `open_gates` — a human records that; you never flip it. `status`
is informational maturity, independent of `column`. `systems` names the
repos/services the change touches (free strings, edited in the UI);
`context_docs` is edited via file/skill only — the modal deliberately
doesn't grow a widget for it.

**Workflow impact (a notes convention, not a field):** when a change
alters how a user or system flow works, write a paragraph starting
`Workflow impact:` into the epic's `notes` — what flow changes, before →
after. Grooming and curation add it; builders read it.

**Story**:
```json
{ "id": "F1-1", "epic_id": "F1", "name": "…", "description": "…",
  "kind": "feature",
  "acceptance_criteria": ["testable statement", "…"],
  "context": "repos, paths, docs the builder should read",
  "systems": ["chaim-server"],
  "ready": false, "column": "Backlog", "priority": "Now",
  "claimed_by": null, "claimed_at": null, "updated_at": null }
```
`kind` ∈ `feature | test | integration | chore | docs`. Story ids are
`<epic_id>-<n>`. **`ready` is the definition-of-ready flag: only the human
sets it to true.** A story you drafted while grooming always lands
`ready: false`.

**Milestones** (`milestones.json` — a single object, like config):
```json
{ "overview": {
    "summary": "one paragraph: the system we're building",
    "context_docs": [ {"label": "Architecture", "path": "architecture/….md", "note": "…"} ] },
  "milestones": [ {
    "id": "M1", "name": "…", "tagline": "…",
    "summary": "what we seek to accomplish",
    "user_outcome": "…", "gate": "exit criteria / evidence gate", "roi": "…",
    "deliverables": [ {"name": "…", "description": "…", "epics": ["D1","D2"]} ],
    "context_docs": [], 
    "architecture": { "summary": "…", "subsystems": [ {"name": "…", "state": "new|changed|existing", "note": "…"} ] }
  } ] }
```
`id` is the *short* form of a config milestone vocab entry (`M1`,
`Phase 2`). `user_outcome`, `roi`, and `architecture` are optional — the
Milestones page renders them only when present. Deliverable `epics` ids
must exist in `epics.json`; the page rolls up done-counts from them, so
keep the links current when scope changes.

**Idea**:
```json
{ "id": "idea-…", "title": "…", "description": "…", "notes": "",
  "category": "feature | technology | business | … (free text)",
  "theme": "", "milestone": "", "tags": [],
  "deps": ["idea or epic ids this needs first — optional, informational"],
  "status": "idea", "priority": "Later",
  "effort": "low|medium|high|",  "impact": "low|medium|high|",
  "context": "what this is really about — problem, for whom, why now",
  "compounding": "what doors building this opens; what gets cheaper later",
  "pros": ["…"], "cons": ["…"],
  "sections": [ {"title": "UI sketch | Market analysis | …", "body": "…"} ],
  "log": [ {"at": "YYYY-MM-DD", "note": "a dated brainstorm entry"} ],
  "rejected_reason": null,
  "created_at": "YYYY-MM-DD", "updated_at": null }
```
`status` ∈ `idea → ready for review → ready to implement → done`, or
`rejected` at any point. The Ideas page shows the first three as the
active pipeline; `done` and `rejected` live behind its archive toggle so
they never crowd the active view. **`ready for review` is the agent's
hand-off**: when developing an idea has filled the deep dive enough for
the human to decide (context, pros/cons, effort/impact, compounding —
honest, not padded), the agent moves it to `ready for review` itself and
records a dated `log` entry saying what made it decision-ready. It is
the one status transition an agent makes on its own initiative;
`ready to implement` (the human's thumbs-up) and `rejected` are the
human's call. From `ready to implement`: **decompose before you build**
— groom the idea into an epic + stories on the board backlog (§5) so
the work exists as cards the human can watch move; even a small ad hoc
request gets a lightweight epic with a single story rather than being
implemented straight off the idea card. A `milestone` link stays
optional; mark the idea `done` when the work ships. Legacy statuses
(`considering`, `planned`, `building`) render as their modern
equivalents in the UI but should be migrated whenever you touch the
record. Rejecting requires `rejected_reason`; never delete an idea for
merely not being chosen. An idea can be *anything worth considering* —
a feature, a technology to adopt, a business move, a process change.

The deep-dive fields exist to answer one question: **does this idea
deserve development?** The UI's idea page renders them; `log` is
append-only (never rewrite old entries — it's the record of how thinking
evolved).

Idea `deps` are **informational sequencing** — "this makes sense after
that" — shown on the card only when filled in; unlike epic `deps`, no
ordering rule is enforced on them.

Within the `idea` status, the Ideas page splits cards by `priority` into
**Front burner** (the top half of the config priority vocab — default
Now/Next: spend attention here) and **Back burner** (the rest —
placeholders worth keeping, not worth time yet). Triaging an idea's
urgency means setting its `priority`; there is no separate field.

**The decision lens (how ideas are judged here):** the user's stated
philosophy — *the least work for the greatest impact wins; infrastructure
that compounds (opens several doors, makes later things cheaper) counts
double; simplicity is a powerful tool.* Concretely: fill `effort` and
`impact` honestly (low effort + high impact = a **quick win**, flagged in
the UI); always ask the `compounding` question — a medium-effort idea that
makes three later ideas cheap may beat a low-effort one-off; and when two
designs deliver the same value, the simpler one is the better idea. Apply
this lens when brainstorming, comparing, or recommending ideas — and say
which part of the lens drives your recommendation.

## 3. Edit rules

- Keep the schemas above exactly; set `updated_at` (ISO timestamp) on every
  record you change.
- Array order within a priority tier is queue order — reorder by moving
  entries, never by renaming ids. Ids are permanent.
- Dependency ordering: an epic may not enter the last lane until every epic
  in `deps` is there; nothing in the last lane may leave it while a
  dependent sits there. The UI enforces this; when editing files directly,
  you enforce it yourself.
- A board served by a current `server.js` live-reloads: it watches the
  data dir and pushes changes to open pages, so your file edits appear
  in the browser without a manual reload. Only when the user is running
  an older server (no `/api/events`) does the old warning apply: tell
  them to reload after your edits, or the page's stale state clobbers
  them.
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
- **UI changes version in this repo** under `Design: …` messages: the
  screen's spec in [`design/`](design/DESIGN.md) and `index.html` change
  **together in one commit**, never one without the other, and never
  mixed with `Board:` data commits.

## 5. Grooming (brainstorm → epics/stories)

**Developing an idea (before it's work):** when brainstorming an idea with
the user, capture the output *into the idea's own fields* as the
conversation lands things — `context`, `pros`/`cons`, `effort`/`impact`,
`compounding`, extra `sections` (UI sketches, market analysis, spikes),
and a dated `log` entry summarizing what moved. Apply the decision lens
(§2). The goal of this stage is a decision — develop further, park, or
reject with a reason — not implementation.

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

**The board moves while you work, not after.** Lane position is live
status — the page live-reloads, so the human watches progress through
the board. Claim and move the card to the in-progress lane *before*
writing code (step 2), and move each finished card the moment its
criteria verify (step 6) — never batch the moves at the end of a
session. When the work comes from a `ready to implement` idea,
decompose it first (§2 → §5): create the epic + stories on the board,
then work them card by card — don't implement straight from the idea.

**Capture new value drivers.** If building something created a new
capability, workflow, or convention that future work should use — a new
UI surface, a new status semantic, a new endpoint, a new rule — fold it
into the docs that carry it (this file, the skill, `PROTOCOL.md`, the
`design/` specs) **in the same change**, so the next agent inherits it
instead of rediscovering it. A value driver that lives only in the code
or in one conversation is lost.

Any **medium-or-larger** capability change also updates
[`CAPABILITIES.md`](CAPABILITIES.md) — the medium-altitude inventory the
running board serves at `/docs` and `/llms.txt` — in the same change.
Keep it at that altitude: *what it does, not how*; bump its "as of"
date. Small tweaks (styling, copy, refactors) don't touch it.

## 7. Curating the backlog

When the user asks to "clean up the backlog" / "curate" / "tidy the
board", run these passes over the whole data dir plus the context
directory. Everything is **propose → user approves → apply**; merges and
re-parenting are destructive, so never apply them without an explicit
yes.

1. **Group.** Find stories attached to the wrong epic, epics that are
   really stories of another epic, and duplicate or overlapping
   ideas/epics. Present a table: what, where it is, where it should go,
   why. Apply approved moves (story `epic_id` changes keep the old id
   unless it collides; merged epics fold `deps`/stories into the
   survivor and the loser is deleted with its content preserved in the
   survivor's notes).
2. **Enrich.** For each epic/story whose description or context is too
   thin to build from, draft: *what is the change* (description), *systems
   involved* (`systems`), *what to read first* (`context_docs` for epics,
   `context` for stories) — sourced from the context directory and the
   code repos, not invented. Show per-card before/after; apply approved.
3. **Workflow impact.** For changes that alter a user or system flow, add
   the `Workflow impact:` note (§2). Flag flows the backlog changes that
   no story covers.
4. **Milestone alignment.** Epics with no `milestone` → propose one.
   Deliverables whose `epics` lists have drifted from reality → flag.
   Milestone summaries that no longer describe their epics → propose
   rewording (milestone text is the human's narrative; propose, don't
   rewrite silently).
5. **Context drift.** Compare recently-Done work against the linked
   context docs: does the architecture doc still describe the system as
   built? Do strategy/business claims still hold (chaim:
   `strategy/strategy.md`, the PRFAQ; arc: `prfaq.md`, `roadmap.md`)?
   Report findings; draft proposed doc edits **as proposals only — never
   silently edit strategy or architecture docs.** Each ratified doc
   update is its own commit in the context directory, so `git log` on
   those files is the record of how the plan evolved during development.
6. **Design drift.** Check the UX specs ([`design/DESIGN.md`](design/DESIGN.md)
   §3) against `index.html`: (a) grep every backticked anchor in the
   specs' Components tables — an anchor that doesn't resolve in
   `index.html` is drift; (b) skim each screen's render function against
   its wireframe and interactions; (c) flag any spec still
   `spec_state: ahead-of-ui`. Report a table of drift with proposed
   fixes — spec-to-match-code or code-to-match-spec, the user picks the
   direction. Propose only; never silently rewrite either side.

End every curation with a summary of what changed, what was proposed and
declined, and what needs the user's decision.

## 8. Selection ("what's next")

Defined in [`PROTOCOL.md`](PROTOCOL.md) §3 — pickable = first-lane, deps
done, gate open, unclaimed, WIP under limit; rank by priority tier, then
unblock count, then file order. For stories, add: `ready: true` and its
epic not gated. An empty selection is an answer — report *why* nothing is
pickable, don't force a pick. When you report a pick, name the milestone
it serves (via its epic's `milestone`), so the user hears *what the work
is for*, not just its id.
