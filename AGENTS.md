# AGENTS.md — agent-board

**You are an AI agent working with an agent-board backlog.** This file is
the contract: schemas, edit rules, and conventions. The human-facing tour
is [`README.md`](README.md); the work-selection rule and claim loop are in
[`PROTOCOL.md`](PROTOCOL.md) — read that before picking up work.

## 0. Orientation — read this first

The whole tool in one page. Everything below is depth you fetch on demand.

**What this is.** A local kanban system over plain JSON. One codebase,
many projects. **The JSON files _are_ the backlog** — the web UI is a
human lens, never a dependency. You operate on the files directly, and
git is the only persistence: **a commit is the human ratifying your
work**, so you edit freely and never commit unasked.

**The six files** (in a project's data dir — find it via
`BOARD_DATA_DIR` → [`projects.json`](projects.json) → §1):

| File | Holds | Grain |
|---|---|---|
| `epics.json` | the work | cards in lanes — the unit of "what's next" |
| `stories.json` | buildable slices, keyed by `epic_id` | what you actually build, one at a time |
| `ideas.json` | the inbox — anything worth considering | pre-work; graduates into epics |
| `milestones.json` | the narrative + deliverables | why the work matters |
| `config.json` | **all vocabulary** — lanes, priorities, themes, milestones, gates, WIP limits, saved view | nothing is hardcoded; read it before writing anything |
| `capabilities.json` | the registry of reusable capabilities and where each is adopted — optional; the shared one is on agent-board's own board | standing records that outlive the cards that build them |

**Where to capture reusable development ideas.** When an idea from any project could improve how applications are developed across projects, look for an existing idea on agent-board's own board (project `board`). Capture or extend the shared proposal there. Name the originating project, a concrete use case, and any likely adopters. Track approved shared work there through epic and stories. Product-specific integration work belongs on the consuming board, linked by project name and card ID. See [the roadmap](strategy/roadmap.md).

**The lifecycle**, end to end — the spine of everything you do:

```
idea → ready for review → ready to implement → epic + stories → lanes → done → archived
       ↑ you set this      ↑ human only         ↑ always decompose  ↑ move in real time
```

**The five inviolable rules.** Break these and you break the human's
trust in the board:

1. **Vocabulary comes from `config.json`** — themes, milestones,
   priorities, lanes. Never invent one (§2).
2. **`ready: true`, gates, and `ready to implement` are the human's** —
   never yours. `ready for review` is the one status you set unprompted
   (§2).
3. **Decompose before you build** — a thumbs-upped idea becomes an epic
   + stories on the board first, even for small requests (§6).
4. **Move cards as you work, not after** — claim before you start, move
   the moment criteria pass; the human is watching a live-reloading
   board (§6).
5. **Commit only on an explicit "save"/"ratify"**, and never mix board
   data commits with code or UI commits (§4).

**What you can do** (the workflows, all in the skill —
`.claude/skills/agent-board/SKILL.md`, the one copy; Codex reads it
through the tracked link `.agents/skills/agent-board/SKILL.md` — depth in the
sections here): **Operate** — what's next, move/claim (PROTOCOL §3) ·
**Groom** — brainstorm into epic + stories (§5) · **Develop an idea** —
fill the deep dive, hand off at `ready for review` (§2, §5) · **Build** —
the claim→implement→verify→move loop (§6) · **Curate** — the five
propose-then-approve passes (§7) · **Design** — change the UI itself,
spec-first ([`design/DESIGN.md`](design/DESIGN.md)) · **Save** — commit
on request (§4).

**The surfaces** a human sees (you never need them, but they explain
what your edits look like): **Ideas** (inbox + deep dives) ·
**Board** (lanes, the work queue, Shipped archive, and
a milestone's outcome and deliverable roll-up when one is selected) · **History** (git log as a
timeline) · **Docs** (renders `CAPABILITIES.md`). Full inventory:
[`CAPABILITIES.md`](CAPABILITIES.md).

