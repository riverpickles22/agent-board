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

**The five files** (in a project's data dir — find it via
`BOARD_DATA_DIR` → [`projects.json`](projects.json) → §1):

| File | Holds | Grain |
|---|---|---|
| `epics.json` | the work | cards in lanes — the unit of "what's next" |
| `stories.json` | buildable slices, keyed by `epic_id` | what you actually build, one at a time |
| `ideas.json` | the inbox — anything worth considering | pre-work; graduates into epics |
| `milestones.json` | the narrative + deliverables | why the work matters |
| `config.json` | **all vocabulary** — lanes, priorities, themes, milestones, gates, WIP limits, saved view | nothing is hardcoded; read it before writing anything |

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

**What you can do** (the workflows, all in the skill; depth in the
sections here): **Operate** — what's next, move/claim (PROTOCOL §3) ·
**Groom** — brainstorm into epic + stories (§5) · **Develop an idea** —
fill the deep dive, hand off at `ready for review` (§2, §5) · **Build** —
the claim→implement→verify→move loop (§6) · **Curate** — the five
propose-then-approve passes (§7) · **Design** — change the UI itself,
spec-first ([`design/DESIGN.md`](design/DESIGN.md)) · **Save** — commit
on request (§4).

**The surfaces** a human sees (you never need them, but they explain
what your edits look like): **Ideas** (inbox + deep dives) ·
**Milestones** (narrative + roll-ups) · **Board** (lanes, Next-up and
Ready-queue strips, Shipped archive) · **History** (git log as a
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
  "view": { "title": "Chaim Build Board", "default_page": "execution",
            "default_milestone": "M0 Reliable foundation", "default_theme": "all",
            "default_board_mode": "epics" } }
```
The **first** lane is the todo lane; the **last** lane is the done lane —
the dependency and selection rules key off position, not name.
`default_page` names a tab (`ideas` / `milestones` / `board` /
`history` / `docs`); `execution` also resolves to `board`, so configs
written during that rename keep working.

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
  "test_plan": "how this change gets validated — what to run, what to look at",
  "gate": "none", "deps": ["other-epic-ids"], "column": "Backlog",
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
stories* sit in the done lane — done cards stay on the board until the
whole epic closes. Archived epics leave the active board for its
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

**Story**:
```json
{ "id": "F1-1", "epic_id": "F1", "name": "…", "description": "…",
  "kind": "feature",
  "acceptance_criteria": ["testable statement", "…"],
  "context": "repos, paths, docs the builder should read",
  "systems": ["chaim-server"],
  "ready": false, "column": "Backlog", "priority": "Now",
  "claimed_by": null, "claimed_at": null, "needs": null, "updated_at": null }
```
`needs` works exactly as on epics (above) — the honest way to stop.
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
human's call.

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

The three are different questions, and none replaces another:
`acceptance` (idea) is *what "done enough" means*, `test_plan` (epic) is
*how we prove it*, `acceptance_criteria` (story) is *what must be true
for this slice*. A test plan is not a list of criteria restated — it
names the checks: commands, fixtures, the surface to open, the thing to
observe.

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
- Never fork or copy the app into a project. One codebase; per-project
  differences belong in that project's `config.json` and data.

## 3.4 Many boards, one server

`node server.js` with a populated `projects.json` serves every registered
board from one port, scoped by a path prefix: `/arc/#/board`,
`/board/#/ideas`. `GET /api/projects` lists them. Data routes take the same
prefix (`/arc/api/board`), each project's directory is watched separately,
and a write reaches only the named project.

**`BOARD_DATA_DIR` is unchanged and still the contract you use**: it pins
the server to one directory, removes the prefix, and leaves every route
exactly as it was. Nothing about how you find a project's data dir changes.

## 3.5 Checking the board (`./board doctor`)

`./board doctor <project>` checks the data against the invariants this
document states — ids unique and resolving, vocabulary from config, lanes
that exist, `archived_at` only once every story is done, the dependency
guard, cycles, orphaned stories, dangling deliverable links, promoted
ideas that never closed, ready stories with no criteria, stale claims.

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