**Running it.** `./board <name>` serves on :4300 (`PORT=4301` for a
second board); `./board stop [port]` stops one; `./board` lists
projects. A running board live-reloads your file edits into any open
page — no reload warnings needed. Over HTTP it self-describes at
`/llms.txt` (capabilities), `/AGENTS.md` and `/PROTOCOL.md` (this
contract), and serves data at `/api/board`; full route list in
[`CAPABILITIES.md`](CAPABILITIES.md).

**Where depth lives.** Schemas §2 · edit rules §3 · git §4 · grooming §5
· building §6 · curation §7 · selection §8 and
[`PROTOCOL.md`](PROTOCOL.md) · UI specs [`design/`](design/DESIGN.md).

## 1. Where data lives

**Shared structure is required.** Every registered project follows
[`PROJECT-STRUCTURE.md`](PROJECT-STRUCTURE.md): a canonical
`<project>-context` repo with `design/`, `strategy/`, and `roadmap/`, one live JSON backlog,
and agent entry points that link to the project briefing. Apply it when
creating projects, changing their layout, or maintaining their instructions.
Project vocabulary stays in config; do not create a parallel CSV backlog
or copy these shared rules into each code repo. Agent-board's own layout
is the documented tooling exception.

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
├── milestones.json  # what each milestone accomplishes; deliverables -> epics; context docs
└── capabilities.json # optional: reusable capabilities and their adoption per project
```

**The context directory.** The git repo containing the data dir (the
project's `*-context` repo) is the project's *context directory*:
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
{ "lanes": ["Ready","In Progress","Review","Done"],
  "priorities": ["Now","Next","Later","Someday"],
  "themes": ["T1 …"], "milestones": ["M0 …"],
  "open_gates": [], "wip_limits": {},
  "view": { "title": "Example Build Board", "default_page": "execution",
            "default_milestone": "M0 Reliable foundation", "default_theme": "all",
            "default_board_mode": "epics" } }
```
An optional `capability_areas` list (`["Context","Contract","Line","Loop"]`)
names the groups a capability registry files its records under (below).
The **first** lane is the todo lane; the **last** lane is the done lane —
the dependency and selection rules key off position, not name.
`default_page` names a tab (`ideas` / `board` / `history` / `docs`);
`execution` and `milestones` also resolve to `board`, so configs written
when those were page names keep working.

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
  "systems": ["api-server", "web-ui"],
  "context_docs": [ {"label": "…", "path": "architecture/….md", "note": "§5"} ],
  "test_plan": "how this change gets validated — what to run, what to look at",
  "gate": "none", "deps": ["other-epic-ids"], "column": "Ready",
  "claimed_by": null, "claimed_at": null,
  "needs": null,
  "archived_at": null, "updated_at": null }
```

**`needs` — "I cannot continue without you."** Set it on an epic *or a
story* (same shape) the moment you hit a question only a human can
answer, instead of stalling silently or guessing:
```json
"needs": { "kind": "decision", "reason": "Generated style rule conflicts with the book-level rule — which wins?" }
```
`kind` is free text (`decision`, `author`, `input`); `reason` must be a
specific question, not "blocked". It renders amber at the top of every
state display and counts in the epic's roll-up, so it is the loudest
thing on the board — use it honestly and **clear it the moment the
answer arrives**. It is deliberately different from a dependency: a
dependency resolves when other work lands; `needs` only resolves when a
person answers.
`theme` and `milestone` must come from config vocab (empty string allowed).
`archived_at` (ISO date, absent/null = active) is the **ship-and-close**
stamp: an agent may set it only when the epic *and every one of its
stories* sit in the done lane, and its `notes` carry an `Architecture:`
line and a `Code health:` line (below) — done cards stay on the board
until the whole epic closes. Archived epics leave the active board for its
Shipped view but still count for milestone roll-ups and dependency
checks; clearing `archived_at` (unarchive) is the human's call.
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

**Architecture (a notes convention, not a field):** when an epic's work
is built, the builder checks the project's architecture map — the
context repo's `design/hld.md` — and any diagram the epic's
`context_docs` link against what the epic changed (§6 step 8), then
records the outcome as one line starting `Architecture:` in the epic's
`notes`. Either what was updated, or `no change` and why:
`Architecture: hld.md — diagram gains the If-Match check between page
and server; parts table updated for read-data.js and write-data.js;
status line 2026-11-14.` ·
`Architecture: no change — UI copy only; no part, path or flow moved.`
A human closing the epic from the page leaves `Architecture: review
queued as <story id> on <date>` until an agent builds that review.
`doctor` warns on an epic ready to close out (every story in review or
done) or archived after 2026-11-14 without the line.

**Code health (a notes convention, not a field):** when an epic is
closed, its code is reviewed for debt (§6 step 9) and the outcome is
one line starting `Code health:` in the epic's `notes` — what was
found and which cards now carry it, or `clean` and why:
`Code health: the stale-claim rule was defined in three files —
drafted B42-1 to give it one home; index.html's work-queue styles
carry dead selectors — drafted B42-3.` ·
`Code health: clean — one new function beside its siblings, covered by
the doctor's tests; nothing duplicated.` A human closing the epic from
the page leaves `Code health: review queued as <story id> on <date>`
until an agent builds that review. The queued story lives under the
board's **standing "Closing reviews" epic** — the page creates it
on first need, it stays in the first lane, and it is never archived;
it is the one epic that holds a queue rather than shipped work.
`doctor` warns on an epic archived after 2026-11-14 without the line,
and on a queued line naming a story that does not exist.

**Story**:
```json
{ "id": "F1-1", "epic_id": "F1", "name": "…", "description": "…",
  "kind": "feature",
  "acceptance_criteria": ["testable statement", "…"],
  "how_to_test": ["Open …", "Do …", "You should see …"],
  "context": "repos, paths, docs the builder should read",
  "notes": "markdown: the review note — what changed, what verified, what waits on you",
  "systems": ["api-server"],
  "ready": false, "column": "Ready", "priority": "Now",
  "claimed_by": null, "claimed_at": null, "needs": null, "updated_at": null }
```
`needs` works exactly as on epics (above) — the honest way to stop.
`notes` is free markdown, optional; it is where a builder leaves the
**review note** when moving a story to the review or done lane (§6,
PROTOCOL.md). The story modal renders it as markdown and, in those
lanes, leads with it — so write it for the human reading it there, and
append rather than replace what earlier sessions wrote.
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
`Phase 2`) — equal to it, or its leading words. `user_outcome`, `roi`,
and `architecture` are optional. The Board shows a milestone's
`user_outcome`, `gate`, context docs and deliverables in a panel when
that milestone is selected in the filter; `overview`, `roi` and
`architecture` are for agents and are not rendered. Deliverable `epics`
ids must exist in `epics.json`; the panel rolls up done-counts from
them, and an epic that carries the milestone but sits under no
deliverable is not counted — keep the links current when scope changes.

**Capability** (`capabilities.json` — an array, optional; the registry
of reusable work):
```json
{ "id": "cap-commit-gate", "name": "Commit gate",
  "summary": "what it does, in a sentence or two",
  "kind": "code", "area": "Line", "impact": "high",
  "deps": ["cap-fresh-reader-reviewer"],
  "origin": "arc", "home": "arc/arc-cli/dev.sh",
  "adoption": [ {"project": "arc", "state": "in use", "since": "2026-09-13", "evidence": "arc:A68"},
                {"project": "chaim", "state": "wanted"} ],
  "links": ["idea-workbench-kit", "arc:A68"],
  "status": null, "reason": "", "notes": "", "updated_at": null }
```
A capability is anything one project built or needs that another could
use: shared code, a skill, a subagent, a rule, a working practice. It is
a **standing record** — it outlives the ideas and epics that build it,
which is why it is not a card. **The shared registry lives on
agent-board's own board** (project `board`); another board may keep one
for capabilities that are only its own. Not to be confused with
[`CAPABILITIES.md`](CAPABILITIES.md), which lists what this tool itself
does.

`kind` ∈ `code | skill | agent | rule | practice`. `impact` ∈ `high |
medium | low`. `area` comes from config `capability_areas` when that
list exists. `origin` is the project that needed it first; `home` is
where it lives (a repo path, or empty until built). `deps` name other
capabilities that must exist first. Ids are `cap-<slug>`, permanent.

`adoption` holds one entry per project that has a stake:
`state` ∈ `wanted | building | in use | not needed`, with `since` (a
date) and `evidence` (a path or a card) once it is `in use`. **You
record adoption, with evidence** — it is a fact about the code, like a
lane. A project with no entry has not been considered.

**Overall state is derived, never stored**: `in use` if any project uses
it, else `building` if any is building it, else `proposed`. `status` is
stored only for the two the human sets — `skipped` (decided against,
for now or for good) and `retired` — each with a `reason`. Never write
`skipped` or `retired` yourself; propose it.

`links` name the cards that shape or build it: a bare id is a card on
this board, `<project>:<id>` a card on another registered board
(`arc:A68`). This is the one place a record points across boards. The
link runs one way; ideas and epics carry no capability field, and "which
capability does this card serve" is read from the registry.

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
  "why_now": "one line: what makes this timely, not merely good",
  "decision": "the specific question a reviewer must answer",
  "conviction": "speculative | promising | clear to pursue | (empty)",
  "constraints": "what the build must stay within (shown from `ready to implement`)",
  "acceptance": "the boundary that would make it done enough",
  "validation": "how we would know it works — required before promotion",
  "promoted_to": "epic id once promoted to the board, else null",
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
human's call — in the UI, the decision bar on a review idea's deep dive
(Pursue / Keep shaping / Reject, each logged) is where the human makes it.

**Ideas are a funnel, not a second board.** *Ideas* answers "what might
this become"; the *Board* answers "what are we building". The stages
mean: **back burner** — preserved, not worth design time now; **front
burner** — worth actively shaping, questions still open; **ready for
review** — shaped enough that only a deliberate decision remains
(pursue / revise / defer / reject); **ready to implement** — intent
settled enough to become executable work. The card surfaces more of
itself at each stage, so fill fields when the stage earns them rather
than all at once.

**Promotion is the boundary.** `Promote to Board` turns a
`ready to implement` idea into an epic, sets `promoted_to`, and closes
the idea as `done` with a dated log entry. Promotion creates the
**epic** only — grooming it into stories is still §5 work, because
acceptance criteria are a thinking job, not a copy. Never promote an
idea the human hasn't moved to `ready to implement`.

**A promotion needs a validation plan.** An idea cannot cross into
execution until its `validation` says how the change would be checked —
what you would run, what you would look at, what evidence counts. It
carries into the epic's `test_plan` and stays editable there. The UI
refuses the promotion outright and puts you in the field; **you must
refuse the same way when promoting by editing JSON** — write the plan
with the human first, then promote. Committing work without saying how
it gets checked is how a board fills with things nobody can call done,
and the plan is cheap while intent is still being shaped and expensive
to reconstruct afterwards.

The four are different questions, and none replaces another:
`acceptance` (idea) is *what "done enough" means*, `test_plan` (epic) is
*how we prove it*, `acceptance_criteria` (story) is *what must be true
for this slice*, and `how_to_test` (story) is *what the human does to
see it working*. A test plan is not a list of criteria restated — it
names the checks: commands, fixtures, the surface to open, the thing to
observe.

**`how_to_test` is written for the person, not the agent.** Numbered
steps in plain words — where to go, what to do, what they should see —
that someone who did not build it can follow in a minute. No commands
unless the person would really type one; no "verify the handler fires".
Three shapes cover almost everything:

- *UI change*: `Open the board at /board/#/board` · `Hover any card for a
  second — a popover appears` · `Scroll inside the popover — it stays
  open; scroll the page — it closes`.
- *CLI or API change*: `Run ./board next board` · `The list is ranked;
  the first line names the milestone it serves` · `Run it with --json —
  same picks, as an array`.
- *Data or rule change*: `Move a story into Review with no
  how_to_test` · `Run ./board doctor board` · `A warning names that
  story: "no how_to_test steps"`.

Write it when you move the card to a review or done lane (§6) — the
lane's question is "how do I check this?", and the steps are the answer.
The UI shows them as a numbered list on the story card, in the hover
peek, and in the epic's markdown copy; `doctor` warns when a story sits
in review without them.

From `ready to implement`: **decompose before you build**
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

**Reasoning fields (`why_now`, `decision`, `conviction`).** The board is
a product-reasoning surface, not just a task list, so three fields carry
the reasoning that otherwise hides inside prose:

- **`why_now`** — one line on what makes this timely rather than merely
  good ("required before story simulation can reason about motivation").
  Expected on front-burner and review-ready ideas; it's the guard
  against prioritising whichever card sounds most exciting.
- **`decision`** — the specific question a human must answer, written as
  a question. An idea you move to `ready for review` **should** carry
  one: the reviewer is there to resolve something, not to admire an
  essay. Prefer "Should obligations be first-class records or stay
  derived?" over "needs review".
- **`conviction`** — `speculative` → `promising` → `clear to pursue`.
  **Orthogonal to `status`**: workflow maturity and how sure we are are
  different axes, and a `ready for review` idea can honestly be merely
  `promising`. Never infer one from the other. You may propose a
  conviction and say why; raising it to `clear to pursue` is the
  human's call, like `ready to implement`.

Leverage is **derived, never stored**: an idea's "unlocks" count is the
inverse of other ideas' `deps`, computed at render time. Don't add a
field for it, and don't hand-maintain reverse links.

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
- **The change journal.** A running server appends every change it sees
  to `journal.jsonl` in the data dir — one JSON line per card-level
  statement (the text the pending panel shows), its `source`, its time
  (`at`), and the field values before and after, so one change can be
  undone. `source` is `page` (a write from a board page) or `disk` (an
  edit to a data file the server did not make — you, another agent, an
  editor). **That is all it can tell: it never knows which agent made a
  disk edit**, and a change made while no server was running has no
  entry at all. The pending panel reads it to say who and when beside
  each statement and to offer **↩ revert** on one change, through the
  page's normal conditional save. It is working state, not history:
  never edit it, never read it as a record of who did what, and never
  commit it — it is not a data file (not in `FILES`, not served by
  `/api/board`, ignored by the doctor), each data dir's `.gitignore`
  lists it, and the server drops entries older than the last commit
  touching the data files (§4) and caps it at 300 entries for a board
  git does not hold.
- Never fork or copy the app into a project. One codebase; per-project
  differences belong in that project's `config.json` and data.

## 3.4 Many boards, one server

`./board <name>` (and bare `node server.js`) with a populated
`projects.json` serves every registered board from one port, scoped by a
path prefix: `/<name>/#/board`, `/<other-name>/#/ideas`. `GET /api/projects`
lists them. Data routes take the same prefix (`/<name>/api/board`), each
project's directory is watched separately,
and a write reaches only the named project.

**`BOARD_DATA_DIR` is unchanged and still the contract you use**: it pins
the server to one directory, removes the prefix, and leaves every route
exactly as it was. Nothing about how you find a project's data dir changes.

## 3.5 The read-side CLI

The board's answers are askable without a browser, from the agent-board
checkout — and they run the **same shared modules the UI renders**
(`queue.js`, `doctor.js`), so the two can never disagree:

- `./board status <project>` — orientation: `needs` items first (they
  outrank everything), in-flight claims with age and staleness, a
  **Waiting on you** line (open `needs`, review-lane cards, ideas ready
  for review, ready-to-implement ideas never promoted, first-lane stories
  awaiting `ready` — derived by `BoardQueue.waitingOnYou()`, never
  stored), **Closing reviews owed** (finished epics with no
  `Architecture:` or `Code health:` line — agent work to do now, §6
  steps 8–9), the pickable count and why it is zero, lane counts, doctor
  health.
- `./board next <project>` — the pickable queue, ranked exactly as §3 of
  PROTOCOL.md and the UI's Ready strip rank it, with exclusion reasons
  counted (not ready, claimed, gated, waiting on deps, epic not groomed).
  An unknown or missing priority ranks after every known one.
- `./board show <id> <project>` — one card instead of a whole file: a
  story with its epic's name, test_plan, context_docs, gate and deps
  state and its siblings' lanes; an epic with its stories; an idea; or a
  capability with its adoption and its linked cards' lanes, on this board
  and others. An unknown id exits 1 and names the id and project.
- `./board capabilities <project>` — the registry (§2): every capability
  by derived state, in order of impact then dependencies, with its
  adoption in each project. `status` carries a one-line count.
- `./board new <name> <dir>` — scaffold a fresh project (the six files,
  from the same defaults the server uses) and register it in
  projects.json; adopts an existing data dir without overwriting.
- `./board help` — every command, plus the agent orientation block.
- `next`/`status`/`show`/`capabilities` take `--json`.

The CLI reads; **writes stay direct JSON edits under this contract**.
Nothing here claims, moves, or saves for you.

## 3.6 Checking the board (`./board doctor`)

`./board doctor <project>` checks the data against the invariants this
document states — ids unique and resolving, vocabulary from config, lanes
that exist, `archived_at` only once every story is done, the dependency
guard, cycles, orphaned stories, dangling deliverable links, promoted
ideas that never closed, ready stories with no criteria, stale claims.
It also warns on `needs` left on a done or archived card or not shaped
`{kind, reason}`, a done story with `ready: false`, an in-progress card
with no claim, a claimed card still in the first lane, a lane over its
`wip_limits` (or a limit naming no lane), a `ready for review` idea with
no `decision`, `conviction`/`effort`/`impact` outside their values, an
epic ready to close out (every story in review or done) or archived
after 2026-11-14 with no `Architecture:` line in its notes, an
epic archived after 2026-11-14 with no `Code health:` line (or a queued
line naming a missing story), a
`view` default naming no vocab entry, an unknown priority, and (CLI only,
it needs the filesystem) a live epic's or milestone's `context_docs` path
that does not exist under the context repo root. On a board with a
capability registry it errors on a duplicate capability id, a `deps`
entry naming no capability and a dependency cycle, and warns on a
`kind`, `impact`, `status` or adoption state outside its values, an
`area` outside `capability_areas`, `skipped`/`retired` with no reason,
and a link that resolves to no card (links and adoption projects on
other boards are checked from the CLI). It warns, once per
milestone, when live epics carry a milestone that has deliverables but
no deliverable links them.

**Errors** are contract violations that break something real, and the
command exits 1 so CI can gate on them. **Warnings** are advisory and
always exit 0 — a check that fails a build over a stale claim gets
switched off, and then nothing is checked at all.

It never repairs: it reports, and you or the human decide. Run it after a
grooming or curation pass, and before saying a board is clean. The UI runs
the same function (`doctor.js`, shared with no duplication) behind the
`⚕` chip in the header.

## 4. Git conventions

Board data is versioned by the **project's own repo** (the
`*-context` repo), not this one.

- **Edit freely; commit only on an explicit "save" / "commit" /
  "ratify" from the user.** Uncommitted edits are the working state; the
  commit is the user's ratification of it.
- A save also closes the change journal's window (§3): the server drops
  every entry older than the commit the next time it reads the journal.
  Never `git add` the journal — commit the data files by name, or rely
  on the data dir's `.gitignore` listing `journal.jsonl`.
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
3. Check the epic's `test_plan`. A promoted epic arrives with one; an
   epic you drafted from a conversation may not. If it is empty, ask what
   would prove the change works and write it — the stories' criteria say
   what must be true, the plan says how anyone checks.
4. Land everything `ready: false`, summarize what you wrote, and stop. The
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
5. Verify each acceptance criterion, and run the epic's `test_plan`.
   Report which pass and how you know — the plan is the shared answer to
   "how do you know", so a claim it doesn't cover needs its own evidence.
6. Write the story's `how_to_test`: numbered steps the human follows to
   see it working themselves (§2 has the three shapes). Then move the
   card (done lane if everything passed — or the review lane on a
   four-lane board; back to todo with a `notes` explanation and cleared
   claim if blocked), stamp `updated_at`. A card in review without test
   steps is a card the human cannot check.
7. Committing: code repo per its rules (ask), board repo on "save".
8. **Closing an epic: check the architecture map.** When you move the
   epic's last story to the review or done lane — and in any case
   before anyone sets `archived_at` — compare the context repo's
   architecture map (`design/hld.md`, every project has one) and any
   diagram the epic's `context_docs` link with what the epic built.
   Where they no longer match, update the diagram, the parts table and
   the status line's checked date, and mark anything described but not
   yet built as proposed (PROJECT-STRUCTURE.md). Design docs the
   epic's commits added or changed under `design/` are part of the
   check whether or not `context_docs` links them: read them, bring the
   map in line, and link a new one from `hld.md` (proposed where it
   is not built) — but never edit the design doc itself. Then write the
   epic's `Architecture:` line (§2) — what changed, or `no change` and
   why — and name the doc edit in your report. **Where your harness runs
   subagents, hand this step to the architecture reviewer**
   (`.claude/agents/architecture-reviewer.md`, pinned to a Fable model,
   linked user-level by `./board`): dispatch it with only the epic id
   and the board, write the `Architecture:` line it returns onto the
   epic, and pass on what it edited and noticed in your report. It
   never writes board JSON. A harness without subagents does the step
   itself, as above.
   **A finished epic with no review is owed one now.** Whenever you meet
   an epic ready to close out — every story in the review or done lane
   (a story-less epic: its card in the done lane) — or one archived
   after 2026-11-14, and its notes carry no `Architecture:` line, run
   this step then, against the epic's latest commits and working tree,
   before other work on that epic: `./board status` lists it under
   "Closing reviews owed" and the doctor warns `no-architecture-line`.
   That warning is a to-do for you, not a report for the human. When a
   human closes such an epic with Remove from board, the page queues
   the check in the same closing-review story as step 9's code-health
   review and writes `Architecture: review queued as <story id>`;
   building that story means dispatching the reviewer and replacing
   the queued line with the one it returns. The edit is uncommitted
   working state like everything else: it is committed on "save", on
   its own, in the context repo.
9. **Closing an epic: review the code it left behind.** At the same
   moment as step 8, review the structure of the code the epic changed
   — the files its stories touched and what they call, in whichever
   code repo they live — for debt: duplicated logic, a rule defined in
   two places, functions or files that grew too large, dead code, names
   that no longer say what they do, new code with no tests around it.
   Write the epic's `Code health:` line (§2): what you found, or `clean`
   and why. Anything worth fixing becomes a `ready: false` story on the
   board (under an existing epic it belongs to, or a new cleanup epic),
   named in the line — **the closing epic does not refactor**; a
   refactor is new work the human ranks. When a human closes an epic
   with **Remove from board**, the page cannot review code, so it
   queues the review instead: a ready chore story, "Code-health review
   of <id>", under the board's standing "Closing reviews" epic, and
   a `Code health: review queued as <story id>` line on the epic.
   Building that story is this step: replace the queued line with the
   real `Code health:` line on the archived epic, draft any debt as
   cards, and move the review story to the done lane.

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

**Reusable work goes in the capability registry.** Whichever project
you are working in: when an idea describes something another project
could use, or an epic you are closing built it, propose or update the
capability on **agent-board's own board** (`capabilities.json` under
project `board`, §2) in the same session. A new one lands with
`origin` set to the project that needed it, that project's adoption
entry, a `wanted` entry for each project you can name a reason for,
and a link to the card (`<project>:<id>`). When a project starts or
finishes adopting one, update its adoption entry with the evidence.
The idea for building it as shared work is captured on agent-board's
Ideas page; a project's own integration stays a card on its own board,
linked from the capability. Report the registry edit like any other —
it is uncommitted working state until "save".

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
   built? Do strategy/business claims still hold (whatever the project's
   context directory keeps — `strategy/`, the PRFAQ, `roadmap.md`)?
   Report findings; draft proposed doc edits **as proposals only — never
   silently edit strategy or architecture docs.** The one standing
   exception is §6 step 8: the builder closing an epic updates the
   architecture map for what that epic built, and reports it in the
   epic's `Architecture:` line and the session report — never silently.
   This pass is the backstop for drift no epic caught. Each ratified doc
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
